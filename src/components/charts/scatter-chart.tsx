//-----------------------------------------------------------------------
// Scatter — one point per entity, coloured by series. Points pop in left
// → right along X; once they've landed, two dashed median lines fade in
// and split the field into quadrants.
//
//  • X goes logarithmic when it spans more than 50× (sales vary widely),
//    with hand-picked 1/2/5 ticks so labels stay readable.
//  • Hover finds the nearest point (no pixel-hunting on 3px dots): it
//    grows with a ring, the rest dim, and the tooltip shows the numbers.
//-----------------------------------------------------------------------

import { useMemo, useState, type PointerEvent } from "react";
import { motion } from "framer-motion";
import { scaleLinear, scaleLog } from "d3-scale";
import {
    AXIS_TEXT,
    ChartFrame,
    GridX,
    GridY,
    Legend,
    SERIES_BG,
    SERIES_FILL,
    SERIES_STROKE,
    approxTextWidth,
    numOf,
    seriesIndex,
    textOf,
    useBuildDelay,
    useMeasure,
    type ChartData,
    type Kind,
    type QuerySpec,
    type Size,
} from "./core";
import { useChartTooltip } from "./tooltip";
import { EASE_APPLE, markDelay, spring, useMotionOK, fast } from "@/lib/motion";
import { formatAxis, formatByKind } from "@/lib/format";
import { cn } from "@/lib/utils";

interface ScatterChartProps {
    spec: QuerySpec;
    name?: string;
    series?: string;
    x?: string;
    y?: string;
    xKind: Kind;
    yKind: Kind;
    /** Axis titles (default: the columns' display names). */
    xLabel?: string;
    yLabel?: string;
}

export function ScatterChart({ spec, name = "Name", series = "Series", x = "X", y = "Y", xKind, yKind, xLabel, yLabel }: ScatterChartProps) {
    return (
        <ChartFrame spec={spec} skeleton="scatter" keep={(r) => numOf(r, x) != null && numOf(r, y) != null}>
            {(data) => (
                <ScatterInner
                    data={data}
                    nameCol={name}
                    seriesCol={series}
                    xCol={x}
                    yCol={y}
                    xKind={xKind}
                    yKind={yKind}
                    xLabel={xLabel}
                    yLabel={yLabel}
                />
            )}
        </ChartFrame>
    );
}

// ---------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------

interface Point {
    key: string;
    name: string;
    series: string;
    si: number;
    x: number;
    y: number;
}

interface Prepared {
    points: Point[];
    series: string[];
    log: boolean;
}

function prepare(data: ChartData, nameCol: string, seriesCol: string, xCol: string, yCol: string): Prepared {
    const raw: Omit<Point, "si" | "key">[] = [];
    for (const r of data.rows) {
        const xv = numOf(r, xCol);
        const yv = numOf(r, yCol);
        if (xv == null || yv == null) continue;
        raw.push({ name: textOf(r, nameCol) || "(Blank)", series: textOf(r, seriesCol) || "(Blank)", x: xv, y: yv });
    }
    const xs = raw.map((p) => p.x);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const log = minX > 0 && maxX / minX > 50;
    // A log axis can't show x ≤ 0; drop those rather than plot them wrongly.
    const pts = log ? raw.filter((p) => p.x > 0) : raw;

    // Series coloured in order of their total X, largest first.
    const totals = new Map<string, number>();
    pts.forEach((p) => totals.set(p.series, (totals.get(p.series) ?? 0) + p.x));
    const series = [...totals.entries()].sort((a, b) => b[1] - a[1]).map(([s]) => s);
    const index = new Map(series.map((s, i) => [s, seriesIndex(i)]));

    const seen = new Map<string, number>();
    const points = pts.map((p) => {
        const base = `${p.series}␟${p.name}`;
        const n = seen.get(base) ?? 0;
        seen.set(base, n + 1);
        return { ...p, si: index.get(p.series) ?? 0, key: n ? `${base}#${n}` : base };
    });
    return { points, series, log };
}

function median(values: number[]): number {
    const s = [...values].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Keep every other tick until each has `minGap` px. */
function thin(ticks: number[], width: number, minGap: number): number[] {
    let t = ticks;
    while (t.length > 2 && width / t.length < minGap) t = t.filter((_, i) => i % 2 === 0);
    return t;
}

/** Readable log ticks: 1·2·5 per decade when they fit, else powers of ten. */
function logTicks(lo: number, hi: number, width: number): number[] {
    const all: number[] = [];
    const tens: number[] = [];
    for (let e = Math.floor(Math.log10(lo)); e <= Math.ceil(Math.log10(hi)); e++) {
        for (const m of [1, 2, 5]) {
            const v = m * 10 ** e;
            if (v < lo || v > hi) continue;
            all.push(v);
            if (m === 1) tens.push(v);
        }
    }
    if (all.length && width / all.length >= 52) return all;
    if (tens.length >= 2) return thin(tens, width, 52);
    return thin(all, width, 52);
}

// ---------------------------------------------------------------------
// Chart
// ---------------------------------------------------------------------

interface InnerProps {
    data: ChartData;
    nameCol: string;
    seriesCol: string;
    xCol: string;
    yCol: string;
    xKind: Kind;
    yKind: Kind;
    xLabel?: string;
    yLabel?: string;
}

function ScatterInner({ data, nameCol, seriesCol, xCol, yCol, xKind, yKind, xLabel, yLabel }: InnerProps) {
    const buildDelay = useBuildDelay();
    const motionOK = useMotionOK();
    const [ref, box] = useMeasure<HTMLDivElement>();

    const prepared = useMemo(() => prepare(data, nameCol, seriesCol, xCol, yCol), [data, nameCol, seriesCol, xCol, yCol]);
    const colLabel = (c: string) => data.columns.find((col) => col.name === c)?.displayName ?? c;
    const labels = {
        name: colLabel(nameCol),
        series: colLabel(seriesCol),
        x: xLabel ?? colLabel(xCol),
        y: yLabel ?? colLabel(yCol),
    };

    return (
        <div className="absolute inset-0 flex flex-col">
            <motion.div
                initial={motionOK ? { opacity: 0, y: -4 } : false}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: buildDelay, duration: fast(0.4), ease: EASE_APPLE }}
                className="shrink-0 pb-xs"
            >
                <Legend items={prepared.series.map((s, i) => ({ label: s, swatch: SERIES_BG[seriesIndex(i)] }))} />
            </motion.div>
            <div ref={ref} className="relative min-h-0 flex-1">
                {box.width > 0 && box.height > 0 && (
                    <ScatterPlot
                        prepared={prepared}
                        size={box}
                        labels={labels}
                        xKind={xKind}
                        yKind={yKind}
                        buildDelay={buildDelay}
                        motionOK={motionOK}
                    />
                )}
            </div>
        </div>
    );
}

interface PlotProps {
    prepared: Prepared;
    size: Size;
    labels: { name: string; series: string; x: string; y: string };
    xKind: Kind;
    yKind: Kind;
    buildDelay: number;
    motionOK: boolean;
}

/** Total stagger for the point build (s). */
const STAGGER = 1.0;
/** Reduced motion: data changes land without a spring. */
const INSTANT = { duration: 0 } as const;

function ScatterPlot({ prepared, size, labels, xKind, yKind, buildDelay, motionOK }: PlotProps) {
    const tooltip = useChartTooltip();
    const [hot, setHot] = useState<number | null>(null);
    const { points, log } = prepared;
    const morph = motionOK ? spring.smooth : INSTANT;

    // ---- scales ----
    const top = 22;
    const right = 10;
    const bottom = 34;
    const plotH = Math.max(24, size.height - top - bottom);
    const plotBottom = top + plotH;

    const ys = points.map((p) => p.y);
    let yLo = Math.min(...ys);
    let yHi = Math.max(...ys);
    if (yLo === yHi) {
        const pad = Math.abs(yLo) * 0.1 || 1;
        yLo -= pad;
        yHi += pad;
    }
    const yCount = Math.max(2, Math.min(6, Math.floor(plotH / 40)));
    const yScale = scaleLinear().domain([yLo, yHi]).range([plotBottom, top]).nice(yCount);
    const yTicks = yScale.ticks(yCount);
    const left = Math.max(28, Math.ceil(Math.max(...yTicks.map((t) => approxTextWidth(formatAxis(yKind, t))))) + 12);
    const plotW = Math.max(24, size.width - left - right);

    const xs = points.map((p) => p.x);
    let xLo = Math.min(...xs);
    let xHi = Math.max(...xs);
    let xScale: (v: number) => number;
    let xTicks: number[];
    if (log) {
        xLo /= 1.35;
        xHi *= 1.35;
        const s = scaleLog().domain([xLo, xHi]).range([left, left + plotW]);
        xScale = (v) => s(v);
        xTicks = logTicks(xLo, xHi, plotW);
    } else {
        if (xLo === xHi) {
            const pad = Math.abs(xLo) * 0.1 || 1;
            xLo -= pad;
            xHi += pad;
        }
        const count = Math.max(2, Math.min(8, Math.floor(plotW / 80)));
        const s = scaleLinear().domain([xLo, xHi]).range([left, left + plotW]).nice(count);
        xScale = (v) => s(v);
        xTicks = s.ticks(count);
    }

    const r = Math.min(5, Math.max(3, Math.min(plotW, plotH) / 70));

    // Screen positions + a left → right build order.
    const placed = points.map((p) => ({ ...p, px: xScale(p.x), py: yScale(p.y) }));
    const order = placed.map((_, i) => i).sort((a, b) => placed[a].x - placed[b].x);
    const delays = new Array<number>(placed.length);
    order.forEach((idx, rank) => {
        delays[idx] = buildDelay + markDelay(rank, placed.length, STAGGER, 0.07);
    });
    const landed = buildDelay + Math.min(STAGGER, placed.length * 0.07) + 0.25;

    const medX = median(points.map((p) => p.x));
    const medY = median(ys);
    const mx = xScale(medX);
    const my = yScale(medY);

    // ---- hover: nearest point within reach ----
    const reach = Math.max(14, r * 3);
    const onMove = (e: PointerEvent<SVGRectElement>) => {
        const box = e.currentTarget.ownerSVGElement?.getBoundingClientRect();
        if (!box) return;
        const lx = e.clientX - box.left;
        const ly = e.clientY - box.top;
        let best = -1;
        let bestD = reach * reach;
        placed.forEach((p, i) => {
            const d = (p.px - lx) ** 2 + (p.py - ly) ** 2;
            if (d < bestD) {
                bestD = d;
                best = i;
            }
        });
        if (best < 0) {
            setHot(null);
            tooltip.hide();
            return;
        }
        const p = placed[best];
        setHot(best);
        tooltip.show(e, {
            title: p.name,
            rows: [
                { label: labels.series, value: p.series, swatch: SERIES_BG[p.si] },
                { label: labels.x, value: formatByKind(xKind, p.x) },
                { label: labels.y, value: formatByKind(yKind, p.y) },
            ],
        });
    };
    const onLeave = () => {
        setHot(null);
        tooltip.hide();
    };

    const hp = hot != null && hot < placed.length ? placed[hot] : null;
    const medianCaptionLeft = mx > left + plotW - 48;

    return (
        <svg
            width={size.width}
            height={size.height}
            role="img"
            aria-label={`Scatter of ${points.length} ${labels.name} by ${labels.x} and ${labels.y}, coloured by ${labels.series}${log ? " (log scale on X)" : ""}`}
            className="absolute inset-0 block"
        >
            <GridY ticks={yTicks} y={yScale} x0={left} x1={left + plotW} kind={yKind} />
            <GridX ticks={xTicks} x={xScale} y0={top} y1={plotBottom} kind={xKind} />

            {/* Axis titles: y above its labels, x under its labels at the right. */}
            <text x={0} y={10} className={cn(AXIS_TEXT, "font-medium")}>
                {labels.y}
            </text>
            <text x={left + plotW} y={size.height - 3} textAnchor="end" className={cn(AXIS_TEXT, "font-medium")}>
                {labels.x}
                {log ? " (log)" : ""}
            </text>

            {/* Median lines — fade in once the points have landed. */}
            <motion.g
                aria-hidden
                initial={motionOK ? { opacity: 0 } : false}
                animate={{ opacity: 1 }}
                transition={{ delay: landed, duration: fast(0.5), ease: EASE_APPLE }}
            >
                <line x1={mx} x2={mx} y1={top} y2={plotBottom} className="stroke-input" strokeWidth={1} strokeDasharray="4 4" />
                <line x1={left} x2={left + plotW} y1={my} y2={my} className="stroke-input" strokeWidth={1} strokeDasharray="4 4" />
                <text
                    x={medianCaptionLeft ? mx - 4 : mx + 4}
                    y={top + 9}
                    textAnchor={medianCaptionLeft ? "end" : "start"}
                    className="fill-muted-foreground text-[length:var(--text-100)]"
                >
                    median
                </text>
                <text x={left + plotW - 2} y={my - 4} textAnchor="end" className="fill-muted-foreground text-[length:var(--text-100)]">
                    median
                </text>
            </motion.g>

            {/* Points */}
            <g aria-hidden className="transition-opacity duration-200" style={{ opacity: hp ? 0.3 : 1 }}>
                {placed.map((p, i) => (
                    <motion.circle
                        key={p.key}
                        r={r}
                        className={cn(SERIES_FILL[p.si], "stroke-card")}
                        strokeWidth={0.75}
                        initial={motionOK ? { scale: 0, opacity: 0, cx: p.px, cy: p.py } : false}
                        animate={{ scale: 1, opacity: 0.9, cx: p.px, cy: p.py }}
                        transition={{
                            scale: { ...spring.grow, delay: delays[i] },
                            opacity: { duration: fast(0.2), delay: delays[i] },
                            cx: morph,
                            cy: morph,
                        }}
                    />
                ))}
            </g>

            {/* Hovered point: grown, ringed, above the rest. */}
            {hp && (
                <g aria-hidden pointerEvents="none">
                    <circle cx={hp.px} cy={hp.py} r={r * 1.6 + 3.5} className={cn("fill-none", SERIES_STROKE[hp.si])} strokeWidth={1.25} />
                    <motion.circle
                        key={hp.key}
                        cx={hp.px}
                        cy={hp.py}
                        r={r * 1.6}
                        className={cn(SERIES_FILL[hp.si], "stroke-card")}
                        strokeWidth={1}
                        initial={{ scale: 0.625 }}
                        animate={{ scale: 1 }}
                        transition={spring.snappy}
                    />
                </g>
            )}

            <rect
                x={left}
                y={top}
                width={plotW}
                height={plotH}
                className="fill-transparent"
                onPointerMove={onMove}
                onPointerLeave={onLeave}
            />
        </svg>
    );
}

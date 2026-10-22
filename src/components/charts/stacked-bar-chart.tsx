//-----------------------------------------------------------------------
// StackedBarChart — vertical stacked columns: a measure by one category,
// split into segments by a second (e.g. Sales by Region × Category, or
// Growing / Declining product counts).
//
//  • Columns are ordered by total (desc); series by overall total (desc),
//    or by `seriesTone` key order when given (Growing: up, Declining: down).
//  • Each column builds bottom → up: every segment rises from the zero
//    baseline on spring.grow, segment j of column i waiting
//    buildDelay + markDelay(i, n) + j·0.08 — so the stack fills in colour
//    by colour, column by column, left → right.
//  • The column's rounded silhouette is a clip path that grows with its
//    first segment, so segments stay square where they meet.
//  • Negative values (defensive) stack downward from zero.
//  • Small HTML legend on top; the svg takes the remaining height.
//  • Tooltip lists every series (tiny segments stay discoverable) plus the
//    total; hovering a column dims the others.
//-----------------------------------------------------------------------

import { useEffect, useId, useMemo, useState } from "react";
import { AnimatePresence, motion, type Transition } from "framer-motion";
import { scaleBand, scaleLinear } from "d3-scale";
import {
    BandLabelsX,
    ChartFrame,
    GridY,
    Legend,
    SERIES_BG,
    SERIES_FILL,
    approxTextWidth,
    numOf,
    seriesIndex,
    textOf,
    useBuildDelay,
    useMeasure,
    type ChartData,
    type Kind,
    type QuerySpec,
    type Row,
    type Size,
} from "./core";
import { useChartTooltip, type TooltipContent } from "./tooltip";
import { markDelay, spring, useMotionOK, fast } from "@/lib/motion";
import { formatAxis, formatByKind } from "@/lib/format";

interface StackedBarChartProps {
    spec: QuerySpec;
    /** Column category (cleaned metadata name). */
    cat?: string;
    /** Segment series (cleaned metadata name). */
    series?: string;
    /** Value column (cleaned metadata name). */
    val?: string;
    kind: Kind;
    /** Optional fixed colours per series value, e.g. { Growing: "up", Declining: "down" } -> fill-up/bg-up classes. Otherwise series are coloured SERIES_FILL by descending overall total. */
    seriesTone?: Record<string, "up" | "down">;
}

export function StackedBarChart(props: StackedBarChartProps) {
    const val = props.val ?? "Val";
    return (
        <ChartFrame spec={props.spec} skeleton="columns" keep={(r) => numOf(r, val) != null}>
            {(data) => <StackedPlot {...props} data={data} />}
        </ChartFrame>
    );
}

// ---------------------------------------------------------------------
// Model + layout
// ---------------------------------------------------------------------

const PAD = 0.28; // band padding (inner = outer)
const MAX_COL = 56; // column width cap
const AXIS_H = 20; // category labels under the plot
const SEG_STEP = fast(0.08); // seconds between segments of one column

interface SeriesInfo {
    key: string;
    fill: string;
    bg: string;
}

interface Segment {
    series: string;
    /** Stacked extent in value space. */
    lo: number;
    hi: number;
}

interface Column {
    key: string;
    total: number;
    /** Top of the positive stack / bottom of the negative stack. */
    pos: number;
    neg: number;
    segs: Segment[];
    cells: Map<string, number>;
}

const labelOf = (row: Row, key: string) => {
    const t = textOf(row, key);
    return t.trim() === "" ? "(Blank)" : t;
};

function buildModel(rows: Row[], cat: string, series: string, val: string, tone?: Record<string, "up" | "down">) {
    const cells = new Map<string, Map<string, number>>();
    const sTotals = new Map<string, number>();
    for (const r of rows) {
        const v = numOf(r, val);
        if (v == null) continue;
        const c = labelOf(r, cat);
        const s = labelOf(r, series);
        let m = cells.get(c);
        if (!m) cells.set(c, (m = new Map()));
        m.set(s, (m.get(s) ?? 0) + v);
        sTotals.set(s, (sTotals.get(s) ?? 0) + v);
    }

    // Series: toned keys first (in the given order), the rest by total desc.
    const byTotal = [...sTotals.keys()].sort((a, b) => (sTotals.get(b) ?? 0) - (sTotals.get(a) ?? 0));
    const toned = tone ? Object.keys(tone).filter((k) => sTotals.has(k)) : [];
    let free = 0;
    const seriesList: SeriesInfo[] = [...toned, ...byTotal.filter((k) => !toned.includes(k))].map((key) => {
        const t = tone?.[key];
        if (t) return { key, fill: t === "up" ? "fill-up" : "fill-down", bg: t === "up" ? "bg-up" : "bg-down" };
        const i = seriesIndex(free++);
        return { key, fill: SERIES_FILL[i], bg: SERIES_BG[i] };
    });

    const columns: Column[] = [...cells.entries()]
        .map(([key, m]) => {
            let pos = 0;
            let neg = 0;
            const segs: Segment[] = [];
            for (const s of seriesList) {
                const v = m.get(s.key);
                if (v == null || v === 0) continue;
                if (v > 0) {
                    segs.push({ series: s.key, lo: pos, hi: pos + v });
                    pos += v;
                } else {
                    segs.push({ series: s.key, lo: neg + v, hi: neg });
                    neg += v;
                }
            }
            return { key, total: pos + neg, pos, neg, segs, cells: m };
        })
        .sort((a, b) => b.total - a.total);

    return { seriesList, columns };
}

/**
 * Value scale (always spans zero) niced for ~4 ticks, then thinned to every
 * other step (zero survives) until ≤ 5 ticks sit ≥ 22px apart; plus the
 * left gutter the tick labels need.
 */
function valueAxis(columns: Column[], plotH: number, top: number, kind: Kind) {
    const lo = Math.min(0, ...columns.map((c) => c.neg));
    const hi0 = Math.max(0, ...columns.map((c) => c.pos));
    const hi = lo === hi0 ? 1 : hi0;
    const scale = scaleLinear().domain([lo, hi]).nice(4);
    let ticks = scale.ticks(4);
    while (ticks.length > 2 && (ticks.length > 5 || plotH / (ticks.length - 1) < 22)) {
        const step = ticks[1] - ticks[0];
        ticks = ticks.filter((t) => Math.abs(Math.round(t / step)) % 2 === 0);
    }
    scale.range([top + plotH, top]);
    const gutter = Math.round(Math.max(28, Math.max(...ticks.map((t) => approxTextWidth(formatAxis(kind, t)))) + 12));
    return { scale, ticks, gutter };
}

/** Short stable id fragment for a category (clip-path ids). */
function hashKey(s: string): string {
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36);
}

// ---------------------------------------------------------------------
// Plot
// ---------------------------------------------------------------------

function StackedPlot({
    data,
    cat = "Cat",
    series = "Series",
    val = "Val",
    kind,
    seriesTone,
}: StackedBarChartProps & { data: ChartData }) {
    const motionOK = useMotionOK();
    const buildDelay = useBuildDelay();
    const [ref, box] = useMeasure<HTMLDivElement>();

    const { seriesList, columns } = useMemo(
        () => buildModel(data.rows, cat, series, val, seriesTone),
        [data.rows, cat, series, val, seriesTone],
    );

    // Build ends after the last column's top segment has started + ~0.5s.
    const [buildEnd] = useState(() => {
        const n = columns.length;
        const maxSegs = Math.max(1, ...columns.map((c) => c.segs.length));
        return buildDelay + markDelay(Math.max(0, n - 1), n) + (maxSegs - 1) * SEG_STEP + 0.5;
    });
    const [built, setBuilt] = useState(!motionOK);
    useEffect(() => {
        if (built) return;
        const id = window.setTimeout(() => setBuilt(true), buildEnd * 1000);
        return () => window.clearTimeout(id);
    }, [built, buildEnd]);

    const colName = (name: string) => data.columns.find((c) => c.name === name)?.displayName || name;
    const top = columns[0];
    const aria = `Stacked column chart of ${colName(val)} by ${colName(cat)} and ${colName(series)}; largest ${top.key} ${formatByKind(kind, top.total)}`;

    return (
        <div className="flex h-full w-full flex-col">
            <motion.div
                className="shrink-0 pb-xs"
                initial={motionOK ? { opacity: 0, y: 4 } : false}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...spring.smooth, delay: buildDelay }}
            >
                <Legend items={seriesList.map((s) => ({ label: s.key, swatch: s.bg }))} />
            </motion.div>
            <div ref={ref} className="relative min-h-0 flex-1">
                {box.width > 0 && box.height > 0 && (
                    <StackedSvg
                        size={box}
                        columns={columns}
                        seriesList={seriesList}
                        kind={kind}
                        aria={aria}
                        motionOK={motionOK}
                        built={built}
                        buildDelay={buildDelay}
                    />
                )}
            </div>
        </div>
    );
}

interface StackedSvgProps {
    size: Size;
    columns: Column[];
    seriesList: SeriesInfo[];
    kind: Kind;
    aria: string;
    motionOK: boolean;
    built: boolean;
    buildDelay: number;
}

function StackedSvg({ size, columns, seriesList, kind, aria, motionOK, built, buildDelay }: StackedSvgProps) {
    const tip = useChartTooltip();
    const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
    const [hover, setHover] = useState<string | null>(null);
    // Unmounting under the pointer gets no pointerleave — clear the tooltip.
    useEffect(() => () => tip.hide(), [tip]);

    const L = useMemo(() => {
        const mt = 8;
        const plotH = Math.max(12, size.height - mt - AXIS_H);
        const { scale, ticks, gutter } = valueAxis(columns, plotH, mt, kind);
        const right = size.width - 4;
        const natural = ((right - gutter) * (1 - PAD)) / (columns.length + PAD);
        const pad = natural > MAX_COL ? (right - gutter - MAX_COL * columns.length) / (right - gutter + MAX_COL) : PAD;
        const band = scaleBand<string>()
            .domain(columns.map((c) => c.key))
            .range([gutter, right])
            .padding(pad);
        return { ys: scale, ticks, band, left: gutter, right, top: mt, bottom: mt + plotH };
    }, [size, columns, kind]);

    const { ys, band } = L;
    const n = columns.length;
    const bw = band.bandwidth();
    const step = band.step();
    const y0 = ys(0);
    const rx = Math.min(5, bw / 2);
    const fillOf = new Map(seriesList.map((s) => [s.key, s.fill]));
    const active = hover != null && columns.some((c) => c.key === hover) ? hover : null;

    const segT = (i: number, j: number): Transition =>
        !motionOK
            ? { duration: 0 }
            : built
              ? { ...spring.smooth, delay: markDelay(i, n, fast(0.18), fast(0.03)) }
              : { ...spring.grow, delay: buildDelay + markDelay(i, n) + j * SEG_STEP };

    const tipFor = (c: Column): TooltipContent => ({
        title: c.key,
        rows: [
            ...seriesList.map((s) => ({ label: s.key, value: formatByKind(kind, c.cells.get(s.key) ?? null), swatch: s.bg })),
            { label: "Total", value: formatByKind(kind, c.total) },
        ],
    });

    return (
        <svg
            width={size.width}
            height={size.height}
            role="img"
            aria-label={aria}
            className="absolute inset-0 block select-none"
        >
            <GridY ticks={L.ticks} y={ys} x0={L.left} x1={L.right} kind={kind} zero={ys.domain()[0] < 0} />

            <AnimatePresence>
                {columns.map((c, i) => {
                    const x = band(c.key) ?? 0;
                    const colTop = ys(c.pos);
                    const colBottom = ys(c.neg);
                    const clipId = `${uid}-c${hashKey(c.key)}`;
                    const grow = { attrX: x, attrY: y0, width: bw, height: 0 };
                    return (
                        <motion.g
                            key={c.key}
                            animate={{ opacity: active ? (c.key === active ? 1 : 0.4) : 1 }}
                            exit={{ opacity: 0, transition: { duration: fast(0.25) } }}
                            transition={{ duration: active ? 0.2 : 0.4 }}
                        >
                            <clipPath id={clipId}>
                                <motion.rect
                                    rx={rx}
                                    initial={motionOK ? { ...grow } : false}
                                    animate={{ attrX: x, attrY: colTop, width: bw, height: Math.max(0, colBottom - colTop) }}
                                    transition={segT(i, 0)}
                                />
                            </clipPath>
                            <g clipPath={`url(#${clipId})`}>
                                <AnimatePresence>
                                    {c.segs.map((s, j) => (
                                        <motion.rect
                                            key={s.series}
                                            className={fillOf.get(s.series)}
                                            initial={motionOK ? { ...grow } : false}
                                            animate={{ attrX: x, attrY: ys(s.hi), width: bw, height: Math.max(0, ys(s.lo) - ys(s.hi)) }}
                                            exit={{ opacity: 0, transition: { duration: fast(0.25) } }}
                                            transition={segT(i, j)}
                                        />
                                    ))}
                                </AnimatePresence>
                            </g>
                        </motion.g>
                    );
                })}
            </AnimatePresence>

            <BandLabelsX labels={columns.map((c) => c.key)} x={(k) => band(k) ?? 0} bandwidth={bw} y={L.bottom + 14} />

            {/* Hit areas — contiguous per column so the tooltip glides across */}
            <g
                onPointerLeave={() => {
                    setHover(null);
                    tip.hide();
                }}
            >
                {columns.map((c) => (
                    <rect
                        key={c.key}
                        className="fill-transparent"
                        x={(band(c.key) ?? 0) - (step - bw) / 2}
                        y={L.top}
                        width={step}
                        height={L.bottom - L.top}
                        onPointerMove={(e) => {
                            setHover(c.key);
                            tip.show(e, tipFor(c));
                        }}
                    />
                ))}
            </g>
        </svg>
    );
}

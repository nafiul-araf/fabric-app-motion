//-----------------------------------------------------------------------
// ComboChart — bars on the left axis, a line on the right, one category
// band per row (query order kept).
//
//  • Build: bars grow out of the baseline one at a time, THEN the line
//    draws across them (pathLength) and each dot pops in as the line's
//    tip passes it.
//  • The right axis is fitted to the left axis' gridlines (same number of
//    steps), so the two share one set of hairlines; it always includes 0
//    and handles all-negative values.
//  • Hover anywhere in a band (tiny bars stay easy to hit): that bar stays
//    lit, the rest dim, and the glass tooltip shows both values.
//  • Data change: bars spring to their new heights keyed by category; the
//    line re-draws.
//  • Click a band (Enter/Space on a focused one) to cross-filter the page;
//    Ctrl/⌘/Shift adds. Selected bars and dots pop with a ripple, the rest
//    fade, their axis labels go bold; clicking blank space clears.
//-----------------------------------------------------------------------

import {
    useEffect,
    useRef,
    useState,
    type KeyboardEvent as ReactKeyboardEvent,
    type MouseEvent as ReactMouseEvent,
    type PointerEvent as ReactPointerEvent,
} from "react";
import { motion, type Transition } from "framer-motion";
import { scaleBand, scaleLinear } from "d3-scale";
import { curveMonotoneX, line as d3Line } from "d3-shape";
import {
    BandLabelsX,
    ChartFrame,
    GridY,
    Legend,
    SERIES_BG,
    SERIES_FILL,
    SERIES_STROKE,
    approxTextWidth,
    numOf,
    textOf,
    truncateLabel,
    useBuildDelay,
    useMeasure,
    type QuerySpec,
    type Row,
} from "./core";
import { useSelection } from "./cross-filter";
import { useChartTooltip } from "./tooltip";
import { EASE_OUT, markDelay, spring, useMotionOK, fast } from "@/lib/motion";
import { formatAxis, formatByKind, type Kind } from "@/lib/format";
import { cn } from "@/lib/utils";

interface ComboChartProps {
    spec: QuerySpec;
    /** Category column, default "Cat". */
    cat?: string;
    bar: { key: string; label: string; kind: Kind };
    /** `domain` pins the right axis (e.g. [0, 1]); otherwise it fits the data and includes 0. */
    line: { key: string; label: string; kind: Kind; domain?: [number, number] };
}

// ---------------------------------------------------------------------
// Timing & layout
// ---------------------------------------------------------------------

/** Seconds for the line to draw. */
const LINE_DRAW = fast(0.8);
/** Pause between the last bar starting and the line starting. */
const LINE_GAP = fast(0.1);
/** Line start after a data change (bars spring first). */
const REDRAW_DELAY = fast(0.15);
const M_TOP = 12;
const M_BOTTOM = 24;
const BAR_SERIES = 0;
const LINE_SERIES = 2;
/** Dot radius; hovered; selected (×1.5). */
const DOT_R = 3.25;
const DOT_HOVER_R = 4.75;
const DOT_SEL_R = DOT_R * 1.5;
/** Cross-filter ripple length (s). */
const RIPPLE_S = fast(0.65);

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

/** [min, max] with 0 always included; [0, 1] when empty or flat. */
function zeroDomain(vals: number[]): [number, number] {
    const lo = Math.min(0, ...vals);
    const hi = Math.max(0, ...vals);
    return lo === hi ? [0, 1] : [lo, hi];
}

/**
 * A nice domain covering [lo, hi] in exactly `k` equal steps, so the
 * right axis' ticks land on the left axis' gridlines.
 */
function alignedDomain([lo, hi]: [number, number], k: number): [number, number] {
    const e0 = Math.floor(Math.log10((hi - lo) / k));
    for (let e = e0; e < e0 + 3; e++) {
        for (const m of [1, 2, 2.5, 5]) {
            const step = m * 10 ** e;
            const start = Math.floor(lo / step + 1e-9) * step;
            if (start + k * step >= hi - step * 1e-9) return [start, start + k * step];
        }
    }
    return [lo, hi];
}

/** Strip float noise from a computed tick value (snaps near-zero to 0). */
const tidy = (v: number, step: number) => (Math.abs(v) < Math.abs(step) * 1e-9 ? 0 : +v.toPrecision(12));

/** Fewer gridlines on short plots (~3 under a 200px-tall chart). */
const tickCountFor = (plotH: number) => (plotH < 150 ? 2 : plotH < 300 ? 3 : 4);

/** Horizontal room for a column of axis labels (+ GridY's 8px gap). */
const labelSpace = (labels: string[]) => Math.max(12, ...labels.map((l) => approxTextWidth(l))) + 14;

const r2 = (v: number) => Math.round(v * 100) / 100;

/**
 * Bar from `base` to `end` with rounded corners on the value end only.
 * Always the same command list (quadratic corners, no arc flags), so the
 * spring can interpolate between any two bars, including across zero.
 */
function barPath(x: number, w: number, base: number, end: number, r: number): string {
    const dir = end <= base ? 1 : -1; // 1 = grows up the screen
    const rr = Math.min(r, Math.abs(base - end), w / 2);
    const side = end + dir * rr;
    const [x0, x1, b, e, s] = [r2(x), r2(x + w), r2(base), r2(end), r2(side)];
    return `M${x0},${b}L${x0},${s}Q${x0},${e} ${r2(x + rr)},${e}L${r2(x + w - rr)},${e}Q${x1},${e} ${x1},${s}L${x1},${b}Z`;
}

/** Time fraction (0–1) at which the EASE_OUT curve reaches progress `f`. */
function easeOutTimeAt(f: number): number {
    const [x1, y1, x2, y2] = EASE_OUT;
    const bz = (t: number, a: number, b: number) => 3 * (1 - t) * (1 - t) * t * a + 3 * (1 - t) * t * t * b + t * t * t;
    let lo = 0;
    let hi = 1;
    for (let n = 0; n < 24; n++) {
        const mid = (lo + hi) / 2;
        if (bz(mid, y1, y2) < f) lo = mid;
        else hi = mid;
    }
    return bz((lo + hi) / 2, x1, x2);
}

/** Stable React keys from category labels (duplicates get a suffix). */
function uniqueKeys(labels: string[]): string[] {
    const seen = new Map<string, number>();
    return labels.map((l) => {
        const n = seen.get(l) ?? 0;
        seen.set(l, n + 1);
        return n ? `${l}#${n}` : l;
    });
}

/** Times `on` has turned true since mount — keys a one-shot pop per selection (none on mount). */
function usePopCount(on: boolean): number {
    const [was, setWas] = useState(on);
    const [count, setCount] = useState(0);
    if (on !== was) {
        setWas(on);
        if (on) setCount((c) => c + 1);
    }
    return count;
}

/** Opacity tween: the cross-filter highlight eases a touch slower than hover; instant without motion. */
function fadeFor(motionOK: boolean, filtering: boolean): Transition {
    return motionOK ? { duration: filtering ? 0.35 : 0.2, ease: EASE_OUT } : { duration: 0 };
}

interface LinePt {
    i: number;
    x: number;
    v: number | null;
}

// ---------------------------------------------------------------------
// Chart
// ---------------------------------------------------------------------

export function ComboChart({ spec, ...rest }: ComboChartProps) {
    return (
        <ChartFrame spec={spec} skeleton="columns">
            {(data) => (
                <ComboPlot
                    {...rest}
                    rows={data.rows}
                    dimLabel={data.columns.find((c) => c.name === (rest.cat ?? "Cat"))?.displayName ?? "category"}
                />
            )}
        </ChartFrame>
    );
}

interface PlotProps extends Omit<ComboChartProps, "spec"> {
    rows: Row[];
    dimLabel: string;
}

/** Legend row on top; the svg takes whatever height is left. */
function ComboPlot({ rows, cat = "Cat", bar, line, dimLabel }: PlotProps) {
    const [boxRef, box] = useMeasure<HTMLDivElement>();
    return (
        <div className="flex h-full w-full flex-col">
            <Legend
                className="shrink-0 justify-end pb-s"
                items={[
                    { label: bar.label, swatch: SERIES_BG[BAR_SERIES] },
                    { label: line.label, swatch: SERIES_BG[LINE_SERIES], line: true },
                ]}
            />
            <div ref={boxRef} className="relative min-h-0 flex-1">
                {box.width > 0 && box.height > 0 && (
                    <ComboSvg rows={rows} cat={cat} bar={bar} line={line} dimLabel={dimLabel} width={box.width} height={box.height} />
                )}
            </div>
        </div>
    );
}

interface SvgProps extends Required<Pick<PlotProps, "rows" | "cat" | "bar" | "line" | "dimLabel">> {
    width: number;
    height: number;
}

function ComboSvg({ rows, cat, bar, line, dimLabel, width, height }: SvgProps) {
    const buildDelay = useBuildDelay();
    const motionOK = useMotionOK();
    const tooltip = useChartTooltip();
    const sel = useSelection();
    const [hover, setHover] = useState<number | null>(null);
    const hovering = useRef(false);

    const n = rows.length;
    const cats = rows.map((r) => textOf(r, cat) || "(Blank)");
    const keys = uniqueKeys(cats);
    const barVals = rows.map((r) => numOf(r, bar.key));
    const lineVals = rows.map((r) => numOf(r, line.key));
    const present = (vals: (number | null)[]) => vals.filter((v): v is number => v != null);

    // ---- Build choreography: bars, then the line ----------------------
    const [buildEnd] = useState(() => buildDelay + markDelay(Math.max(n - 1, 0), n) + LINE_GAP + LINE_DRAW);
    const [settled, setSettled] = useState(false);
    const live = settled || !motionOK;
    useEffect(() => {
        if (!motionOK) return;
        const t = window.setTimeout(() => setSettled(true), (buildEnd + 0.2) * 1000);
        return () => window.clearTimeout(t);
    }, [motionOK, buildEnd]);
    const lineDelay = live ? REDRAW_DELAY : buildDelay + markDelay(Math.max(n - 1, 0), n) + LINE_GAP;

    // Hide the shared tooltip if the plot unmounts while hovered.
    useEffect(
        () => () => {
            if (hovering.current) tooltip.hide();
        },
        [tooltip],
    );

    // ---- Axes ---------------------------------------------------------
    const plotH = Math.max(1, height - M_TOP - M_BOTTOM);
    const count = tickCountFor(plotH);
    const yL = scaleLinear().domain(zeroDomain(present(barVals))).range([plotH, 0]).nice(count);
    const lTicks = yL.ticks(count);
    const k = Math.max(1, lTicks.length - 1);
    const rDom: [number, number] = line.domain ?? alignedDomain(zeroDomain(present(lineVals)), k);
    // Right ticks span exactly the left tick rows, so both share one set of gridlines.
    const yR = scaleLinear()
        .domain(rDom)
        .range(lTicks.length > 1 ? [yL(lTicks[0]), yL(lTicks[lTicks.length - 1])] : [plotH, 0])
        .clamp(line.domain != null);
    const rStep = (rDom[1] - rDom[0]) / k;
    const rTicks = Array.from({ length: k + 1 }, (_, i) => tidy(rDom[0] + rStep * i, rStep));

    const left = labelSpace(lTicks.map((t) => formatAxis(bar.kind, t)));
    const right = labelSpace(rTicks.map((t) => formatAxis(line.kind, t)));
    const plotW = Math.max(1, width - left - right);

    const xb = scaleBand<number>()
        .domain(rows.map((_, i) => i))
        .range([0, plotW])
        .padding(0.3);
    const bw = xb.bandwidth();
    const step = xb.step();
    const bx = (i: number) => xb(i) ?? 0;
    const firstIndex = new Map<string, number>();
    cats.forEach((c, i) => {
        if (!firstIndex.has(c)) firstIndex.set(c, i);
    });

    const [d0, d1] = yL.domain();
    const base = yL(Math.min(Math.max(0, d0), d1));
    const radius = Math.min(6, bw / 2);

    // ---- Line + dot timing (each dot pops as the tip passes it) ---------
    const pts: LinePt[] = lineVals.map((v, i) => ({ i, x: bx(i) + bw / 2, v }));
    const lineD = d3Line<LinePt>()
        .defined((p) => p.v != null)
        .x((p) => p.x)
        .y((p) => yR(p.v ?? 0))
        .curve(curveMonotoneX)(pts);
    const drawn = pts.filter((p) => p.v != null);
    const along: number[] = [];
    drawn.forEach((p, j) => {
        const prev = drawn[j - 1];
        along.push(prev ? along[j - 1] + Math.hypot(p.x - prev.x, yR(p.v ?? 0) - yR(prev.v ?? 0)) : 0);
    });
    const total = along[along.length - 1] || 1;
    // Re-keying on the values makes the line re-draw when the data changes (not on resize).
    const lineKey = pts.map((p) => `${keys[p.i]}=${p.v ?? ""}`).join("|");

    // ---- Hover ----------------------------------------------------------
    const onMove = (i: number, e: ReactPointerEvent<SVGRectElement>) => {
        hovering.current = true;
        setHover(i);
        tooltip.show(e, {
            title: cats[i],
            rows: [
                { label: bar.label, value: formatByKind(bar.kind, barVals[i]), swatch: SERIES_BG[BAR_SERIES] },
                { label: line.label, value: formatByKind(line.kind, lineVals[i]), swatch: SERIES_BG[LINE_SERIES] },
            ],
        });
    };
    const onLeave = () => {
        hovering.current = false;
        setHover(null);
        tooltip.hide();
    };

    // ---- Cross-filter ---------------------------------------------------
    // A band toggles its category (Ctrl/⌘/Shift adds); blank space clears.
    const filtering = sel.active;
    const on = rows.map((r) => sel.isSelected(r));
    const pick = (i: number, e: ReactMouseEvent | ReactKeyboardEvent) => {
        e.stopPropagation();
        sel.toggle(rows[i], e);
    };
    const pickKey = (i: number, e: ReactKeyboardEvent) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        e.preventDefault();
        pick(i, e);
    };
    // Selected categories' axis labels are redrawn bold over BandLabelsX's, so mirror
    // its thinning (every k-th label) and truncation.
    const labelX = (l: string) => bx(firstIndex.get(l) ?? 0);
    const labelRoom = Math.max(n > 1 ? Math.abs(labelX(cats[1]) - labelX(cats[0])) : bw, bw, 1);
    const longest = Math.max(...cats.map((l) => approxTextWidth(l)), 1);
    const labelEvery = Math.max(1, Math.ceil((Math.min(longest, 90) + 8) / labelRoom));
    const labelChars = Math.max(3, Math.floor((labelRoom * labelEvery - 6) / (11 * 0.56)));

    const ariaLabel =
        `${bar.label} (bars) and ${line.label} (line) by ${dimLabel}, ${n} ${n === 1 ? "item" : "items"}: ` +
        `${cats.slice(0, 3).join(", ")}${n > 3 ? ", …" : ""}.`;

    return (
        <svg
            width={width}
            height={height}
            // Selectable: a group, so the band buttons inside stay in the accessibility tree.
            role={sel.enabled ? "group" : "img"}
            aria-label={ariaLabel}
            className="absolute inset-0 block"
            onClick={filtering ? () => sel.clear() : undefined}
        >
            <g transform={`translate(${left},${M_TOP})`}>
                <GridY ticks={lTicks} y={yL} x0={0} x1={plotW} kind={bar.kind} zero={d0 < 0} />
                {/* Zero-length lines: right labels only, on the left axis' gridlines. */}
                <GridY ticks={rTicks} y={yR} x0={plotW} x1={plotW} kind={line.kind} labels="right" />
                <BandLabelsX labels={cats} x={labelX} bandwidth={bw} y={plotH + 17} />
                {filtering && (
                    <g aria-hidden className="pointer-events-none">
                        {cats.map((l, i) =>
                            on[i] && i % labelEvery === 0 ? (
                                // A card-coloured halo (stroke under fill) hides the muted label beneath.
                                <motion.text
                                    key={keys[i]}
                                    x={labelX(l) + bw / 2}
                                    y={plotH + 17}
                                    textAnchor="middle"
                                    strokeWidth={4}
                                    strokeLinejoin="round"
                                    paintOrder="stroke"
                                    className="tabular fill-foreground stroke-card text-[length:var(--text-100)] font-semibold"
                                    initial={motionOK ? { opacity: 0 } : false}
                                    animate={{ opacity: 1 }}
                                    transition={{ duration: fast(0.2), ease: EASE_OUT }}
                                >
                                    {truncateLabel(l, labelChars)}
                                </motion.text>
                            ) : null,
                        )}
                    </g>
                )}

                <g aria-hidden>
                    {rows.map((_, i) => {
                        const v = barVals[i];
                        const end = v == null ? base : yL(v);
                        return (
                            <ComboBar
                                key={keys[i]}
                                d={barPath(bx(i), bw, base, end, radius)}
                                from={barPath(bx(i), bw, base, base, radius)}
                                up={end <= base}
                                delay={buildDelay + markDelay(i, n)}
                                motionOK={motionOK}
                                live={live}
                                // Selection overrides hover dimming; hover lifts a faded bar to 0.5.
                                opacity={filtering ? (on[i] ? 1 : hover === i ? 0.5 : 0.28) : hover == null || hover === i ? 1 : 0.45}
                                filtering={filtering}
                                selected={on[i]}
                            />
                        );
                    })}
                </g>

                {lineD && (
                    <g key={lineKey} aria-hidden>
                        <motion.path
                            d={lineD}
                            className={cn("fill-none", SERIES_STROKE[LINE_SERIES])}
                            strokeWidth={2.25}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            initial={motionOK ? { pathLength: 0, opacity: 0 } : false}
                            animate={{ pathLength: 1, opacity: 1 }}
                            transition={{
                                pathLength: { duration: LINE_DRAW, ease: EASE_OUT, delay: lineDelay },
                                opacity: { duration: fast(0.01), delay: lineDelay },
                            }}
                        />
                        {drawn.map((p, j) => (
                            <ComboDot
                                key={keys[p.i]}
                                cx={p.x}
                                cy={yR(p.v ?? 0)}
                                delay={lineDelay + LINE_DRAW * easeOutTimeAt(along[j] / total)}
                                motionOK={motionOK}
                                hovered={hover === p.i}
                                filtering={filtering}
                                selected={on[p.i]}
                            />
                        ))}
                    </g>
                )}

                {/* Full-band hover (and, when selectable, click / keyboard) targets, so tiny
                    bars are as easy to hit as tall ones. */}
                <g onPointerLeave={onLeave}>
                    {rows.map((_, i) => (
                        <rect
                            key={keys[i]}
                            x={bx(i) - (step - bw) / 2}
                            y={0}
                            width={step}
                            height={plotH}
                            className={cn(
                                "fill-transparent",
                                sel.enabled && "cursor-pointer outline-none focus-visible:fill-ring/10",
                            )}
                            tabIndex={sel.enabled ? 0 : undefined}
                            role={sel.enabled ? "button" : undefined}
                            aria-pressed={sel.enabled ? on[i] : undefined}
                            aria-label={sel.enabled ? `${cats[i]}: ${formatByKind(bar.kind, barVals[i])}` : undefined}
                            onPointerMove={(e) => onMove(i, e)}
                            onClick={sel.enabled ? (e) => pick(i, e) : undefined}
                            onKeyDown={sel.enabled ? (e) => pickKey(i, e) : undefined}
                            // Keyboard focus lights its bar the way hover does.
                            onFocus={sel.enabled ? () => setHover(i) : undefined}
                            onBlur={sel.enabled ? () => setHover(null) : undefined}
                        />
                    ))}
                </g>
            </g>
        </svg>
    );
}

// ---------------------------------------------------------------------
// Marks — a bar and a line dot, each popping when it BECOMES selected
// ---------------------------------------------------------------------

interface BarProps {
    /** Target path, and the zero-height path it builds from. */
    d: string;
    from: string;
    /** Grows up the screen (value ≥ 0): pops from its bottom edge, else its top. */
    up: boolean;
    delay: number;
    motionOK: boolean;
    live: boolean;
    opacity: number;
    filtering: boolean;
    selected: boolean;
}

function ComboBar({ d, from, up, delay, motionOK, live, opacity, filtering, selected }: BarProps) {
    const pops = usePopCount(selected);
    const pop = motionOK && selected && pops > 0;
    return (
        <>
            <motion.path
                className={SERIES_FILL[BAR_SERIES]}
                style={{ transformBox: "fill-box", transformOrigin: up ? "50% 100%" : "50% 0%" }}
                initial={motionOK ? { d: from, opacity: 1 } : false}
                animate={{ d, opacity, scale: pop ? [1, 1.06, 1] : 1 }}
                transition={{
                    d: !motionOK ? { duration: 0 } : live ? spring.smooth : { ...spring.grow, delay },
                    opacity: fadeFor(motionOK, filtering),
                    scale: pop ? { duration: fast(0.45), times: [0, 0.35, 1], ease: EASE_OUT } : { duration: fast(0.2), ease: EASE_OUT },
                }}
            />
            {/* Ripple: an outline copy of the bar that swells and fades, once per selection. */}
            {pop && (
                <motion.path
                    key={pops}
                    d={d}
                    strokeWidth={1.5}
                    vectorEffect="non-scaling-stroke"
                    className={cn("pointer-events-none fill-none", SERIES_STROKE[BAR_SERIES])}
                    style={{ transformBox: "fill-box", transformOrigin: "50% 50%" }}
                    initial={{ opacity: 0.7, scale: 1 }}
                    animate={{ opacity: 0, scale: 1.15 }}
                    transition={{ duration: RIPPLE_S, ease: EASE_OUT }}
                />
            )}
        </>
    );
}

interface DotProps {
    cx: number;
    cy: number;
    /** When the dot pops in as the line's tip passes it. */
    delay: number;
    motionOK: boolean;
    hovered: boolean;
    filtering: boolean;
    selected: boolean;
}

function ComboDot({ cx, cy, delay, motionOK, hovered, filtering, selected }: DotProps) {
    const pops = usePopCount(selected);
    return (
        <motion.g
            style={{ transformBox: "fill-box", transformOrigin: "center" }}
            initial={motionOK ? { scale: 0 } : false}
            animate={{ scale: 1 }}
            transition={{ ...spring.bouncy, delay }}
        >
            <motion.circle
                cx={cx}
                cy={cy}
                strokeWidth={1.5}
                className={cn(SERIES_FILL[LINE_SERIES], "stroke-card")}
                initial={false}
                animate={{
                    r: selected ? DOT_SEL_R : hovered ? DOT_HOVER_R : DOT_R,
                    // The line stays; only the dots of unselected categories fade.
                    opacity: filtering && !selected ? (hovered ? 0.5 : 0.3) : 1,
                }}
                transition={{ r: selected ? spring.bouncy : spring.snappy, opacity: fadeFor(motionOK, filtering) }}
            />
            {/* Ring ripple, once per selection. */}
            {motionOK && selected && pops > 0 && (
                <motion.circle
                    key={pops}
                    cx={cx}
                    cy={cy}
                    strokeWidth={1.5}
                    className={cn("pointer-events-none fill-none", SERIES_STROKE[LINE_SERIES])}
                    initial={{ r: DOT_SEL_R, opacity: 0.7 }}
                    animate={{ r: DOT_SEL_R + 8, opacity: 0 }}
                    transition={{ duration: RIPPLE_S, ease: EASE_OUT }}
                />
            )}
        </motion.g>
    );
}

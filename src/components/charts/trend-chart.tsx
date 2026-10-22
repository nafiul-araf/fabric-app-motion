//-----------------------------------------------------------------------
// TrendChart — lines and soft areas over an ordered x (months), built on
// screen like a keynote reveal.
//
//  • Solid lines draw themselves left → right (pathLength), each series
//    0.15s after the one before. A glowing playhead rides the first
//    series' leading edge; areas and dashed prior-period lines are
//    uncovered by a clip that tracks it (pathLength fights dasharray).
//  • When the draw lands, the playhead settles on the last non-null point
//    as a "live" dot with a short pulsing ring.
//  • Hover snaps to the nearest x: hairline, one dot per series, glass
//    tooltip. New values morph the shapes in place; a new set of x labels
//    remounts the plot and re-runs the build.
//  • Optional right axis whose ticks sit on the left axis' gridlines.
//  • Click a month (or arrow to it and press Enter) to cross-filter the
//    page: a soft column rises behind it, its dots pop with a ripple and
//    the rest of the plot dims under a card-coloured veil.
//-----------------------------------------------------------------------

import {
    useEffect,
    useId,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
    type KeyboardEvent as ReactKeyboardEvent,
    type MouseEvent as ReactMouseEvent,
    type PointerEvent as ReactPointerEvent,
} from "react";
import { AnimatePresence, animate, motion, useMotionValue, useTransform } from "framer-motion";
import { scaleLinear, scalePoint, type ScaleLinear } from "d3-scale";
import { area as d3Area, curveMonotoneX, line as d3Line } from "d3-shape";
import {
    AXIS_TEXT,
    ChartFrame,
    GridY,
    Legend,
    SERIES_BG,
    SERIES_FILL,
    SERIES_STROKE,
    SERIES_VAR,
    approxTextWidth,
    numOf,
    seriesIndex,
    textOf,
    truncateLabel,
    useBuildDelay,
    useMeasure,
    type QuerySpec,
    type Row,
} from "./core";
import { useSelection } from "./cross-filter";
import { useChartTooltip } from "./tooltip";
import { EASE_OUT, spring, useMotionOK, fast } from "@/lib/motion";
import { formatAxis, formatByKind, type Kind } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface TrendSeries {
    /** Cleaned column name, e.g. "Sales". */
    key: string;
    /** Legend / tooltip label. */
    label: string;
    type: "area" | "line";
    /** Value axis; default "left". */
    axis?: "left" | "right";
    /** Index into the SERIES_* palette (0 = series-1 blue, 2 = series-3 orange, …). */
    color: number;
    /** Dashed stroke for prior-period lines. */
    dashed?: boolean;
}

interface TrendChartProps {
    spec: QuerySpec;
    /** Label column, default "Month". */
    x?: string;
    /** Sort column (ascending), default "Sort". */
    order?: string;
    series: TrendSeries[];
    /** Left axis kind. */
    kind: Kind;
    /** Right axis kind when any series uses axis "right". */
    rightKind?: Kind;
}

// ---------------------------------------------------------------------
// Timing & layout
// ---------------------------------------------------------------------

/** Seconds for one series to draw. */
const DRAW = fast(1.1);
/** Stagger between series. */
const SERIES_STEP = fast(0.15);
/** Filter-change morph of lines, areas and the live dot. */
const MORPH = { duration: fast(0.6), ease: EASE_OUT };
const M_TOP = 12;
const M_BOTTOM = 24;
/** Clip overhang so round caps and the playhead glow are never cut. */
const CLIP_PAD = 24;
/** Clip width once the build is over (covers any later resize). */
const CLIP_OPEN = 100_000;

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
 * A nice domain covering [lo, hi] in exactly `k` equal steps, so a second
 * axis' ticks land on the first axis' gridlines.
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

/** "A", "A and B", "A, B and C". */
function joinNames(names: string[]): string {
    if (names.length < 2) return names.join("");
    return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** Ascending by the numeric `order` column; rows without one keep query order, last. */
function sortRows(rows: Row[], order: string): Row[] {
    return rows
        .map((r, i) => ({ r, i, k: numOf(r, order) }))
        .sort((a, b) => {
            if (a.k != null && b.k != null && a.k !== b.k) return a.k - b.k;
            if ((a.k == null) !== (b.k == null)) return a.k == null ? 1 : -1;
            return a.i - b.i;
        })
        .map((o) => o.r);
}

interface Pt {
    x: number;
    v: number | null;
}

interface SeriesGeo {
    s: TrendSeries;
    /** Position in `series` (drives draw order and stagger). */
    si: number;
    /** Palette index. */
    c: number;
    kind: Kind;
    y: ScaleLinear<number, number>;
    pts: Pt[];
    line: string | null;
    area: string | null;
    /** Last non-null point. */
    last: { i: number; x: number; y: number; v: number } | null;
}

// ---------------------------------------------------------------------
// Chart
// ---------------------------------------------------------------------

export function TrendChart({ spec, ...rest }: TrendChartProps) {
    return (
        <ChartFrame spec={spec} skeleton="line">
            {(data) => <TrendPlot {...rest} rows={data.rows} />}
        </ChartFrame>
    );
}

interface PlotProps extends Omit<TrendChartProps, "spec"> {
    rows: Row[];
}

/** Legend row on top; the svg takes whatever height is left. */
function TrendPlot({ rows, x = "Month", order = "Sort", series, kind, rightKind }: PlotProps) {
    const [boxRef, box] = useMeasure<HTMLDivElement>();
    const sorted = useMemo(() => sortRows(rows, order), [rows, order]);
    const labels = sorted.map((r) => textOf(r, x));

    return (
        <div className="flex h-full w-full flex-col">
            <Legend
                className="shrink-0 justify-end pb-s"
                items={series.map((s) => ({
                    label: s.label,
                    swatch: SERIES_BG[seriesIndex(s.color)],
                    line: s.type === "line",
                    dashed: s.dashed,
                }))}
            />
            <div ref={boxRef} className="relative min-h-0 flex-1">
                {box.width > 0 && box.height > 0 && (
                    <TrendSvg
                        // A new set of x labels re-runs the build from scratch.
                        key={labels.join("␟")}
                        rows={sorted}
                        labels={labels}
                        width={box.width}
                        height={box.height}
                        monthly={x === "Month"}
                        series={series}
                        kind={kind}
                        rightKind={rightKind}
                    />
                )}
            </div>
        </div>
    );
}

interface SvgProps {
    rows: Row[];
    labels: string[];
    width: number;
    height: number;
    monthly: boolean;
    series: TrendSeries[];
    kind: Kind;
    rightKind?: Kind;
}

function TrendSvg({ rows, labels, width, height, monthly, series, kind, rightKind }: SvgProps) {
    const buildDelay = useBuildDelay();
    const motionOK = useMotionOK();
    const tooltip = useChartTooltip();
    const sel = useSelection();
    const uid = useId().replace(/[^\w-]/g, "");
    const [hover, setHover] = useState<number | null>(null);
    /** The hover cursor is being driven from the keyboard (announce it). */
    const [keyed, setKeyed] = useState(false);
    const hovering = useRef(false);

    // ---- Axes ---------------------------------------------------------
    const hasLeft = series.some((s) => s.axis !== "right");
    // With no left series, the right ones become the (only) left axis.
    const axisOf = (s: TrendSeries) => (hasLeft ? (s.axis ?? "left") : "left");
    const hasRight = series.some((s) => axisOf(s) === "right");
    const leftKind = hasLeft ? kind : (rightKind ?? kind);
    const rKind = rightKind ?? kind;
    const valuesOn = (ax: "left" | "right") =>
        series
            .filter((s) => axisOf(s) === ax)
            .flatMap((s) => rows.map((r) => numOf(r, s.key)))
            .filter((v): v is number => v != null);

    const plotH = Math.max(1, height - M_TOP - M_BOTTOM);
    const count = tickCountFor(plotH);
    const yL = scaleLinear().domain(zeroDomain(valuesOn("left"))).range([plotH, 0]).nice(count);
    const lTicks = yL.ticks(count);
    const k = Math.max(1, lTicks.length - 1);
    const rDom = alignedDomain(zeroDomain(valuesOn("right")), k);
    // Right ticks span exactly the left tick rows, so both share one set of gridlines.
    const yR = scaleLinear()
        .domain(rDom)
        .range(lTicks.length > 1 ? [yL(lTicks[0]), yL(lTicks[lTicks.length - 1])] : [plotH, 0]);
    const rStep = (rDom[1] - rDom[0]) / k;
    const rTicks = hasRight ? Array.from({ length: k + 1 }, (_, i) => tidy(rDom[0] + rStep * i, rStep)) : [];

    const left = labelSpace(lTicks.map((t) => formatAxis(leftKind, t)));
    const right = hasRight ? labelSpace(rTicks.map((t) => formatAxis(rKind, t))) : 14;
    const plotW = Math.max(1, width - left - right);

    const xs = scalePoint<number>()
        .domain(rows.map((_, i) => i))
        .range([0, plotW])
        .padding(0.3);
    const px = (i: number) => xs(i) ?? 0;

    // ---- Series geometry ------------------------------------------------
    const geo: SeriesGeo[] = series.map((s, si) => {
        const ax = axisOf(s);
        const y = ax === "right" ? yR : yL;
        const pts: Pt[] = rows.map((r, i) => ({ x: px(i), v: numOf(r, s.key) }));
        const defined = (p: Pt) => p.v != null;
        const yOf = (p: Pt) => y(p.v ?? 0);
        const line = d3Line<Pt>().defined(defined).x((p) => p.x).y(yOf).curve(curveMonotoneX)(pts);
        let area: string | null = null;
        if (s.type === "area") {
            const [d0, d1] = y.domain();
            const base = y(Math.min(Math.max(0, d0), d1));
            area = d3Area<Pt>().defined(defined).x((p) => p.x).y0(base).y1(yOf).curve(curveMonotoneX)(pts);
        }
        let last: SeriesGeo["last"] = null;
        for (let i = pts.length - 1; i >= 0; i--) {
            const v = pts[i].v;
            if (v != null) {
                last = { i, x: pts[i].x, y: y(v), v };
                break;
            }
        }
        return { s, si, c: seriesIndex(s.color), kind: ax === "right" ? rKind : leftKind, y, pts, line, area, last };
    });
    // Later series draw underneath, so the first (current) series sits on top.
    const stack = [...geo].reverse();
    const head = geo.at(0);

    // ---- Build: playhead + clip reveal ----------------------------------
    const headRef = useRef<SVGPathElement>(null);
    const plotWRef = useRef(plotW);
    useLayoutEffect(() => {
        plotWRef.current = plotW;
    });
    const progress = useMotionValue(motionOK ? 0 : 1);
    const headX = useMotionValue(head?.last?.x ?? 0);
    const headY = useMotionValue(head?.last?.y ?? 0);
    const clipW = useMotionValue(motionOK ? 0 : CLIP_OPEN);
    const headOpacity = useTransform(progress, [0, 0.02], [0, 1]);
    const [built, setBuilt] = useState(false);
    const done = built || !motionOK;

    useEffect(() => {
        if (!motionOK) {
            progress.set(1);
            clipW.set(CLIP_OPEN);
            return;
        }
        const controls = animate(progress, 1, {
            duration: DRAW,
            ease: EASE_OUT,
            delay: buildDelay,
            onUpdate: (p) => {
                // The measuring path has no pathLength attribute, so lengths are real user units.
                const el = headRef.current;
                if (el) {
                    const pt = el.getPointAtLength(p * el.getTotalLength());
                    headX.set(pt.x);
                    headY.set(pt.y);
                    clipW.set(pt.x + CLIP_PAD);
                } else {
                    clipW.set(p * (plotWRef.current + CLIP_PAD));
                }
            },
            onComplete: () => {
                clipW.set(CLIP_OPEN);
                setBuilt(true);
            },
        });
        return () => controls.stop();
    }, [motionOK, buildDelay, progress, headX, headY, clipW]);

    // Hide the shared tooltip if the plot unmounts while hovered (e.g. filters change the months).
    useEffect(
        () => () => {
            if (hovering.current) tooltip.hide();
        },
        [tooltip],
    );

    // ---- Hover ----------------------------------------------------------
    /** Index of the x nearest the pointer over the plot overlay. */
    const nearestTo = (e: { clientX: number; currentTarget: Element }) => {
        const r = e.currentTarget.getBoundingClientRect();
        const mx = ((e.clientX - r.left) / Math.max(r.width, 1)) * plotW;
        let best = 0;
        for (let i = 1; i < rows.length; i++) if (Math.abs(px(i) - mx) < Math.abs(px(best) - mx)) best = i;
        return best;
    };
    const tipFor = (i: number) => ({
        title: labels[i] || "—",
        rows: geo.map((g) => ({
            label: g.s.label,
            value: formatByKind(g.kind, g.pts[i]?.v),
            swatch: SERIES_BG[g.c],
        })),
    });
    const onMove = (e: ReactPointerEvent<SVGRectElement>) => {
        const best = nearestTo(e);
        hovering.current = true;
        setHover(best);
        setKeyed(false);
        tooltip.show(e, tipFor(best));
    };
    const onLeave = () => {
        hovering.current = false;
        setHover(null);
        tooltip.hide();
    };

    // ---- X labels: thinned from the latest point back, clamped inside the svg ----
    const step = xs.step();
    const widest = Math.max(1, ...labels.map((l) => approxTextWidth(l)));
    const every = Math.max(1, Math.ceil((Math.min(widest, 90) + 10) / Math.max(step, 1)));
    const maxChars = Math.max(3, Math.floor((step * every - 6) / (11 * 0.56)));

    // ---- Cross-filter selection ----------------------------------------
    // This plot is the source: it is never filtered, it only highlights.
    const selIdx = sel.active ? rows.flatMap((r, i) => (sel.isSelected(r) ? [i] : [])) : [];
    const picked = new Set(selIdx);
    /** Selected columns: one step wide, centred on the x, clamped to the plot. */
    const bands = selIdx.map((i) => ({
        i,
        key: String(sel.keyOf(rows[i]) ?? i),
        a: Math.max(0, px(i) - step / 2),
        b: Math.min(plotW, px(i) + step / 2),
    }));
    // The veil covers the plot minus the selected columns (merged, so even-odd leaves clean holes).
    const holes: Array<[number, number]> = [];
    for (const { a, b } of bands) {
        const prev = holes.at(-1);
        if (prev && a <= prev[1] + 0.5) prev[1] = Math.max(prev[1], b);
        else holes.push([a, b]);
    }
    const veil = `M0,${-M_TOP}H${plotW}V${plotH}H0Z${holes.map(([a, b]) => `M${a},${-M_TOP}H${b}V${plotH}H${a}Z`).join("")}`;
    /** A thinned-out label would collide with a selected month's (always shown) label. */
    const crowds = (i: number) => selIdx.some((j) => j !== i && Math.abs(j - i) < every);

    const onClick = (e: ReactMouseEvent<SVGRectElement>) => {
        if (sel.enabled && rows.length) sel.toggle(rows[nearestTo(e)], e);
    };

    /** Keyboard cursor: reuse the hover crosshair and tooltip at month `i`. */
    const cursorTo = (i: number, svg: SVGSVGElement) => {
        const r = svg.getBoundingClientRect();
        const ys = geo.flatMap((g) => {
            const v = g.pts[i]?.v;
            return v == null ? [] : [g.y(v)];
        });
        hovering.current = true;
        setHover(i);
        setKeyed(true);
        tooltip.show({ clientX: r.left + left + px(i), clientY: r.top + M_TOP + (ys.length ? Math.min(...ys) : plotH / 2) }, tipFor(i));
    };
    const onKeyDown = (e: ReactKeyboardEvent<SVGSVGElement>) => {
        const n = rows.length;
        if (!n) return;
        // The first arrow press lands on the selected month (or an end) before moving.
        const start = (fallback: number) => selIdx[0] ?? fallback;
        let next: number | null = null;
        if (e.key === "ArrowLeft") next = hover == null ? start(n - 1) : Math.max(0, hover - 1);
        else if (e.key === "ArrowRight") next = hover == null ? start(0) : Math.min(n - 1, hover + 1);
        else if (e.key === "Home") next = 0;
        else if (e.key === "End") next = n - 1;
        else if ((e.key === "Enter" || e.key === " ") && hover != null) {
            e.preventDefault();
            sel.toggle(rows[hover], e);
            return;
        } else if (e.key === "Escape") {
            e.currentTarget.blur();
            return;
        }
        if (next == null) return;
        e.preventDefault();
        cursorTo(next, e.currentTarget);
    };
    const onBlur = () => {
        if (!keyed) return;
        setKeyed(false);
        onLeave();
    };

    // ---- Accessible summary ---------------------------------------------
    const span = labels.length > 1 ? `, ${labels[0]} to ${labels[labels.length - 1]}` : labels[0] ? `, ${labels[0]}` : "";
    const latest = geo.flatMap((g) => (g.last ? [`${g.s.label} ${formatByKind(g.kind, g.last.v)}`] : [])).join(", ");
    const unit = monthly ? "month" : "point";
    const ariaLabel =
        `${monthly ? "Monthly trend" : "Trend"} of ${joinNames(series.map((s) => s.label))}${span}${latest ? `. Latest: ${latest}` : ""}.` +
        (selIdx.length ? ` Selected: ${joinNames(selIdx.map((i) => labels[i]))}.` : "") +
        (sel.enabled ? ` Use left/right arrows to choose a ${unit}, Enter to filter the page by it.` : "");
    // Spoken as the keyboard cursor moves (and when Enter toggles the selection).
    const announce =
        keyed && hover != null
            ? `${labels[hover] || "—"}: ${geo.map((g) => `${g.s.label} ${formatByKind(g.kind, g.pts[hover]?.v)}`).join(", ")}${picked.has(hover) ? ". Selected" : ""}.`
            : "";

    const morph = motionOK ? MORPH : { duration: 0 };
    const delayOf = (si: number) => buildDelay + SERIES_STEP * si;
    const clipId = `${uid}-clip`;
    const glowId = `${uid}-glow`;
    const gradId = (si: number) => `${uid}-grad-${si}`;

    return (
        <>
            <svg
                width={width}
                height={height}
                role={sel.enabled ? "group" : "img"}
                aria-label={ariaLabel}
                tabIndex={sel.enabled ? 0 : undefined}
                onKeyDown={sel.enabled ? onKeyDown : undefined}
                onBlur={sel.enabled ? onBlur : undefined}
                className={cn(
                    "absolute inset-0 block",
                    sel.enabled && "focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring",
                )}
            >
                <g transform={`translate(${left},${M_TOP})`}>
                    <defs>
                        <clipPath id={clipId}>
                            <motion.rect x={-CLIP_PAD} y={-M_TOP} height={height} width={clipW} />
                        </clipPath>
                        <filter id={glowId} x="-150%" y="-150%" width="400%" height="400%">
                            <feGaussianBlur stdDeviation={3} />
                        </filter>
                        {geo.map((g) =>
                            g.area ? (
                                <linearGradient key={g.si} id={gradId(g.si)} x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0" style={{ stopColor: SERIES_VAR[g.c], stopOpacity: 0.32 }} />
                                    <stop offset="1" style={{ stopColor: SERIES_VAR[g.c], stopOpacity: 0 }} />
                                </linearGradient>
                            ) : null,
                        )}
                    </defs>

                    <GridY ticks={lTicks} y={yL} x0={0} x1={plotW} kind={leftKind} zero={yL.domain()[0] < 0} />
                    {hasRight && (
                        // Zero-length lines: labels only, on the left axis' gridlines.
                        <GridY ticks={rTicks} y={yR} x0={plotW} x1={plotW} kind={rKind} labels="right" />
                    )}

                    <g aria-hidden>
                        {labels.map((l, i) => {
                            // A selected month always shows its label; thinned neighbours that would collide step aside.
                            const on = picked.has(i);
                            if (!on && ((labels.length - 1 - i) % every !== 0 || crowds(i))) return null;
                            const t = truncateLabel(l, maxChars);
                            const half = approxTextWidth(t) / 2;
                            const cx = Math.min(Math.max(px(i), half - left), plotW + right - half);
                            return (
                                <text
                                    key={i}
                                    x={cx}
                                    y={plotH + 17}
                                    textAnchor="middle"
                                    className={cn(AXIS_TEXT, "transition-colors duration-300", on && "fill-foreground font-semibold")}
                                >
                                    {t !== l && <title>{l}</title>}
                                    {t}
                                </text>
                            );
                        })}
                    </g>

                    {/* Selected months: a soft column behind the marks, rising from the baseline when picked. */}
                    <g aria-hidden pointerEvents="none">
                        <AnimatePresence>
                            {bands.map((b) => (
                                <motion.rect
                                    key={b.key}
                                    x={b.a + 1}
                                    y={0}
                                    width={Math.max(2, b.b - b.a - 2)}
                                    height={plotH}
                                    rx={6}
                                    className="fill-series-1/10"
                                    style={{ originY: 1 }}
                                    initial={motionOK ? { scaleY: 0, opacity: 0 } : false}
                                    animate={{ scaleY: 1, opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    transition={{ scaleY: spring.grow, opacity: { duration: motionOK ? 0.2 : 0, ease: EASE_OUT } }}
                                />
                            ))}
                        </AnimatePresence>
                    </g>

                    {/* Areas + dashed lines, uncovered by the clip that follows the playhead. */}
                    <g clipPath={`url(#${clipId})`}>
                        {stack.map((g) =>
                            g.area ? (
                                <motion.path
                                    key={`a${g.si}`}
                                    fill={`url(#${gradId(g.si)})`}
                                    initial={false}
                                    animate={{ d: g.area }}
                                    transition={{ d: morph }}
                                />
                            ) : null,
                        )}
                        {stack.map((g) =>
                            g.line && g.s.dashed ? (
                                <motion.path
                                    key={`d${g.si}`}
                                    className={cn("fill-none", SERIES_STROKE[g.c])}
                                    strokeWidth={1.75}
                                    strokeDasharray="4 4"
                                    strokeLinejoin="round"
                                    initial={motionOK ? { d: g.line, opacity: 0 } : false}
                                    animate={{ d: g.line, opacity: 0.8 }}
                                    transition={{ d: morph, opacity: { duration: fast(0.5), ease: EASE_OUT, delay: delayOf(g.si) } }}
                                />
                            ) : null,
                        )}
                    </g>

                    {/* Solid lines draw themselves; the first is tied to the playhead's progress. */}
                    {stack.map((g) => {
                        if (!g.line || g.s.dashed) return null;
                        const cls = cn("fill-none", SERIES_STROKE[g.c]);
                        if (g.si === 0) {
                            return (
                                <motion.path
                                    key={`l${g.si}`}
                                    className={cls}
                                    strokeWidth={2.25}
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    initial={false}
                                    animate={{ d: g.line }}
                                    transition={{ d: morph }}
                                    style={{ pathLength: progress, opacity: headOpacity }}
                                />
                            );
                        }
                        return (
                            <motion.path
                                key={`l${g.si}`}
                                className={cls}
                                strokeWidth={2}
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                initial={motionOK ? { d: g.line, pathLength: 0, opacity: 0 } : false}
                                animate={{ d: g.line, pathLength: 1, opacity: 1 }}
                                transition={{
                                    d: morph,
                                    pathLength: { duration: DRAW, ease: EASE_OUT, delay: delayOf(g.si) },
                                    opacity: { duration: fast(0.01), delay: delayOf(g.si) },
                                }}
                            />
                        );
                    })}

                    {/* Invisible copy of the first series, measured to place the playhead. */}
                    {head?.line && <path ref={headRef} d={head.line} className="fill-none" aria-hidden />}

                    {head?.line && head.last && !done && (
                        <motion.g aria-hidden style={{ opacity: headOpacity }}>
                            <motion.circle cx={headX} cy={headY} r={9} opacity={0.6} className={SERIES_FILL[head.c]} filter={`url(#${glowId})`} />
                            <motion.circle cx={headX} cy={headY} r={3.75} strokeWidth={1.5} className={cn(SERIES_FILL[head.c], "stroke-card")} />
                        </motion.g>
                    )}

                    {head?.last && done && (
                        <g aria-hidden>
                            <motion.circle
                                r={8}
                                opacity={0.4}
                                className={SERIES_FILL[head.c]}
                                filter={`url(#${glowId})`}
                                initial={false}
                                animate={{ cx: head.last.x, cy: head.last.y }}
                                transition={morph}
                            />
                            {motionOK && (
                                // Re-keyed on a new latest value, so fresh data pings again.
                                <motion.circle
                                    key={`${head.last.i}:${head.last.v}`}
                                    cx={head.last.x}
                                    cy={head.last.y}
                                    strokeWidth={1.5}
                                    className={cn("fill-none", SERIES_STROKE[head.c])}
                                    initial={{ r: 4, opacity: 0 }}
                                    animate={{ r: [4, 14], opacity: [0.7, 0] }}
                                    // Ripples for as long as the scene holds, like the reel's live endpoints.
                                    transition={{ duration: fast(1.4), ease: EASE_OUT, repeat: Infinity, repeatDelay: fast(0.9), delay: fast(0.3) }}
                                />
                            )}
                            <motion.circle
                                r={3.75}
                                strokeWidth={1.5}
                                className={cn(SERIES_FILL[head.c], "stroke-card")}
                                initial={false}
                                animate={{ cx: head.last.x, cy: head.last.y }}
                                transition={morph}
                            />
                        </g>
                    )}

                    {/* Dim everything outside the selected columns under a card-coloured veil. */}
                    <AnimatePresence>
                        {sel.active && (
                            <motion.path
                                key="veil"
                                d={veil}
                                fillRule="evenodd"
                                className="fill-card"
                                aria-hidden
                                pointerEvents="none"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 0.45 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: motionOK ? 0.3 : 0, ease: EASE_OUT }}
                            />
                        )}
                    </AnimatePresence>

                    {/* Emphasised dots on every series at each selected month; a ring ripples out as it's picked. */}
                    <g aria-hidden pointerEvents="none">
                        {bands.map((b) =>
                            geo.map((g) => {
                                const v = g.pts[b.i]?.v;
                                if (v == null) return null;
                                const cx = px(b.i);
                                const cy = g.y(v);
                                return (
                                    <g key={`${b.key}:${g.si}`}>
                                        {motionOK && (
                                            <motion.circle
                                                cx={cx}
                                                cy={cy}
                                                strokeWidth={1.5}
                                                className={cn("fill-none", SERIES_STROKE[g.c])}
                                                initial={{ r: 4, opacity: 0 }}
                                                animate={{ r: [4, 16], opacity: [0.7, 0] }}
                                                transition={{ duration: fast(0.7), ease: EASE_OUT, delay: fast(0.05) }}
                                            />
                                        )}
                                        <motion.circle
                                            cx={cx}
                                            cy={cy}
                                            strokeWidth={1.5}
                                            className={cn(SERIES_FILL[g.c], "stroke-card")}
                                            initial={motionOK ? { r: 0 } : false}
                                            animate={{ r: 4.5 }}
                                            transition={spring.bouncy}
                                        />
                                    </g>
                                );
                            }),
                        )}
                    </g>

                    {hover != null && (
                        <g aria-hidden pointerEvents="none">
                            <motion.line
                                y1={0}
                                y2={plotH}
                                strokeWidth={1}
                                className="stroke-input"
                                shapeRendering="crispEdges"
                                initial={false}
                                animate={{ x1: px(hover), x2: px(hover) }}
                                transition={spring.snappy}
                            />
                            {geo.map((g) => {
                                const v = g.pts[hover]?.v;
                                if (v == null) return null;
                                return (
                                    <motion.circle
                                        key={g.si}
                                        r={4}
                                        strokeWidth={1.5}
                                        className={cn(SERIES_FILL[g.c], "stroke-card")}
                                        initial={false}
                                        animate={{ cx: px(hover), cy: g.y(v) }}
                                        transition={spring.snappy}
                                    />
                                );
                            })}
                        </g>
                    )}

                    <rect
                        x={0}
                        y={0}
                        width={plotW}
                        height={plotH}
                        className={cn("fill-transparent", sel.enabled && "cursor-pointer")}
                        onPointerMove={onMove}
                        onPointerLeave={onLeave}
                        // A click always lands on the nearest month: select it (again: clear; Ctrl/⌘/Shift: add).
                        onClick={sel.enabled ? onClick : undefined}
                    />
                </g>
            </svg>
            {sel.enabled && (
                <span className="sr-only" aria-live="polite">
                    {announce}
                </span>
            )}
        </>
    );
}

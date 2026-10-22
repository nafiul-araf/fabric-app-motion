//-----------------------------------------------------------------------
// BarChart — one measure by one category, built like a keynote slide.
//
//  • Horizontal (default): category names in a left gutter (≤ ~32% of the
//    width), value ticks underneath. Rows that would be thinner than 14px
//    are cut to the first N with a muted "Top N of M" caption.
//    Vertical: value ticks on the left, category names under the columns.
//  • Bars grow out of the zero baseline one at a time on a springy
//    overshoot (spring.grow + markDelay). Brand tone then lets the leader
//    (largest |value|) keep full strength while the rest settle back —
//    the "highlight" beat. Signed tone diverges from an emphasised zero
//    line in up/down fills, with no leader beat.
//  • `target` draws a dashed plan line (with a tiny "Plan" caption) that
//    fades in once the build is done; the domain always includes it.
//  • Filters re-run the query with this component still mounted: marks
//    are keyed by category label, so bars spring to their new size, new
//    categories grow in and removed ones fade out.
//  • Precise numbers live in the tooltip — no data labels on the marks.
//  • Click a bar (or Enter / Space on it) to cross-filter the page: it pops
//    from its baseline with a ripple and keeps full strength while the rest
//    dim; clicking empty plot space clears.
//-----------------------------------------------------------------------

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, type Transition } from "framer-motion";
import { scaleBand, scaleLinear, type ScaleBand, type ScaleLinear } from "d3-scale";
import {
    AXIS_TEXT,
    ChartFrame,
    GridX,
    GridY,
    SERIES_BG,
    approxTextWidth,
    numOf,
    textOf,
    truncateLabel,
    useBuildDelay,
    type ChartData,
    type Kind,
    type QuerySpec,
    type Row,
    type Size,
} from "./core";
import { useChartTooltip, type TooltipContent, type TooltipRow } from "./tooltip";
import { useSelection } from "./cross-filter";
import { EASE_OUT, markDelay, spring, useMotionOK, fast } from "@/lib/motion";
import { formatAxis, formatByKind, formatSignedByKind } from "@/lib/format";
import { cn } from "@/lib/utils";

interface BarChartProps {
    spec: QuerySpec;
    /** Category column (cleaned metadata name). */
    cat?: string;
    /** Value column (cleaned metadata name). */
    val?: string;
    kind: Kind;
    orientation?: "horizontal" | "vertical";
    /** brand: one colour + leader highlight. signed: ≥ 0 up, < 0 down, diverging from zero. */
    tone?: "brand" | "signed";
    /** Dashed reference line at this value (e.g. 1 = 100% of plan). */
    target?: number;
    /** Tooltip row label; defaults to the value column's displayName. */
    valueLabel?: string;
    /** "data" keeps the query's row order; "label" sorts by category (numeric-aware). */
    order?: "data" | "label";
}

export function BarChart(props: BarChartProps) {
    const val = props.val ?? "Val";
    return (
        <ChartFrame
            spec={props.spec}
            skeleton={props.orientation === "vertical" ? "columns" : "bars"}
            keep={(r) => numOf(r, val) != null}
        >
            {(data, size) => <BarChartPlot {...props} data={data} size={size} />}
        </ChartFrame>
    );
}

// ---------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------

const PAD = 0.28; // band padding (inner = outer)
const MIN_BAND = 9; // bars thinner than this (row pitch < ~13px, an 11px label) → show the first N only
const MAX_BAR = 30; // horizontal bar thickness cap (few rows, tall box)
const MAX_COL = 56; // vertical column width cap
const AXIS_H = 20; // tick / category labels under the plot
const CAPTION_H = 14; // "Top N of M" row

// Cross-filter highlight
const DIMMED = 0.28; // unselected bars while this chart owns the selection
const POP = [1, 1.06, 1]; // one-shot pop as a bar becomes selected
const POP_T: Transition = { duration: fast(0.45), ease: EASE_OUT, times: [0, 0.35, 1] };
const RING = 8; // px the selection ripple travels outward

interface Item {
    /** Category label, made unique (also the React / band key). */
    key: string;
    value: number;
    /** The result row the bar stands for (its cross-filter member). */
    row: Row;
}

interface Layout {
    shown: Item[];
    ticks: number[];
    value: ScaleLinear<number, number>;
    band: ScaleBand<string>;
    /** Plot box. */
    left: number;
    right: number;
    top: number;
    bottom: number;
    /** Max characters for a gutter label (horizontal). */
    chars: number;
}

/** Rows → items, skipping nulls; blank labels read "(Blank)", duplicates get a suffix. */
function toItems(rows: Row[], cat: string, val: string, order: "data" | "label"): Item[] {
    const seen = new Map<string, number>();
    const items: Item[] = [];
    for (const r of rows) {
        const value = numOf(r, val);
        if (value == null) continue;
        const raw = textOf(r, cat);
        const label = raw.trim() === "" ? "(Blank)" : raw;
        const k = (seen.get(label) ?? 0) + 1;
        seen.set(label, k);
        items.push({ key: k === 1 ? label : `${label} (${k})`, value, row: r });
    }
    if (order === "label") {
        items.sort((a, b) => a.key.localeCompare(b.key, undefined, { numeric: true, sensitivity: "base" }));
    }
    return items;
}

/** Value extent that always spans zero (and never collapses). */
function extent(values: number[]): [number, number] {
    const lo = Math.min(0, ...values);
    const hi = Math.max(0, ...values);
    return lo === hi ? [0, 1] : [lo, hi];
}

/**
 * Linear scale niced for ~4 ticks (keeps the domain tight). d3 treats the
 * count as a hint, so ticks are thinned to every other step (zero always
 * survives) until there are ≤ `max` + 1 of them and they sit `gap` px apart.
 */
function niceLinear(lo: number, hi: number, len: number, max: number, gap: (ticks: number[]) => number) {
    const scale = scaleLinear().domain([lo, hi]).nice(4);
    let ticks = scale.ticks(4);
    while (ticks.length > 2 && (ticks.length > max + 1 || len / (ticks.length - 1) < gap(ticks))) {
        const step = ticks[1] - ticks[0];
        ticks = ticks.filter((t) => Math.abs(Math.round(t / step)) % 2 === 0);
    }
    return { scale, ticks };
}

/** Band padding that keeps bands at most `max` px thick. */
function bandPadding(len: number, n: number, max: number): number {
    const natural = (len * (1 - PAD)) / (n + PAD);
    return natural > max ? (len - max * n) / (len + max) : PAD;
}

function layoutHorizontal(items: Item[], { width: W, height: H }: Size, kind: Kind, target?: number): Layout {
    const top = target != null ? 16 : 4;
    let plotH = Math.max(12, H - top - AXIS_H);
    let shown = items;
    if ((plotH * (1 - PAD)) / (items.length + PAD) < MIN_BAND) {
        plotH = Math.max(12, plotH - CAPTION_H);
        shown = items.slice(0, Math.max(1, Math.floor((plotH * (1 - PAD)) / MIN_BAND - PAD)));
    }
    const bottom = top + plotH;

    const longest = Math.max(...shown.map((it) => approxTextWidth(it.key)));
    const left = Math.ceil(Math.min(W * 0.32, Math.max(40, longest + 14)));

    const [lo, hi] = extent([...shown.map((it) => it.value), ...(target != null ? [target] : [])]);
    const approxW = Math.max(40, W - left - 24);
    const labelGap = (ticks: number[]) => Math.max(...ticks.map((t) => approxTextWidth(formatAxis(kind, t)))) + 12;
    const { scale, ticks } = niceLinear(lo, hi, approxW, 4, labelGap);
    // Leave room for half of the last tick label so it never clips.
    const right = W - Math.max(8, approxTextWidth(formatAxis(kind, scale.domain()[1])) / 2 + 4);
    scale.range([left, right]);

    const band = scaleBand<string>()
        .domain(shown.map((it) => it.key))
        .range([top, bottom])
        .padding(bandPadding(plotH, shown.length, MAX_BAR));

    return { shown, ticks, value: scale, band, left, right, top, bottom, chars: Math.max(3, Math.floor((left - 14) / (11 * 0.56) + 0.25)) };
}

function layoutVertical(items: Item[], { width: W, height: H }: Size, kind: Kind, target?: number): Layout {
    const top = target != null ? 16 : 8;
    const plotH = Math.max(12, H - top - AXIS_H);
    const bottom = top + plotH;

    const [lo, hi] = extent([...items.map((it) => it.value), ...(target != null ? [target] : [])]);
    const { scale, ticks } = niceLinear(lo, hi, plotH, 4, () => 22);
    scale.range([bottom, top]);

    const left = Math.round(Math.max(28, Math.max(...ticks.map((t) => approxTextWidth(formatAxis(kind, t)))) + 12));
    const right = W - 4;
    const band = scaleBand<string>()
        .domain(items.map((it) => it.key))
        .range([left, right])
        .padding(bandPadding(right - left, items.length, MAX_COL));

    return { shown: items, ticks, value: scale, band, left, right, top, bottom, chars: 0 };
}

// ---------------------------------------------------------------------
// Selection marks
// ---------------------------------------------------------------------

interface Box {
    attrX: number;
    attrY: number;
    width: number;
    height: number;
}

/**
 * The reel's endpoint ripple, for a newly selected bar: an outline of the
 * bar that grows outward by RING px and fades, once. Keyed by bar, so each
 * newly selected member plays it again.
 */
function Ripple({ box, rx, className }: { box: Box; rx: number; className: string }) {
    const { attrX, attrY, width, height } = box;
    return (
        <motion.rect
            className={cn("fill-none", className)}
            strokeWidth={1.5}
            initial={{ attrX, attrY, width, height, rx, opacity: 0.7 }}
            animate={{
                attrX: attrX - RING,
                attrY: attrY - RING,
                width: width + 2 * RING,
                height: height + 2 * RING,
                rx: rx + RING,
                opacity: 0,
            }}
            transition={{ duration: fast(0.65), ease: EASE_OUT }}
        />
    );
}

/**
 * Category labels under the columns: core's BandLabelsX (same thinning and
 * truncation) with per-label selection state — selected labels in bold ink,
 * the rest dimmed — while this chart owns the selection.
 */
function ColumnLabels({
    items,
    x,
    bandwidth,
    y,
    look,
    fade,
}: {
    items: Item[];
    x: (key: string) => number;
    bandwidth: number;
    y: number;
    /** Selection state of a label, or null when this chart has no selection. */
    look: (it: Item) => { on: boolean; opacity: number } | null;
    /** Fade opacity / ink changes (off for reduced motion). */
    fade: boolean;
}) {
    // Room per label is the band *step* (bar + gap), not the bar width.
    const step = items.length > 1 ? Math.abs(x(items[1].key) - x(items[0].key)) : bandwidth;
    const room = Math.max(step, bandwidth, 1);
    const longest = Math.max(...items.map((it) => approxTextWidth(it.key)), 1);
    const every = Math.max(1, Math.ceil((Math.min(longest, 90) + 8) / room));
    const maxChars = Math.max(3, Math.floor((room * every - 6) / (11 * 0.56)));
    return (
        <g aria-hidden>
            {items.map((it, i) => {
                if (i % every !== 0) return null;
                const s = look(it);
                return (
                    <text
                        key={`${it.key}-${i}`}
                        x={x(it.key) + bandwidth / 2}
                        y={y}
                        textAnchor="middle"
                        className={cn(
                            AXIS_TEXT,
                            fade && "transition-[opacity,fill] duration-300",
                            s?.on && "fill-foreground font-semibold",
                        )}
                        style={s ? { opacity: s.opacity } : undefined}
                    >
                        <title>{it.key}</title>
                        {truncateLabel(it.key, maxChars)}
                    </text>
                );
            })}
        </g>
    );
}

// ---------------------------------------------------------------------
// Plot
// ---------------------------------------------------------------------

function BarChartPlot({
    data,
    size,
    cat = "Cat",
    val = "Val",
    kind,
    orientation = "horizontal",
    tone = "brand",
    target,
    valueLabel,
    order = "data",
}: BarChartProps & { data: ChartData; size: Size }) {
    const motionOK = useMotionOK();
    const buildDelay = useBuildDelay();
    const tip = useChartTooltip();
    const sel = useSelection();
    const [hover, setHover] = useState<string | null>(null);

    const horizontal = orientation !== "vertical";
    const signed = tone === "signed";
    const items = useMemo(() => toItems(data.rows, cat, val, order), [data.rows, cat, val, order]);
    const L = useMemo(
        () => (horizontal ? layoutHorizontal(items, size, kind, target) : layoutVertical(items, size, kind, target)),
        [horizontal, items, size, kind, target],
    );
    const { shown, value: vs, band } = L;
    const n = shown.length;

    // The build ends after the last bar's delay + ~0.5s; then the highlight
    // beat plays and later data changes animate without the build delay.
    const [buildEnd] = useState(() => buildDelay + markDelay(Math.max(0, n - 1), n) + 0.5);
    const [built, setBuilt] = useState(!motionOK);
    useEffect(() => {
        if (built) return;
        const id = window.setTimeout(() => setBuilt(true), buildEnd * 1000);
        return () => window.clearTimeout(id);
    }, [built, buildEnd]);
    // Unmounting under the pointer (rows emptied, page change) gets no pointerleave.
    useEffect(() => () => tip.hide(), [tip]);

    const colName = (name: string) => data.columns.find((c) => c.name === name)?.displayName || name;
    const valName = valueLabel ?? colName(val);
    const catName = colName(cat);
    const fmt = (v: number) => (signed ? formatSignedByKind(kind, v) : formatByKind(kind, v));

    const leader = shown.reduce((a, b) => (Math.abs(b.value) > Math.abs(a.value) ? b : a), shown[0]);
    const active = hover != null && shown.some((it) => it.key === hover) ? hover : null;
    // While this chart owns the cross-filter selection, selected bars keep full
    // strength and the rest dim — overriding the leader beat and hover dimming
    // (hovering an unselected bar only lifts it a little).
    const picked = (it: Item) => sel.active && sel.isSelected(it.row);
    const opacityOf = (it: Item) => {
        if (sel.active) return picked(it) ? 1 : it.key === active ? 0.5 : DIMMED;
        return active ? (it.key === active ? 1 : 0.4) : !signed && built && it.key !== leader.key ? 0.55 : 1;
    };
    const labelOpacity = (it: Item) => (sel.active && !picked(it) && it.key !== active ? 0.45 : 1);
    // A bar pops (and rings) the moment it becomes selected — not mid-build.
    const popOn = sel.active && motionOK && built;

    // Geometry — final rect, and the zero-size rect it grows from.
    const bw = band.bandwidth();
    const step = band.step();
    const zero = vs(0);
    const rx = Math.min(6, bw / 2);
    const geo = (it: Item) => {
        const p = vs(it.value);
        const b = band(it.key) ?? 0;
        return horizontal
            ? { attrX: Math.min(zero, p), attrY: b, width: Math.abs(p - zero), height: bw }
            : { attrX: b, attrY: Math.min(zero, p), width: bw, height: Math.abs(p - zero) };
    };
    const base = (it: Item) => {
        const b = band(it.key) ?? 0;
        return horizontal ? { attrX: zero, attrY: b, width: 0, height: bw } : { attrX: b, attrY: zero, width: bw, height: 0 };
    };

    const geomT = (i: number): Transition =>
        !motionOK
            ? { duration: 0 }
            : built
              ? { ...spring.smooth, delay: markDelay(i, n, fast(0.18), fast(0.03)) }
              : { ...spring.grow, delay: buildDelay + markDelay(i, n) };
    const selT = motionOK ? { duration: fast(0.35), ease: EASE_OUT } : { duration: 0 };
    const fadeT = sel.active ? selT : { duration: active ? 0.2 : 0.5, ease: EASE_OUT };

    const fillOf = (v: number) => (signed ? (v >= 0 ? "fill-up" : "fill-down") : "fill-series-1");
    const strokeOf = (v: number) => (signed ? (v >= 0 ? "stroke-up" : "stroke-down") : "stroke-series-1");
    // Pops grow away from the zero baseline.
    const originOf = (v: number) =>
        horizontal ? { originX: v >= 0 ? 0 : 1, originY: 0.5 } : { originX: 0.5, originY: v >= 0 ? 1 : 0 };

    // Hit-area props when the chart cross-filters: click / Enter / Space toggles the member.
    const selectable = (it: Item): React.SVGProps<SVGRectElement> =>
        sel.enabled
            ? {
                  tabIndex: 0,
                  role: "button",
                  "aria-pressed": sel.isSelected(it.row),
                  "aria-label": `${it.key}: ${fmt(it.value)}`,
                  onClick: (e) => {
                      e.stopPropagation();
                      sel.toggle(it.row, e);
                  },
                  onKeyDown: (e) => {
                      if (e.key !== "Enter" && e.key !== " ") return;
                      e.preventDefault();
                      sel.toggle(it.row, e);
                  },
              }
            : {};

    const tipFor = (it: Item): TooltipContent => {
        const rows: TooltipRow[] = [
            {
                label: valName,
                value: fmt(it.value),
                swatch: signed ? (it.value >= 0 ? "bg-up" : "bg-down") : SERIES_BG[0],
                tone: signed ? (it.value > 0 ? "up" : it.value < 0 ? "down" : undefined) : undefined,
            },
        ];
        if (target != null) {
            const d = it.value - target;
            rows.push({ label: "vs Plan", value: formatSignedByKind(kind, d), tone: d > 0 ? "up" : d < 0 ? "down" : undefined });
        }
        return { title: it.key, rows };
    };

    // Aria summary over every row (not just the ones that fit).
    const hiItem = items.reduce((a, b) => (b.value > a.value ? b : a), items[0]);
    const loItem = items.reduce((a, b) => (b.value < a.value ? b : a), items[0]);
    const aria = [
        `Bar chart of ${valName} by ${catName}`,
        `highest ${hiItem.key} ${fmt(hiItem.value)}`,
        signed && items.length > 1 ? `lowest ${loItem.key} ${fmt(loItem.value)}` : null,
        target != null ? `plan line at ${formatByKind(kind, target)}` : null,
        n < items.length ? `showing ${n} of ${items.length}` : null,
    ]
        .filter(Boolean)
        .join("; ");

    const truncated = n < items.length;
    const zeroLine = signed || vs.domain()[0] < 0;
    const targetPos = target != null ? vs(target) : 0;
    const appear = { duration: fast(0.5), ease: EASE_OUT, delay: built ? 0 : Math.max(0, buildEnd - 0.3) };

    return (
        <svg
            width={size.width}
            height={size.height}
            // Selectable bars are buttons, so the chart is a group rather than an atomic image.
            role={sel.enabled ? "group" : "img"}
            aria-label={aria}
            className="block select-none"
            // Clicking empty plot space clears this chart's selection.
            onClick={sel.active ? () => sel.clear() : undefined}
        >
            {horizontal ? (
                <GridX ticks={L.ticks} x={vs} y0={L.top} y1={L.bottom} kind={kind} zero={zeroLine} />
            ) : (
                <GridY ticks={L.ticks} y={vs} x0={L.left} x1={L.right} kind={kind} zero={zeroLine} />
            )}

            {/* Bars */}
            <g>
                <AnimatePresence>
                    {shown.map((it, i) => {
                        const g = geo(it);
                        return (
                            <motion.rect
                                key={it.key}
                                rx={rx}
                                className={fillOf(it.value)}
                                style={originOf(it.value)}
                                initial={motionOK ? base(it) : false}
                                animate={{ ...g, opacity: opacityOf(it), scale: popOn && picked(it) ? POP : 1 }}
                                exit={{ opacity: 0, transition: { duration: fast(0.25) } }}
                                transition={{ default: geomT(i), opacity: fadeT, scale: POP_T }}
                            />
                        );
                    })}
                </AnimatePresence>
            </g>

            {/* Selection ripples — one ring per newly selected bar */}
            {popOn && (
                <g aria-hidden pointerEvents="none">
                    {shown.map((it) =>
                        picked(it) ? <Ripple key={it.key} box={geo(it)} rx={rx} className={strokeOf(it.value)} /> : null,
                    )}
                </g>
            )}

            {/* Plan line */}
            {target != null && (
                <g aria-hidden>
                    <motion.line
                        className="stroke-muted-foreground"
                        strokeWidth={1}
                        strokeDasharray="3 3"
                        initial={
                            motionOK
                                ? horizontal
                                    ? { opacity: 0, x1: targetPos, x2: targetPos, y1: L.top - 2, y2: L.bottom }
                                    : { opacity: 0, x1: L.left, x2: L.right, y1: targetPos, y2: targetPos }
                                : false
                        }
                        animate={
                            horizontal
                                ? { opacity: 1, x1: targetPos, x2: targetPos, y1: L.top - 2, y2: L.bottom }
                                : { opacity: 1, x1: L.left, x2: L.right, y1: targetPos, y2: targetPos }
                        }
                        transition={{ default: motionOK ? spring.smooth : { duration: 0 }, opacity: appear }}
                    />
                    <motion.text
                        className={AXIS_TEXT}
                        textAnchor={horizontal ? (targetPos > size.width - 16 ? "end" : "middle") : "end"}
                        initial={
                            motionOK
                                ? horizontal
                                    ? { opacity: 0, attrX: targetPos, attrY: L.top - 5 }
                                    : { opacity: 0, attrX: L.right, attrY: targetPos - 5 }
                                : false
                        }
                        animate={
                            horizontal
                                ? { opacity: 1, attrX: targetPos, attrY: L.top - 5 }
                                : { opacity: 1, attrX: L.right, attrY: targetPos - 5 }
                        }
                        transition={{ default: motionOK ? spring.smooth : { duration: 0 }, opacity: appear }}
                    >
                        Plan
                    </motion.text>
                </g>
            )}

            {/* Category labels */}
            {horizontal ? (
                <g aria-hidden>
                    <AnimatePresence>
                        {shown.map((it, i) => {
                            const cy = (band(it.key) ?? 0) + bw / 2;
                            const on = picked(it);
                            const emphasised = sel.active
                                ? on
                                : active
                                  ? it.key === active
                                  : !signed && built && it.key === leader.key;
                            return (
                                <motion.text
                                    key={it.key}
                                    x={L.left - 10}
                                    dy="0.32em"
                                    textAnchor="end"
                                    className={cn(
                                        AXIS_TEXT,
                                        "transition-colors duration-500",
                                        emphasised && "fill-foreground",
                                        on && "font-semibold",
                                    )}
                                    initial={motionOK ? { opacity: 0, attrY: cy } : false}
                                    animate={{ opacity: labelOpacity(it), attrY: cy }}
                                    exit={{ opacity: 0, transition: { duration: fast(0.2) } }}
                                    transition={{
                                        default: geomT(i),
                                        opacity: {
                                            duration: sel.active ? selT.duration : 0.4,
                                            ease: EASE_OUT,
                                            delay: built ? 0 : buildDelay + markDelay(i, n),
                                        },
                                    }}
                                >
                                    <title>{it.key}</title>
                                    {truncateLabel(it.key, L.chars)}
                                </motion.text>
                            );
                        })}
                    </AnimatePresence>
                </g>
            ) : (
                <ColumnLabels
                    items={shown}
                    x={(k) => band(k) ?? 0}
                    bandwidth={bw}
                    y={L.bottom + 14}
                    look={(it) => (sel.active ? { on: picked(it), opacity: labelOpacity(it) } : null)}
                    fade={motionOK}
                />
            )}

            {/* Hit areas — one per band, contiguous so the tooltip glides between rows */}
            <g
                onPointerLeave={() => {
                    setHover(null);
                    tip.hide();
                }}
            >
                {shown.map((it) => {
                    const b = (band(it.key) ?? 0) - (step - bw) / 2;
                    return (
                        <rect
                            key={it.key}
                            className={cn(
                                "fill-transparent outline-none",
                                sel.enabled && "cursor-pointer",
                                "focus-visible:fill-ring/10",
                            )}
                            x={horizontal ? 0 : b}
                            y={horizontal ? b : L.top}
                            width={horizontal ? L.right : step}
                            height={horizontal ? step : L.bottom - L.top}
                            onPointerMove={(e) => {
                                setHover(it.key);
                                tip.show(e, tipFor(it));
                            }}
                            {...selectable(it)}
                        />
                    );
                })}
            </g>

            {truncated && (
                <text x={size.width - 2} y={size.height - 3} textAnchor="end" className={AXIS_TEXT}>
                    {order === "data" ? `Top ${n} of ${items.length}` : `${n} of ${items.length}`}
                </text>
            )}
        </svg>
    );
}

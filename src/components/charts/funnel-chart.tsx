//-----------------------------------------------------------------------
// FunnelChart — centred horizontal bars, widest on top, giving the
// funnel silhouette for a small ordered set (e.g. customer segments).
//
//  • Rows are sorted by value (desc). Category names sit in a left gutter
//    (≤ ~32% of the width) like the bar chart; no axis, no data labels.
//  • Each bar opens out from the centre line (x/width animate from the
//    centre) on spring.grow, staggered top → bottom.
//  • Coloured SERIES_FILL by rank. Non-positive values draw no width.
//  • Rows thinner than 14px are cut to the top N with a "Top N of M"
//    caption. Keyed by category, so filter changes spring to new widths.
//  • Tooltip: value + share of total; hovering a bar dims the others.
//  • Click a row (or Enter / Space on it) to cross-filter the page: it pops
//    about its centre with a ripple and keeps full strength while the rest
//    dim; clicking empty plot space clears.
//-----------------------------------------------------------------------

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, type Transition } from "framer-motion";
import { scaleBand } from "d3-scale";
import {
    AXIS_TEXT,
    ChartFrame,
    SERIES_BG,
    SERIES_FILL,
    SERIES_STROKE,
    approxTextWidth,
    numOf,
    seriesIndex,
    textOf,
    truncateLabel,
    useBuildDelay,
    type ChartData,
    type Kind,
    type QuerySpec,
    type Row,
    type Size,
} from "./core";
import { useChartTooltip, type TooltipContent } from "./tooltip";
import { useSelection } from "./cross-filter";
import { EASE_OUT, markDelay, spring, useMotionOK, fast } from "@/lib/motion";
import { formatByKind, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

interface FunnelChartProps {
    spec: QuerySpec;
    /** Category column (cleaned metadata name). */
    cat?: string;
    /** Value column (cleaned metadata name). Half / NegHalf are not used. */
    val?: string;
    kind: Kind;
}

export function FunnelChart(props: FunnelChartProps) {
    const val = props.val ?? "Val";
    return (
        <ChartFrame spec={props.spec} skeleton="bars" keep={(r) => numOf(r, val) != null}>
            {(data, size) => <FunnelPlot {...props} data={data} size={size} />}
        </ChartFrame>
    );
}

// ---------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------

const PAD = 0.22; // band padding (inner = outer)
const MIN_BAND = 14; // thinner rows than this → show the top N only
const MAX_BAR = 44; // bar thickness cap (few rows, tall box)
const CAPTION_H = 14; // "Top N of M" row

// Cross-filter highlight
const DIMMED = 0.28; // unselected rows while this chart owns the selection
const POP = [1, 1.06, 1]; // one-shot pop as a row becomes selected
const POP_T: Transition = { duration: fast(0.45), ease: EASE_OUT, times: [0, 0.35, 1] };
const RING = 8; // px the selection ripple travels outward

interface Item {
    key: string;
    value: number;
    /** The result row the bar stands for (its cross-filter member). */
    row: Row;
}

const DROPS = 26;

/** Deterministic pseudo-random in [0, 1) per drop, so render stays pure. */
function rand(i: number, salt: number): number {
    const x = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
    return x - Math.floor(x);
}

/**
 * "Visits → sales", from the reference reel: a steady rain of particles
 * pours into the mouth of the funnel and narrows as it falls through the
 * rows, for as long as the scene holds. Purely decorative (aria-hidden,
 * no pointer events); off for reduced motion.
 */
function FunnelRain({ cx, top, bottom, halfTop, halfBottom }: { cx: number; top: number; bottom: number; halfTop: number; halfBottom: number }) {
    return (
        <g aria-hidden pointerEvents="none">
            {Array.from({ length: DROPS }, (_, i) => {
                const s = rand(i, 1) * 2 - 1;
                const x0 = cx + s * halfTop * 0.92;
                const x1 = cx + s * halfBottom * 0.5;
                const dur = 2.1 + rand(i, 2) * 1.5;
                const delay = rand(i, 4) * dur;
                const r = 1.3 + rand(i, 3) * 1.1;
                const loop = { duration: dur, repeat: Infinity, delay };
                return (
                    <motion.circle
                        key={i}
                        r={r}
                        className="fill-knob stroke-series-1"
                        strokeWidth={0.7}
                        initial={{ cx: x0, cy: top, opacity: 0 }}
                        animate={{ cx: [x0, x1], cy: [top, bottom], opacity: [0, 0.95, 0.95, 0] }}
                        transition={{
                            cx: { ...loop, ease: "easeIn" },
                            cy: { ...loop, ease: "easeIn" },
                            opacity: { ...loop, times: [0, 0.12, 0.82, 1], ease: "linear" },
                        }}
                    />
                );
            })}
        </g>
    );
}

/**
 * The reel's endpoint ripple, for a newly selected row: an outline of the
 * bar that grows outward by RING px and fades, once. Keyed by row, so each
 * newly selected member plays it again.
 */
function Ripple({
    box,
    rx,
    className,
}: {
    box: { attrX: number; attrY: number; width: number; height: number };
    rx: number;
    className: string;
}) {
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

function FunnelPlot({ data, size, cat = "Cat", val = "Val", kind }: FunnelChartProps & { data: ChartData; size: Size }) {
    const motionOK = useMotionOK();
    const buildDelay = useBuildDelay();
    const tip = useChartTooltip();
    const sel = useSelection();
    const [hover, setHover] = useState<string | null>(null);

    // Rows → unique labels, nulls skipped, sorted widest first.
    const items = useMemo(() => {
        const seen = new Map<string, number>();
        const out: Item[] = [];
        for (const r of data.rows) {
            const value = numOf(r, val);
            if (value == null) continue;
            const raw = textOf(r, cat);
            const label = raw.trim() === "" ? "(Blank)" : raw;
            const k = (seen.get(label) ?? 0) + 1;
            seen.set(label, k);
            out.push({ key: k === 1 ? label : `${label} (${k})`, value, row: r });
        }
        return out.sort((a, b) => b.value - a.value);
    }, [data.rows, cat, val]);

    const total = items.reduce((s, it) => s + Math.max(0, it.value), 0);

    const L = useMemo(() => {
        const { width: W, height: H } = size;
        const top = 4;
        let plotH = Math.max(12, H - top - 4);
        let shown = items;
        if ((plotH * (1 - PAD)) / (items.length + PAD) < MIN_BAND) {
            plotH = Math.max(12, plotH - CAPTION_H);
            shown = items.slice(0, Math.max(1, Math.floor((plotH * (1 - PAD)) / MIN_BAND - PAD)));
        }
        const longest = Math.max(...shown.map((it) => approxTextWidth(it.key)));
        const left = Math.round(Math.min(W * 0.32, Math.max(40, longest + 14)));
        const right = W - 8;
        const natural = (plotH * (1 - PAD)) / (shown.length + PAD);
        const pad = natural > MAX_BAR ? (plotH - MAX_BAR * shown.length) / (plotH + MAX_BAR) : PAD;
        const band = scaleBand<string>()
            .domain(shown.map((it) => it.key))
            .range([top, top + plotH])
            .padding(pad);
        const max = Math.max(0, ...shown.map((it) => it.value));
        return {
            shown,
            band,
            left,
            right,
            cx: (left + right) / 2,
            widthOf: (v: number) => (max > 0 ? (Math.max(0, v) / max) * (right - left) : 0),
            chars: Math.max(3, Math.floor((left - 14) / (11 * 0.56))),
        };
    }, [items, size]);

    const { shown, band, cx } = L;
    const n = shown.length;
    const bw = band.bandwidth();
    const step = band.step();
    const rx = Math.min(6, bw / 2);

    const [buildEnd] = useState(() => buildDelay + markDelay(Math.max(0, n - 1), n) + 0.5);
    const [built, setBuilt] = useState(!motionOK);
    useEffect(() => {
        if (built) return;
        const id = window.setTimeout(() => setBuilt(true), buildEnd * 1000);
        return () => window.clearTimeout(id);
    }, [built, buildEnd]);
    // Unmounting under the pointer gets no pointerleave — clear the tooltip.
    useEffect(() => () => tip.hide(), [tip]);

    const colName = (name: string) => data.columns.find((c) => c.name === name)?.displayName || name;
    const valName = colName(val);
    const active = hover != null && shown.some((it) => it.key === hover) ? hover : null;
    const share = (v: number) => (total > 0 ? Math.max(0, v) / total : null);

    // While this chart owns the cross-filter selection, selected rows keep full
    // strength and the rest dim — overriding hover dimming (hovering an
    // unselected row only lifts it a little).
    const picked = (it: Item) => sel.active && sel.isSelected(it.row);
    const opacityOf = (it: Item) => {
        if (sel.active) return picked(it) ? 1 : it.key === active ? 0.5 : DIMMED;
        return active ? (it.key === active ? 1 : 0.4) : 1;
    };
    const labelOpacity = (it: Item) => (sel.active && !picked(it) && it.key !== active ? 0.45 : 1);
    const selT = motionOK ? { duration: fast(0.35), ease: EASE_OUT } : { duration: 0 };
    // A row pops (and rings) the moment it becomes selected — not mid-build.
    const popOn = sel.active && motionOK && built;

    // Hit-area props when the chart cross-filters: click / Enter / Space toggles the member.
    const selectable = (it: Item): React.SVGProps<SVGRectElement> =>
        sel.enabled
            ? {
                  tabIndex: 0,
                  role: "button",
                  "aria-pressed": sel.isSelected(it.row),
                  "aria-label": `${it.key}: ${formatByKind(kind, it.value)}`,
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

    const geomT = (i: number): Transition =>
        !motionOK
            ? { duration: 0 }
            : built
              ? { ...spring.smooth, delay: markDelay(i, n, fast(0.18), fast(0.03)) }
              : { ...spring.grow, delay: buildDelay + markDelay(i, n) };

    const tipFor = (it: Item, i: number): TooltipContent => ({
        title: it.key,
        rows: [
            { label: valName, value: formatByKind(kind, it.value), swatch: SERIES_BG[seriesIndex(i)] },
            { label: "Share of total", value: formatPercent(share(it.value)) },
        ],
    });

    const lead = items[0];
    const aria = `Funnel chart of ${valName} by ${colName(cat)}; widest ${lead.key} ${formatByKind(kind, lead.value)} (${formatPercent(share(lead.value))} of total)${n < items.length ? `; showing ${n} of ${items.length}` : ""}`;

    return (
        <svg
            width={size.width}
            height={size.height}
            // Selectable rows are buttons, so the chart is a group rather than an atomic image.
            role={sel.enabled ? "group" : "img"}
            aria-label={aria}
            className="block select-none"
            // Clicking empty plot space clears this chart's selection.
            onClick={sel.active ? () => sel.clear() : undefined}
        >
            {/* Bars — open out from the centre line (and pop about it when selected) */}
            <g>
                <AnimatePresence>
                    {shown.map((it, i) => {
                        const y = band(it.key) ?? 0;
                        const w = L.widthOf(it.value);
                        return (
                            <motion.rect
                                key={it.key}
                                rx={rx}
                                className={SERIES_FILL[seriesIndex(i)]}
                                initial={motionOK ? { attrX: cx, attrY: y, width: 0, height: bw } : false}
                                animate={{
                                    attrX: cx - w / 2,
                                    attrY: y,
                                    width: w,
                                    height: bw,
                                    opacity: opacityOf(it),
                                    scale: popOn && picked(it) ? POP : 1,
                                }}
                                exit={{ opacity: 0, transition: { duration: fast(0.25) } }}
                                transition={{
                                    default: geomT(i),
                                    opacity: sel.active ? selT : { duration: active ? 0.2 : 0.4, ease: EASE_OUT },
                                    scale: POP_T,
                                }}
                            />
                        );
                    })}
                </AnimatePresence>
            </g>

            {/* Selection ripples — one ring per newly selected row, in its rank colour */}
            {popOn && (
                <g aria-hidden pointerEvents="none">
                    {shown.map((it, i) => {
                        if (!picked(it)) return null;
                        const w = L.widthOf(it.value);
                        return (
                            <Ripple
                                key={it.key}
                                box={{ attrX: cx - w / 2, attrY: band(it.key) ?? 0, width: w, height: bw }}
                                rx={rx}
                                className={SERIES_STROKE[seriesIndex(i)]}
                            />
                        );
                    })}
                </g>
            )}

            {/* Particle rain through the funnel, once the rows have built */}
            {motionOK && built && n > 0 && (
                <FunnelRain
                    cx={cx}
                    top={(band(shown[0].key) ?? 0) - 6}
                    bottom={(band(shown[n - 1].key) ?? 0) + bw + 2}
                    halfTop={L.widthOf(shown[0].value) / 2}
                    halfBottom={L.widthOf(shown[n - 1].value) / 2}
                />
            )}

            {/* Category names in the left gutter */}
            <g aria-hidden>
                <AnimatePresence>
                    {shown.map((it, i) => {
                        const cy = (band(it.key) ?? 0) + bw / 2;
                        const on = picked(it);
                        return (
                            <motion.text
                                key={it.key}
                                x={L.left - 10}
                                dy="0.32em"
                                textAnchor="end"
                                className={cn(
                                    AXIS_TEXT,
                                    "transition-colors duration-300",
                                    (sel.active ? on : it.key === active) && "fill-foreground",
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

            {/* Hit areas — full-width rows, contiguous so the tooltip glides */}
            <g
                onPointerLeave={() => {
                    setHover(null);
                    tip.hide();
                }}
            >
                {shown.map((it, i) => (
                    <rect
                        key={it.key}
                        className={cn(
                            "fill-transparent outline-none",
                            sel.enabled && "cursor-pointer",
                            "focus-visible:fill-ring/10",
                        )}
                        x={0}
                        y={(band(it.key) ?? 0) - (step - bw) / 2}
                        width={L.right}
                        height={step}
                        onPointerMove={(e) => {
                            setHover(it.key);
                            tip.show(e, tipFor(it, i));
                        }}
                        {...selectable(it)}
                    />
                ))}
            </g>

            {n < items.length && (
                <text x={size.width - 2} y={size.height - 3} textAnchor="end" className={AXIS_TEXT}>
                    {`Top ${n} of ${items.length}`}
                </text>
            )}
        </svg>
    );
}

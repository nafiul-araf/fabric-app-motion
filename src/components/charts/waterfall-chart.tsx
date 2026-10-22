//-----------------------------------------------------------------------
// Waterfall — a bridge from one level to another, built like a clock
// ticking over: the base column grows, each change DROPS into place (a
// spring with a little overshoot) and draws its dashed connector to the
// next column, and the total grows last.
//
// Axis honesty: when the smallest step is < 6% of the tallest level a
// zero-based axis flattens the steps to a pixel, so the axis starts just
// below the lowest level instead — and says so with an axis-break mark
// and an "Axis starts at …" caption.
//
// Factories disagree on Start/End order for "down" rows, so every bar
// spans min..max and takes its direction from Kind, never from the sign.
//-----------------------------------------------------------------------

import { useEffect, useMemo, useState, type PointerEvent } from "react";
import { motion } from "framer-motion";
import { scaleBand, scaleLinear } from "d3-scale";
import {
    AXIS_TEXT,
    BandLabelsX,
    ChartFrame,
    GridY,
    approxTextWidth,
    numOf,
    textOf,
    useBuildDelay,
    type ChartData,
    type Kind,
    type QuerySpec,
    type Row,
    type Size,
} from "./core";
import { useChartTooltip, type TooltipRow } from "./tooltip";
import { EASE_OUT, spring, useMotionOK, fast, quick } from "@/lib/motion";
import { formatAxis, formatByKind, formatSignedByKind } from "@/lib/format";

interface WaterfallChartProps {
    spec: QuerySpec;
    step?: string;
    order?: string;
    start?: string;
    end?: string;
    kindCol?: string;
    /** Value kind (default "money"). */
    kind?: Kind;
}

export function WaterfallChart({
    spec,
    step = "Step",
    order = "Order",
    start = "Start",
    end = "End",
    kindCol = "Kind",
    kind = "money",
}: WaterfallChartProps) {
    return (
        <ChartFrame spec={spec} skeleton="columns" keep={(r) => numOf(r, end) != null}>
            {(data, size) => (
                <WaterfallInner
                    data={data}
                    size={size}
                    stepCol={step}
                    orderCol={order}
                    startCol={start}
                    endCol={end}
                    kindCol={kindCol}
                    kind={kind}
                />
            )}
        </ChartFrame>
    );
}

// ---------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------

type StepKind = "base" | "up" | "down" | "total";

interface Item {
    key: string;
    label: string;
    kind: StepKind;
    /** Bar span (base/total: 0..End). */
    lo: number;
    hi: number;
    /** Running level after this step: up → max, down → min, base/total → End. */
    after: number;
    /** Signed change for up/down rows. */
    change: number;
}

const STEP_KINDS = new Set<string>(["base", "up", "down", "total"]);

const FILL: Record<StepKind, string> = {
    base: "fill-series-muted",
    up: "fill-up",
    down: "fill-down",
    total: "fill-series-1",
};

const SWATCH: Record<StepKind, string> = {
    base: "bg-series-muted",
    up: "bg-up",
    down: "bg-down",
    total: "bg-series-1",
};

const isDelta = (it: Item) => it.kind === "up" || it.kind === "down";

function toItems(rows: Row[], stepCol: string, orderCol: string, startCol: string, endCol: string, kindCol: string): Item[] {
    const sorted = rows
        .map((r, i) => ({ r, i, ord: numOf(r, orderCol) }))
        .sort((a, b) => (a.ord ?? a.i) - (b.ord ?? b.i) || a.i - b.i);
    const seen = new Map<string, number>();
    return sorted.map(({ r }, idx) => {
        const s = numOf(r, startCol) ?? 0;
        const e = numOf(r, endCol) ?? 0;
        const raw = textOf(r, kindCol).trim().toLowerCase();
        // Unknown kind: infer (zero start = a column, else direction by sign).
        const k: StepKind = STEP_KINDS.has(raw)
            ? (raw as StepKind)
            : s === 0
              ? idx > 0 && idx === sorted.length - 1
                  ? "total"
                  : "base"
              : e >= s
                ? "up"
                : "down";
        const label = textOf(r, stepCol) || "(Blank)";
        const n = seen.get(label) ?? 0;
        seen.set(label, n + 1);
        const key = n ? `${label}#${n}` : label;
        if (k === "base" || k === "total") {
            return { key, label, kind: k, lo: Math.min(0, e), hi: Math.max(0, e), after: e, change: e };
        }
        const lo = Math.min(s, e);
        const hi = Math.max(s, e);
        return { key, label, kind: k, lo, hi, after: k === "up" ? hi : lo, change: k === "up" ? hi - lo : lo - hi };
    });
}

/** Zero-based unless the steps would vanish; then start just under the lowest level. */
function domainFor(items: Item[]): { lo: number; hi: number; truncated: boolean } {
    const deltas = items.filter(isDelta).map((it) => it.hi - it.lo);
    const levels = items.flatMap((it) => (isDelta(it) ? [it.lo, it.hi] : [it.after]));
    const top = Math.max(0, ...levels);
    const lowest = Math.min(...levels);
    if (deltas.length && lowest > 0 && Math.min(...deltas) < 0.06 * top) {
        const floor = lowest - Math.max(1.5 * Math.max(...deltas), top * 0.005);
        if (floor > 0) return { lo: floor, hi: top, truncated: true };
    }
    const lo = Math.min(0, lowest);
    return { lo, hi: top > lo ? top : lo + 1, truncated: false };
}

/** Tick labels; when formatAxis is too coarse for the step (e.g. "$4.0B" four times), add precision. */
function tickLabels(kind: Kind, ticks: number[]): string[] {
    const plain = ticks.map((t) => formatAxis(kind, t));
    if (ticks.length < 2 || new Set(plain).size === plain.length) return plain;
    const step = Math.abs(ticks[1] - ticks[0]);
    if (kind === "percent") {
        const digits = Math.min(3, Math.max(0, Math.ceil(-Math.log10(step * 100))));
        return ticks.map((t) => `${(t * 100).toFixed(digits)}%`);
    }
    const top = Math.max(...ticks.map((t) => Math.abs(t)));
    const [div, unit] = top >= 1e9 ? [1e9, "B"] : top >= 1e6 ? [1e6, "M"] : top >= 1e3 ? [1e3, "K"] : [1, ""];
    const digits = Math.min(3, Math.max(0, Math.ceil(-Math.log10(step / div))));
    const nf = new Intl.NumberFormat("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
    const cur = kind === "money" ? "$" : "";
    return ticks.map((t) => `${t < 0 ? "-" : ""}${cur}${nf.format(Math.abs(t) / div)}${unit}`);
}

/** False until `after` seconds have passed — later updates skip the build delays. */
function useSettled(after: number): boolean {
    const [settled, setSettled] = useState(false);
    useEffect(() => {
        if (settled) return;
        const id = window.setTimeout(() => setSettled(true), after * 1000);
        return () => window.clearTimeout(id);
    }, [after, settled]);
    return settled;
}

// ---------------------------------------------------------------------
// Chart
// ---------------------------------------------------------------------

/** Build beats (s): a column grows, a step drops, a pause, a connector draws. */
const GROW = 0.34;
const DROP = 0.2;
const BEAT = 0.07;
const LINK = 0.22;
const MAX_BUILD = 1.8;
/** The "clock drop": quick, with a visible overshoot. */
const DROP_SPRING = quick({ type: "spring", stiffness: 420, damping: 18, mass: 0.8 } as const);
const MIN_H = 2;
/** Reduced motion: data changes land without a spring. */
const INSTANT = { duration: 0 } as const;

/** Sequence (s from build start): each mark starts after the previous one lands; its connector follows. */
function buildTimeline(items: Item[]): { marks: { at: number; link: number }[]; end: number } {
    const marks: { at: number; link: number }[] = [];
    let t = 0;
    for (const it of items) {
        const land = t + (isDelta(it) ? DROP : GROW);
        marks.push({ at: t, link: land - 0.04 });
        t = land + BEAT;
    }
    const k = t > MAX_BUILD ? MAX_BUILD / t : 1;
    return { marks: marks.map((m) => ({ at: m.at * k, link: m.link * k })), end: t * k };
}

interface InnerProps {
    data: ChartData;
    size: Size;
    stepCol: string;
    orderCol: string;
    startCol: string;
    endCol: string;
    kindCol: string;
    kind: Kind;
}

function WaterfallInner({ data, size, stepCol, orderCol, startCol, endCol, kindCol, kind }: InnerProps) {
    const buildDelay = useBuildDelay();
    const motionOK = useMotionOK();
    const tooltip = useChartTooltip();
    const [active, setActive] = useState<number | null>(null);

    const items = useMemo(
        () => toItems(data.rows, stepCol, orderCol, startCol, endCol, kindCol),
        [data.rows, stepCol, orderCol, startCol, endCol, kindCol],
    );

    const timeline = useMemo(() => buildTimeline(items), [items]);
    const settled = useSettled(buildDelay + timeline.end + 0.6);
    const delayOf = (s: number) => (settled || !motionOK ? 0 : buildDelay + s);
    const morph = motionOK ? spring.smooth : INSTANT;

    // ---- scales ----
    const dom = domainFor(items);
    const top = dom.truncated ? 22 : 8;
    const bottom = 22;
    const right = 4;
    const plotH = Math.max(24, size.height - top - bottom);
    const plotBottom = top + plotH;
    const count = Math.max(2, Math.min(6, Math.floor(plotH / 36)));
    const y = scaleLinear().domain([dom.lo, dom.hi]).range([plotBottom, top]).nice(count);
    const truncated = dom.truncated && y.domain()[0] > 0;
    if (dom.truncated && !truncated) y.domain([0, dom.hi]).nice(count);
    const floor = y.domain()[0];

    const ticks = y.ticks(count);
    const labels = tickLabels(kind, ticks);
    const left = Math.max(28, Math.ceil(Math.max(...labels.map((l) => approxTextWidth(l)))) + 12);
    const floorIdx = ticks.findIndex((t) => Math.abs(t - floor) <= Math.abs(floor) * 1e-9);
    const floorLabel = floorIdx >= 0 ? labels[floorIdx] : formatAxis(kind, floor);

    const band = scaleBand<string>()
        .domain(items.map((it) => it.key))
        .range([left + (truncated ? 14 : 0), size.width - right])
        .paddingInner(0.28)
        .paddingOuter(0.14);
    const bandW = band.bandwidth();
    const bw = Math.max(2, Math.min(bandW, 84));
    const rx = Math.min(4, bw * 0.12);
    const keyByLabel = new Map<string, string>();
    items.forEach((it) => {
        if (!keyByLabel.has(it.label)) keyByLabel.set(it.label, it.key);
    });

    const geom = items.map((it) => {
        const lo = !isDelta(it) && truncated ? floor : it.lo;
        let y0 = y(it.hi);
        let h = y(lo) - y0;
        if (h < MIN_H) {
            y0 -= (MIN_H - h) / 2;
            h = MIN_H;
        }
        const x = (band(it.key) ?? 0) + (bandW - bw) / 2;
        // Columns grow out of the baseline (down from it when negative).
        const from = !isDelta(it) && it.after < 0 ? y0 : y0 + h;
        return { x, y: y0, h, from };
    });

    const tipRows = (it: Item): TooltipRow[] =>
        isDelta(it)
            ? [
                  { label: "Change", value: formatSignedByKind(kind, it.change), tone: it.kind === "up" ? "up" : "down", swatch: SWATCH[it.kind] },
                  { label: "Level", value: formatByKind(kind, it.after) },
              ]
            : [{ label: "Value", value: formatByKind(kind, it.after), swatch: SWATCH[it.kind] }];

    const onMove = (e: PointerEvent, i: number) => {
        setActive(i);
        tooltip.show(e, { title: items[i].label, rows: tipRows(items[i]) });
    };
    const onLeave = () => {
        setActive(null);
        tooltip.hide();
    };

    const summary = items
        .map((it) => `${it.label} ${isDelta(it) ? formatSignedByKind(kind, it.change) : formatByKind(kind, it.after)}`)
        .join(", ");
    const hot = active != null && active < items.length ? items[active] : null;

    return (
        <svg
            width={size.width}
            height={size.height}
            role="img"
            aria-label={`Waterfall: ${summary}${truncated ? `. Axis starts at ${floorLabel}` : ""}`}
            className="block"
        >
            {hot && (
                <rect x={band(hot.key) ?? 0} y={top} width={bandW} height={plotH} rx={6} className="fill-hover" aria-hidden />
            )}

            <GridY ticks={ticks} y={y} x0={left} x1={size.width - right} kind={kind} labels="none" zero={!truncated} />
            <g aria-hidden>
                {ticks.map((t, i) => (
                    <text key={t} x={left - 8} y={y(t)} dy="0.32em" textAnchor="end" className={AXIS_TEXT}>
                        {labels[i]}
                    </text>
                ))}
            </g>

            {/* Connectors — dashed, drawn from each column's level to the next column. */}
            <g aria-hidden>
                {items.slice(0, -1).map((it, i) => {
                    const x1 = geom[i].x + bw;
                    const x2 = geom[i + 1].x;
                    const ly = y(it.after);
                    const at = delayOf(timeline.marks[i].link);
                    return (
                        <motion.line
                            key={`link-${it.key}`}
                            x1={x1}
                            className="stroke-input"
                            strokeWidth={1}
                            strokeDasharray="3 3"
                            shapeRendering="crispEdges"
                            initial={motionOK ? { x2: x1, y1: ly, y2: ly, opacity: 0 } : false}
                            animate={{ x2, y1: ly, y2: ly, opacity: 1 }}
                            transition={{
                                x2: { duration: motionOK ? LINK : 0, ease: EASE_OUT, delay: at },
                                opacity: { duration: fast(0.08), delay: at },
                                y1: morph,
                                y2: morph,
                            }}
                        />
                    );
                })}
            </g>

            {/* Columns grow; steps drop into place. */}
            <g aria-hidden>
                {items.map((it, i) => {
                    const g = geom[i];
                    const at = delayOf(timeline.marks[i].at);
                    if (isDelta(it)) {
                        return (
                            <motion.g
                                key={it.key}
                                initial={motionOK ? { opacity: 0, y: -18 } : false}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ y: { ...DROP_SPRING, delay: at }, opacity: { duration: fast(0.16), ease: EASE_OUT, delay: at } }}
                            >
                                <motion.rect
                                    x={g.x}
                                    width={bw}
                                    rx={rx}
                                    className={FILL[it.kind]}
                                    initial={false}
                                    animate={{ attrY: g.y, height: g.h }}
                                    transition={morph}
                                />
                            </motion.g>
                        );
                    }
                    return (
                        <motion.rect
                            key={it.key}
                            x={g.x}
                            width={bw}
                            rx={rx}
                            className={FILL[it.kind]}
                            initial={motionOK ? { attrY: g.from, height: 0 } : false}
                            animate={{ attrY: g.y, height: g.h }}
                            transition={motionOK ? { ...spring.grow, delay: at } : INSTANT}
                        />
                    );
                })}
            </g>

            <BandLabelsX
                labels={items.map((it) => it.label)}
                x={(l) => band(keyByLabel.get(l) ?? l) ?? 0}
                bandwidth={bandW}
                y={plotBottom + 15}
            />

            {truncated && (
                <g aria-hidden>
                    {/* Axis break: a zig-zag cut into the baseline. */}
                    <rect x={left - 1} y={plotBottom - 3.5} width={14} height={7} className="fill-card" />
                    <polyline
                        points={`${left},${plotBottom} ${left + 2.5},${plotBottom - 3} ${left + 5.5},${plotBottom + 3} ${left + 8.5},${plotBottom - 3} ${left + 11},${plotBottom}`}
                        className="fill-none stroke-muted-foreground"
                        strokeWidth={1}
                        strokeLinejoin="round"
                    />
                    <text x={size.width - right} y={11} textAnchor="end" className={AXIS_TEXT}>
                        Axis starts at {floorLabel}
                    </text>
                </g>
            )}

            {/* Hit areas: the whole band column, so thin steps are easy to hover. */}
            <g>
                {items.map((it, i) => (
                    <rect
                        key={`hit-${it.key}`}
                        x={band(it.key) ?? 0}
                        y={top}
                        width={bandW}
                        height={plotH}
                        className="fill-transparent"
                        onPointerMove={(e) => onMove(e, i)}
                        onPointerLeave={onLeave}
                    />
                ))}
            </g>
        </svg>
    );
}

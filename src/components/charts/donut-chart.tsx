//-----------------------------------------------------------------------
// Donut / pie — part-to-whole that sweeps on like a ring closing.
//
//  • Each segment is a STROKED arc along the ring's centre-line (butt
//    caps, stroke width = ring thickness), so pathLength 0 → 1 sweeps it
//    clockwise from 12 o'clock.
//  • One EASE_OUT curve runs round the whole ring (≈1s) and every segment
//    owns its slice of that curve: the arcs build one after another, each
//    for a time set by its share, with no stall at the joins.
//  • Filter changes spring each segment's angles to their new positions.
//  • Donut centre shows the total; hovering a segment or legend row
//    crossfades it to that segment's name, value and share.
//  • Click a segment or legend row (Enter/Space on a focused row) to
//    cross-filter the page; Ctrl/⌘/Shift adds. Selected slices pop out
//    with a ripple, the rest fade, the centre shows the selection, and
//    clicking empty space clears it.
//-----------------------------------------------------------------------

import { useEffect, useMemo, useState, type KeyboardEvent, type MouseEvent, type PointerEvent } from "react";
import { AnimatePresence, cubicBezier, motion, useSpring, useTransform, type Transition } from "framer-motion";
import {
    ChartFrame,
    SERIES_BG,
    SERIES_STROKE,
    numOf,
    seriesIndex,
    textOf,
    useBuildDelay,
    type ChartData,
    type Kind,
    type QuerySpec,
    type Row,
    type Size,
} from "./core";
import { useSelection } from "./cross-filter";
import { useChartTooltip } from "./tooltip";
import { EASE_APPLE, EASE_OUT, spring, useMotionOK, fast, quick } from "@/lib/motion";
import { formatByKind, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

interface DonutChartProps {
    spec: QuerySpec;
    /** Category column name (default "Cat"). */
    cat?: string;
    /** Value column name (default "Val"). */
    val?: string;
    kind: Kind;
    variant?: "donut" | "pie";
}

export function DonutChart({ spec, cat = "Cat", val = "Val", kind, variant = "donut" }: DonutChartProps) {
    return (
        <ChartFrame spec={spec} skeleton="donut" keep={(r) => (numOf(r, val) ?? 0) > 0}>
            {(data, size) => <DonutInner data={data} size={size} cat={cat} val={val} kind={kind} variant={variant} />}
        </ChartFrame>
    );
}

// ---------------------------------------------------------------------
// Geometry & timing
// ---------------------------------------------------------------------

const TAU = Math.PI * 2;
/** Seconds for the whole ring to sweep on. */
const SWEEP = fast(1.0);
const sweepEase = cubicBezier(EASE_OUT[0], EASE_OUT[1], EASE_OUT[2], EASE_OUT[3]);

/** Inverse of the sweep ease: the time (0..1) at which progress `p` is reached. */
function sweepTime(p: number): number {
    if (p <= 0) return 0;
    if (p >= 1) return 1;
    let lo = 0;
    let hi = 1;
    for (let k = 0; k < 28; k++) {
        const mid = (lo + hi) / 2;
        if (sweepEase(mid) < p) lo = mid;
        else hi = mid;
    }
    return (lo + hi) / 2;
}

/** The slice [t0, t1] of the global sweep curve, rescaled to 0..1 for one segment. */
function sliceEase(t0: number, t1: number, p0: number, p1: number): (u: number) => number {
    const dp = p1 - p0;
    if (dp <= 1e-9 || t1 - t0 <= 1e-9) return (u) => u;
    return (u) => Math.min(1, Math.max(0, (sweepEase(t0 + u * (t1 - t0)) - p0) / dp));
}

/** Arc along a circle, angles in radians clockwise from 12 o'clock. */
function arcPath(c: number, r: number, a0: number, a1: number): string {
    const pt = (a: number) => `${(c + r * Math.sin(a)).toFixed(2)} ${(c - r * Math.cos(a)).toFixed(2)}`;
    const span = a1 - a0;
    if (span <= 0) return `M ${pt(a0)}`;
    if (span >= TAU - 1e-4) {
        // A full ring: two half arcs (one arc can't start and end on the same point).
        return `M ${pt(a0)} A ${r} ${r} 0 1 1 ${pt(a0 + Math.PI)} A ${r} ${r} 0 1 1 ${pt(a0 + TAU)}`;
    }
    return `M ${pt(a0)} A ${r} ${r} 0 ${span > Math.PI ? 1 : 0} 1 ${pt(a1)}`;
}

const ROW_H = 24;
const GAP = 16;
const MAX_RING = 340;

interface Layout {
    side: boolean;
    ring: number;
    legendW: number;
    legendH: number;
}

/** Ring left + legend right when the box is wide, legend under the ring when it is tall. */
function layoutFor({ width, height }: Size, n: number): Layout {
    const listH = Math.max(1, n) * ROW_H;
    const sideW = Math.min(260, Math.max(140, width * 0.4));
    const sideRing = Math.min(height, width - sideW - GAP, MAX_RING);
    const belowH = Math.min(listH, Math.max(ROW_H * 2, height * 0.4));
    const belowRing = Math.min(width, height - belowH - GAP / 2, MAX_RING);
    if (sideRing >= belowRing * 0.85 || belowRing < 60) {
        const ring = Math.max(40, Math.floor(sideRing));
        return { side: true, ring, legendW: Math.max(96, Math.min(260, width - ring - GAP)), legendH: Math.min(listH, height) };
    }
    return { side: false, ring: Math.max(40, Math.floor(belowRing)), legendW: Math.min(width, 320), legendH: belowH };
}

/** Centre number size by the hole's radius (static strings for Tailwind). */
const CENTRE_SIZES: [number, string][] = [
    [92, "text-[length:var(--text-hero-900)]"],
    [72, "text-[length:var(--text-hero-800)]"],
    [58, "text-[length:var(--text-hero-700)]"],
    [44, "text-[length:var(--text-600)]"],
    [30, "text-[length:var(--text-400)]"],
];

/** Cross-filter pop: a selected slice sits EXPLODE px out; POP overshoots it to ≈4px. */
const EXPLODE = 3;
const POP: Transition = quick({ type: "spring", stiffness: 520, damping: 14, mass: 0.7 });
/** The selection ripple: a rim arc that grows this many px and fades over RIPPLE_S. */
const RIPPLE_GROW = 10;
const RIPPLE_S = fast(0.65);

interface Seg {
    key: string;
    label: string;
    value: number;
    share: number;
    color: number;
    /** The result row this segment stands for (its cross-filter member). */
    row: Row;
    /** Drawn angles (gap trimmed). */
    a0: number;
    a1: number;
    /** Window of the global sweep this segment owns: time t, progress p (0..1). */
    t0: number;
    t1: number;
    p0: number;
    p1: number;
}

// ---------------------------------------------------------------------
// Chart
// ---------------------------------------------------------------------

interface InnerProps {
    data: ChartData;
    size: Size;
    cat: string;
    val: string;
    kind: Kind;
    variant: "donut" | "pie";
}

function DonutInner({ data, size, cat, val, kind, variant }: InnerProps) {
    const buildDelay = useBuildDelay();
    const motionOK = useMotionOK();
    const tooltip = useChartTooltip();
    const sel = useSelection();
    const [active, setActive] = useState<number | null>(null);

    const catLabel = data.columns.find((c) => c.name === cat)?.displayName ?? cat;
    const valLabel = data.columns.find((c) => c.name === val)?.displayName ?? val;

    // Positive values only, in query order; duplicate labels get a unique key.
    const items = useMemo(() => {
        const seen = new Map<string, number>();
        const out: { key: string; label: string; value: number; row: Row }[] = [];
        for (const r of data.rows) {
            const v = numOf(r, val);
            if (v == null || v <= 0) continue;
            const label = textOf(r, cat) || "(Blank)";
            const n = seen.get(label) ?? 0;
            seen.set(label, n + 1);
            out.push({ key: n ? `${label}#${n}` : label, label, value: v, row: r });
        }
        return out;
    }, [data.rows, cat, val]);

    const pie = variant === "pie";
    const lay = layoutFor(size, items.length);
    const c = lay.ring / 2;
    const R = c - 1;
    const thick = pie ? R : Math.min(28, Math.max(8, R * 0.24));
    const rc = R - thick / 2;
    const innerR = R - thick;
    // ~2px between segments (at the rim for a pie, on the centre-line for a donut).
    const gapA = items.length > 1 ? 2 / (pie ? R : rc) : 0;

    const segs = useMemo<Seg[]>(() => {
        const total = items.reduce((s, it) => s + it.value, 0);
        let acc = 0;
        return items.map((it, i) => {
            const p0 = acc / total;
            acc += it.value;
            const p1 = acc / total;
            const span = (p1 - p0) * TAU;
            // Thin slices keep ≥70% of their angle so a ~1% share stays visible.
            const trim = Math.min(gapA / 2, span * 0.15);
            return {
                key: it.key,
                label: it.label,
                value: it.value,
                share: p1 - p0,
                color: seriesIndex(i),
                row: it.row,
                a0: p0 * TAU + trim,
                a1: p1 * TAU - trim,
                t0: sweepTime(p0),
                t1: sweepTime(p1),
                p0,
                p1,
            };
        });
    }, [items, gapA]);

    const total = items.reduce((s, it) => s + it.value, 0);
    const hot = active != null && active < segs.length ? segs[active] : null;
    const centreCls = pie ? null : (CENTRE_SIZES.find(([min]) => innerR >= min)?.[1] ?? null);

    // Cross-filter: this visual's own selected segments (empty unless it owns the selection).
    const picked = sel.active ? segs.filter((s) => sel.isSelected(s.row)) : [];
    // Centre: hover wins, then the selection (one segment, or "N selected" summed), then the total.
    const one = hot ?? (picked.length === 1 ? picked[0] : null);
    const centre: { key: string; label: string | null; value: number; foot: string } = one
        ? { key: one.key, label: one.label, value: one.value, foot: formatPercent(one.share) }
        : picked.length > 1
          ? {
                key: `__sel:${picked.map((s) => s.key).join("|")}`,
                label: `${picked.length} selected`,
                value: picked.reduce((a, s) => a + s.value, 0),
                foot: formatPercent(picked.reduce((a, s) => a + s.share, 0)),
            }
          : { key: "__total", label: null, value: total, foot: "Total" };

    // A segment or legend row toggles its member (Ctrl/⌘/Shift adds); empty space clears.
    const pick = (e: MouseEvent | KeyboardEvent, s: Seg) => {
        e.stopPropagation();
        sel.toggle(s.row, e);
    };
    const pickKey = (e: KeyboardEvent, s: Seg) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        e.preventDefault();
        pick(e, s);
    };

    const showTip = (e: PointerEvent, i: number) => {
        const s = segs[i];
        tooltip.show(e, {
            title: s.label,
            rows: [
                { label: valLabel, value: formatByKind(kind, s.value), swatch: SERIES_BG[s.color] },
                { label: "Share", value: formatPercent(s.share) },
            ],
        });
    };
    const leave = () => {
        setActive(null);
        tooltip.hide();
    };

    const summary = segs
        .slice(0, 8)
        .map((s) => `${s.label} ${formatPercent(s.share)}`)
        .join(", ");

    return (
        <div
            className={cn("absolute inset-0 flex items-center justify-center", lay.side ? "flex-row gap-l" : "flex-col gap-s")}
            onClick={sel.active ? () => sel.clear() : undefined}
        >
            <div className="relative shrink-0" style={{ width: lay.ring, height: lay.ring }}>
                <svg
                    width={lay.ring}
                    height={lay.ring}
                    role="img"
                    aria-label={`${pie ? "Pie" : "Donut"} chart of ${valLabel} by ${catLabel}, total ${formatByKind(kind, total)}: ${summary}`}
                    // Visible overflow: the exploded slice and its ripple reach past the ring box.
                    className="block overflow-visible"
                >
                    {segs.map((s, i) => {
                        const on = sel.isSelected(s.row);
                        const isHot = hot?.key === s.key;
                        return (
                            <Segment
                                key={s.key}
                                seg={s}
                                c={c}
                                rc={rc}
                                thick={thick}
                                delay={buildDelay + s.t0 * SWEEP}
                                motionOK={motionOK}
                                // Selection overrides hover dimming; hover lifts a faded slice to 0.5.
                                opacity={sel.active ? (on ? 1 : isHot ? 0.5 : 0.25) : hot != null && !isHot ? 0.35 : 1}
                                filtering={sel.active}
                                selected={on}
                                onClick={sel.enabled ? (e) => pick(e, s) : undefined}
                                onPointerMove={(e) => {
                                    setActive(i);
                                    showTip(e, i);
                                }}
                                onPointerLeave={leave}
                            />
                        );
                    })}
                </svg>

                {centreCls && (
                    <motion.div
                        className="pointer-events-none absolute inset-0"
                        initial={motionOK ? { opacity: 0, filter: "blur(6px)" } : false}
                        animate={{ opacity: 1, filter: "blur(0px)" }}
                        transition={{ delay: buildDelay + 0.25, duration: fast(0.6), ease: EASE_APPLE }}
                    >
                        <AnimatePresence initial={false}>
                            <motion.div
                                key={centre.key}
                                className="absolute inset-0 flex items-center justify-center"
                                initial={{ opacity: 0, filter: "blur(4px)", scale: 0.97 }}
                                animate={{ opacity: 1, filter: "blur(0px)", scale: 1 }}
                                exit={{ opacity: 0, filter: "blur(4px)", scale: 1.02 }}
                                transition={{ duration: fast(0.22), ease: EASE_APPLE }}
                            >
                                <div className="flex min-w-0 flex-col items-center gap-xxs text-center" style={{ maxWidth: innerR * 1.55 }}>
                                    {centre.label != null && (
                                        <span className="max-w-full truncate text-[length:var(--text-200)] text-muted-foreground">
                                            {centre.label}
                                        </span>
                                    )}
                                    <span
                                        className={cn(
                                            "tabular font-numeric font-semibold leading-none tracking-tight text-foreground",
                                            centreCls,
                                        )}
                                    >
                                        {formatByKind(kind, centre.value)}
                                    </span>
                                    {innerR >= 36 && (
                                        <span className="tabular text-[length:var(--text-200)] text-muted-foreground">{centre.foot}</span>
                                    )}
                                </div>
                            </motion.div>
                        </AnimatePresence>
                    </motion.div>
                )}
            </div>

            <ul
                aria-label={catLabel}
                className="km-scroll flex shrink-0 flex-col overflow-y-auto"
                style={{ width: lay.legendW, maxHeight: lay.legendH }}
            >
                {segs.map((s, i) => {
                    const on = sel.isSelected(s.row);
                    const isHot = hot?.key === s.key;
                    return (
                        <motion.li
                            key={s.key}
                            initial={motionOK ? { opacity: 0, x: -8 } : false}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: buildDelay + s.t0 * SWEEP, duration: fast(0.45), ease: EASE_OUT }}
                            onPointerEnter={() => setActive(i)}
                            onPointerMove={pie ? (e) => showTip(e, i) : undefined}
                            onPointerLeave={leave}
                            className="shrink-0"
                        >
                            {/* The row is the focus / toggle target (the li keeps list semantics);
                                dim/highlight lives here too: framer owns the li's inline opacity. */}
                            <div
                                tabIndex={0}
                                role={sel.enabled ? "button" : undefined}
                                aria-pressed={sel.enabled ? on : undefined}
                                onFocus={() => setActive(i)}
                                onBlur={() => setActive(null)}
                                onClick={sel.enabled ? (e) => pick(e, s) : undefined}
                                onKeyDown={sel.enabled ? (e) => pickKey(e, s) : undefined}
                                className={cn(
                                    "flex h-6 items-center gap-s rounded-md px-xs text-[length:var(--text-200)] outline-none transition-[background-color,opacity] duration-200 focus-visible:ring-2 focus-visible:ring-ring",
                                    sel.enabled ? "cursor-pointer" : "cursor-default",
                                    isHot && "bg-hover",
                                    // Selection dims the other members (hover lifts one a little); else hover dims.
                                    sel.active ? !on && (isHot ? "opacity-60" : "opacity-40") : hot != null && !isHot && "opacity-50",
                                )}
                            >
                                <span className={cn("h-2 w-2 shrink-0 rounded-full", SERIES_BG[s.color])} aria-hidden />
                                <span className="min-w-0 flex-1 truncate text-foreground" title={s.label}>
                                    {s.label}
                                </span>
                                <span className="tabular shrink-0 text-muted-foreground">{formatPercent(s.share)}</span>
                            </div>
                        </motion.li>
                    );
                })}
            </ul>
        </div>
    );
}

// ---------------------------------------------------------------------
// Segment — springs its angles, sweeps on via pathLength
// ---------------------------------------------------------------------

/** Times `on` has turned true since mount — keys a one-shot pop per selection (none on mount). */
function usePopCount(on: boolean): number {
    const [was, setWas] = useState(on);
    const [count, setCount] = useState(0);
    if (on !== was) {
        setWas(on);
        if (on) setCount((n) => n + 1);
    }
    return count;
}

interface SegmentProps {
    seg: Seg;
    c: number;
    rc: number;
    thick: number;
    delay: number;
    motionOK: boolean;
    /** Target opacity — hover dimming, or the cross-filter highlight. */
    opacity: number;
    /** This visual owns a cross-filter selection (fades ease a touch slower). */
    filtering: boolean;
    selected: boolean;
    onClick?: (e: MouseEvent<SVGPathElement>) => void;
    onPointerMove: (e: PointerEvent<SVGPathElement>) => void;
    onPointerLeave: () => void;
}

function Segment({
    seg,
    c,
    rc,
    thick,
    delay,
    motionOK,
    opacity,
    filtering,
    selected,
    onClick,
    onPointerMove,
    onPointerLeave,
}: SegmentProps) {
    const a0 = useSpring(seg.a0, spring.smooth);
    const a1 = useSpring(seg.a1, spring.smooth);
    useEffect(() => {
        if (motionOK) {
            a0.set(seg.a0);
            a1.set(seg.a1);
        } else {
            a0.jump(seg.a0);
            a1.jump(seg.a1);
        }
    }, [seg.a0, seg.a1, motionOK, a0, a1]);

    const d = useTransform([a0, a1], ([s, e]: number[]) => arcPath(c, rc, s, e));
    const ease = useMemo(() => sliceEase(seg.t0, seg.t1, seg.p0, seg.p1), [seg.t0, seg.t1, seg.p0, seg.p1]);

    // Selected: the slice explodes EXPLODE px out along its mid-angle (springing past it
    // as it lands) and a rim ripple fires — once each time it BECOMES selected.
    const pops = usePopCount(selected);
    const mid = (seg.a0 + seg.a1) / 2;
    const out = selected && seg.share < 1 ? EXPLODE : 0;
    const rim = rc + thick / 2;
    const instant = { duration: 0 };
    const shift = !motionOK ? instant : selected ? POP : spring.snappy;

    return (
        <motion.g
            initial={false}
            animate={{ opacity, x: out * Math.sin(mid), y: -out * Math.cos(mid) }}
            transition={{
                opacity: motionOK ? { duration: filtering ? 0.35 : 0.2, ease: EASE_OUT } : instant,
                x: shift,
                y: shift,
            }}
        >
            <motion.path
                d={d}
                strokeWidth={thick}
                strokeLinecap="butt"
                className={cn("fill-none", SERIES_STROKE[seg.color], onClick && "cursor-pointer")}
                initial={motionOK ? { pathLength: 0 } : false}
                animate={{ pathLength: 1 }}
                transition={{ pathLength: { delay, duration: Math.max(0.001, (seg.t1 - seg.t0) * SWEEP), ease } }}
                onClick={onClick}
                onPointerMove={onPointerMove}
                onPointerLeave={onPointerLeave}
            />
            {motionOK && selected && pops > 0 && (
                <motion.path
                    key={pops}
                    strokeWidth={1.5}
                    strokeLinecap="butt"
                    className={cn("pointer-events-none fill-none", SERIES_STROKE[seg.color])}
                    initial={{ d: arcPath(c, rim, seg.a0, seg.a1), opacity: 0.7 }}
                    animate={{ d: arcPath(c, rim + RIPPLE_GROW, seg.a0, seg.a1), opacity: 0 }}
                    transition={{ duration: RIPPLE_S, ease: EASE_OUT }}
                />
            )}
        </motion.g>
    );
}

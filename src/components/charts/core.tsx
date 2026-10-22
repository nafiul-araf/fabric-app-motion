//-----------------------------------------------------------------------
// Chart core — the shared contract every motion chart builds on.
//
//  • useChartRows(spec)  runs the chart's query and returns its rows as
//    plain objects keyed by column `name` ("Cat", "Val", …). While a
//    refetch runs (filters changed) the previous rows stay on screen, so
//    marks spring from old values to new instead of blinking.
//  • <ChartFrame>        fills its (relative) parent, measures it, and
//    renders the loading / error / empty states.
//  • useBuildDelay()     seconds to wait before marks build, so a chart
//    builds after its card has landed in the scene.
//  • Axis + grid helpers, legend, palette classes, the glass tooltip.
//
// Colours are always token classes (fill-series-1, stroke-hairline, …) —
// never raw hex — so light/dark switch without re-rendering data.
//-----------------------------------------------------------------------

import {
    createContext,
    useContext,
    useLayoutEffect,
    useRef,
    useState,
    type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, Inbox } from "lucide-react";
import { useQuery } from "@/data/use-query";
import type { ChartQuery, ColumnDef, Row } from "@/data/types";
import { formatAxis, type Kind } from "@/lib/format";
import { EASE_APPLE, fast } from "@/lib/motion";
import { SelectionApiProvider, useSelectionApi } from "./cross-filter";
import { cn } from "@/lib/utils";

export type { Kind, Row };

/** What every chart is given: a query plus its columns and cross-filter field. */
export type QuerySpec = ChartQuery;

export interface ChartData {
    rows: Row[];
    columns: ColumnDef[];
}

export interface Size {
    width: number;
    height: number;
}

// ---------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------

type ChartState =
    | { status: "loading" }
    | { status: "error"; message: string }
    /** `version` changes whenever a new result arrives. */
    | { status: "ready"; data: ChartData; refreshing: boolean; version: string };

/** Run a chart's query; rows come back keyed by column `name`. */
export function useChartRows(spec: QuerySpec): ChartState {
    const { data, error, version, isLoading } = useQuery(spec);
    if (error && !isLoading) return { status: "error", message: error };
    if (data) return { status: "ready", data: { rows: data, columns: spec.columns }, refreshing: isLoading, version };
    return { status: "loading" };
}

/** Numeric cell or null. */
export function numOf(row: Row, key: string): number | null {
    const v = row[key];
    return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** Text cell ("" for blanks). */
export function textOf(row: Row, key: string): string {
    const v = row[key];
    return v == null ? "" : String(v);
}

// ---------------------------------------------------------------------
// Measurement
// ---------------------------------------------------------------------

/** Observe an element's content box. */
export function useMeasure<T extends HTMLElement>(): [React.RefObject<T | null>, Size] {
    const ref = useRef<T>(null);
    const [size, setSize] = useState<Size>({ width: 0, height: 0 });
    useLayoutEffect(() => {
        const el = ref.current;
        if (!el) return;
        const ro = new ResizeObserver(([entry]) => {
            const { width, height } = entry.contentRect;
            setSize((s) =>
                Math.abs(s.width - width) < 0.5 && Math.abs(s.height - height) < 0.5
                    ? s
                    : { width: Math.floor(width), height: Math.floor(height) },
            );
        });
        ro.observe(el);
        return () => ro.disconnect();
    }, []);
    return [ref, size];
}

// ---------------------------------------------------------------------
// Build timing — charts build after their card lands
// ---------------------------------------------------------------------

/** performance.now() timestamp at which the enclosing card has landed. */
export const BuildContext = createContext<number>(0);

/**
 * The enclosing card's replay cycle (0 = the entrance build). Each new cycle
 * blurs the plot out and remounts it, so its marks build again — the reel's
 * reset → build beat — while the data (and the query) stay put.
 */
export const ReplayContext = createContext<number>(0);

/**
 * Seconds a chart should wait before its marks start building. Read once
 * on first ready render: if data arrived after the card landed, build now.
 */
export function useBuildDelay(): number {
    const readyAt = useContext(BuildContext);
    const [delay] = useState(() => Math.max(0, (readyAt - performance.now()) / 1000));
    return delay;
}

// ---------------------------------------------------------------------
// Frame + states
// ---------------------------------------------------------------------

/** Seconds the outgoing plot takes to blur away on a replay. */
export const REPLAY_EXIT_S = fast(0.32);

export type SkeletonShape = "bars" | "columns" | "line" | "donut" | "table" | "scatter";

function Skeleton({ shape }: { shape: SkeletonShape }) {
    if (shape === "donut") {
        return (
            <div className="flex h-full items-center justify-center gap-xl">
                <div className="km-skeleton aspect-square h-[70%] max-h-48 rounded-full" />
                <div className="flex w-1/3 flex-col gap-s">
                    {[0, 1, 2, 3].map((i) => (
                        <div key={i} className="km-skeleton h-3 rounded-full" style={{ width: `${90 - i * 15}%` }} />
                    ))}
                </div>
            </div>
        );
    }
    if (shape === "table") {
        return (
            <div className="flex h-full flex-col gap-s pt-xs">
                {[0, 1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="km-skeleton h-4 rounded-md" style={{ width: `${100 - (i % 3) * 8}%` }} />
                ))}
            </div>
        );
    }
    if (shape === "bars") {
        return (
            <div className="flex h-full flex-col justify-around gap-s">
                {[92, 74, 61, 48, 36, 25].map((w, i) => (
                    <div key={i} className="km-skeleton h-[9%] rounded-md" style={{ width: `${w}%` }} />
                ))}
            </div>
        );
    }
    if (shape === "columns") {
        return (
            <div className="flex h-full items-end justify-around gap-s">
                {[88, 70, 62, 50, 42, 30, 22].map((h, i) => (
                    <div key={i} className="km-skeleton w-[9%] rounded-md" style={{ height: `${h}%` }} />
                ))}
            </div>
        );
    }
    return <div className="km-skeleton h-full w-full rounded-xl" />;
}

export function ChartError({ message }: { message: string }) {
    return (
        <div
            role="alert"
            className="flex h-full items-start gap-s overflow-auto rounded-xl bg-destructive/10 p-m text-[length:var(--text-200)] text-destructive"
        >
            <AlertTriangle className="icon-size-200 mt-xxs shrink-0" />
            <span className="break-words">{message}</span>
        </div>
    );
}

export function ChartEmpty({ message = "No data for this selection." }: { message?: string }) {
    return (
        <div className="flex h-full flex-col items-center justify-center gap-s text-muted-foreground">
            <Inbox className="icon-size-400" />
            <p className="text-[length:var(--text-200)]">{message}</p>
        </div>
    );
}

interface ChartFrameProps {
    spec: QuerySpec;
    skeleton?: SkeletonShape;
    /** Optional row filter applied before the empty check (e.g. drop blanks). */
    keep?: (row: Row) => boolean;
    children: (data: ChartData, size: Size, refreshing: boolean) => ReactNode;
}

/**
 * Fills its parent (which must be `relative` with a definite height),
 * measures itself, and renders states. `children` only runs once data is
 * ready and the box has a real size.
 */
export function ChartFrame({ spec, skeleton = "columns", keep, children }: ChartFrameProps) {
    const state = useChartRows(spec);
    const [ref, size] = useMeasure<HTMLDivElement>();
    const cycle = useContext(ReplayContext);
    const selection = useSelectionApi(spec.crossFilter);

    let body: ReactNode = null;
    if (state.status === "loading") body = <Skeleton shape={skeleton} />;
    else if (state.status === "error") body = <ChartError message={state.message} />;
    else {
        const rows = keep ? state.data.rows.filter(keep) : state.data.rows;
        if (rows.length === 0) body = <ChartEmpty />;
        else if (size.width > 0 && size.height > 0)
            body = (
                // Replay: the old plot blurs away, then a fresh one mounts and builds.
                // (No initial={false}: it would stop the first plot's marks from building.)
                <AnimatePresence mode="wait">
                    <motion.div
                        // A new result (filters / cross-filter changed) or a reel beat replays the
                        // plot: the old marks blur away, the new ones build from zero. The first
                        // result simply builds — nothing was mounted here while loading.
                        key={`${cycle}|${state.version}`}
                        className="absolute inset-0"
                        exit={{ opacity: 0, scale: 0.985, filter: "blur(8px)" }}
                        transition={{ duration: REPLAY_EXIT_S, ease: EASE_APPLE }}
                    >
                        {children({ rows, columns: state.data.columns }, size, state.refreshing)}
                    </motion.div>
                </AnimatePresence>
            );
    }

    return (
        <div
            ref={ref}
            className={cn(
                "absolute inset-0 transition-opacity duration-300",
                state.status === "ready" && state.refreshing && "opacity-60",
            )}
            aria-busy={state.status === "loading" || (state.status === "ready" && state.refreshing)}
        >
            <SelectionApiProvider value={selection}>{body}</SelectionApiProvider>
        </div>
    );
}

// ---------------------------------------------------------------------
// Palette — static class strings so Tailwind can see them
// ---------------------------------------------------------------------

export const SERIES_FILL = [
    "fill-series-1",
    "fill-series-2",
    "fill-series-3",
    "fill-series-4",
    "fill-series-5",
    "fill-series-6",
    "fill-series-7",
] as const;

export const SERIES_STROKE = [
    "stroke-series-1",
    "stroke-series-2",
    "stroke-series-3",
    "stroke-series-4",
    "stroke-series-5",
    "stroke-series-6",
    "stroke-series-7",
] as const;

/** Legend / tooltip swatch backgrounds. */
export const SERIES_BG = [
    "bg-series-1",
    "bg-series-2",
    "bg-series-3",
    "bg-series-4",
    "bg-series-5",
    "bg-series-6",
    "bg-series-7",
] as const;

/** CSS colour values for places that need a real colour (gradient stops). */
export const SERIES_VAR = [
    "var(--color-series-1)",
    "var(--color-series-2)",
    "var(--color-series-3)",
    "var(--color-series-4)",
    "var(--color-series-5)",
    "var(--color-series-6)",
    "var(--color-series-7)",
] as const;

export const seriesIndex = (i: number) => ((i % SERIES_FILL.length) + SERIES_FILL.length) % SERIES_FILL.length;

// ---------------------------------------------------------------------
// Axis & grid helpers (SVG)
// ---------------------------------------------------------------------

/** Axis/tick text class — muted, 11px, tabular. */
export const AXIS_TEXT = "fill-muted-foreground text-[length:var(--text-100)] tabular";

/** Shorten a category label to roughly `max` characters. */
export function truncateLabel(label: string, max: number): string {
    if (label.length <= max) return label;
    return `${label.slice(0, Math.max(1, max - 1)).trimEnd()}…`;
}

/** Rough text width in px for an 11px label (avoids DOM measurement). */
export function approxTextWidth(label: string, px = 11): number {
    return label.length * px * 0.56;
}

interface GridYProps {
    ticks: number[];
    y: (v: number) => number;
    x0: number;
    x1: number;
    kind: Kind;
    /** Draw labels at x0 - 8 (left axis) or x1 + 8 (right axis), or none. */
    labels?: "left" | "right" | "none";
    /** Emphasise the zero line (diverging charts). */
    zero?: boolean;
}

/** Horizontal hairlines with value labels — the only "axis" these charts draw. */
export function GridY({ ticks, y, x0, x1, kind, labels = "left", zero = false }: GridYProps) {
    return (
        <g aria-hidden>
            {ticks.map((t) => (
                <g key={t}>
                    <line
                        x1={x0}
                        x2={x1}
                        y1={y(t)}
                        y2={y(t)}
                        className={zero && t === 0 ? "stroke-input" : "stroke-hairline"}
                        strokeWidth={1}
                        shapeRendering="crispEdges"
                    />
                    {labels !== "none" && (
                        <text
                            x={labels === "left" ? x0 - 8 : x1 + 8}
                            y={y(t)}
                            dy="0.32em"
                            textAnchor={labels === "left" ? "end" : "start"}
                            className={AXIS_TEXT}
                        >
                            {formatAxis(kind, t)}
                        </text>
                    )}
                </g>
            ))}
        </g>
    );
}

interface GridXProps {
    ticks: number[];
    x: (v: number) => number;
    y0: number;
    y1: number;
    kind: Kind;
    zero?: boolean;
}

/** Vertical hairlines with value labels under the plot (horizontal bar charts). */
export function GridX({ ticks, x, y0, y1, kind, zero = false }: GridXProps) {
    return (
        <g aria-hidden>
            {ticks.map((t) => (
                <g key={t}>
                    <line
                        x1={x(t)}
                        x2={x(t)}
                        y1={y0}
                        y2={y1}
                        className={zero && t === 0 ? "stroke-input" : "stroke-hairline"}
                        strokeWidth={1}
                        shapeRendering="crispEdges"
                    />
                    <text x={x(t)} y={y1 + 14} textAnchor="middle" className={AXIS_TEXT}>
                        {formatAxis(kind, t)}
                    </text>
                </g>
            ))}
        </g>
    );
}

/**
 * Category labels under a band axis. Thins labels (every k-th) when they
 * would collide, and truncates to the band width.
 */
export function BandLabelsX({
    labels,
    x,
    bandwidth,
    y,
}: {
    labels: string[];
    x: (label: string) => number;
    bandwidth: number;
    y: number;
}) {
    // Room per label is the band *step* (bar + gap), not the bar width.
    const step = labels.length > 1 ? Math.abs(x(labels[1]) - x(labels[0])) : bandwidth;
    const room = Math.max(step, bandwidth, 1);
    const longest = Math.max(...labels.map((l) => approxTextWidth(l)), 1);
    const every = Math.max(1, Math.ceil((Math.min(longest, 90) + 8) / room));
    const maxChars = Math.max(3, Math.floor((room * every - 6) / (11 * 0.56)));
    return (
        <g aria-hidden>
            {labels.map((l, i) =>
                i % every === 0 ? (
                    <text key={`${l}-${i}`} x={x(l) + bandwidth / 2} y={y} textAnchor="middle" className={AXIS_TEXT}>
                        <title>{l}</title>
                        {truncateLabel(l, maxChars)}
                    </text>
                ) : null,
            )}
        </g>
    );
}

// ---------------------------------------------------------------------
// Legend
// ---------------------------------------------------------------------

export interface LegendItem {
    label: string;
    /** A bg-* token class (e.g. SERIES_BG[0], "bg-up"). */
    swatch: string;
    /** Dashed swatch for prior-period lines. */
    dashed?: boolean;
    /** Line swatch instead of a dot. */
    line?: boolean;
}

/**
 * The card header's legend slot. When a chart sits in a Card, its legend
 * is portaled up into the header (beside the title) instead of taking a
 * row of plot height — the plot keeps the whole body.
 */
export const LegendSlotContext = createContext<HTMLElement | null>(null);

export function Legend({ items, className }: { items: LegendItem[]; className?: string }) {
    const slot = useContext(LegendSlotContext);
    if (slot) {
        return createPortal(
            <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: fast(0.4), ease: EASE_APPLE, delay: fast(0.2) }}
                className="flex flex-wrap items-center justify-end gap-x-m gap-y-xxs"
            >
                <LegendItems items={items} />
            </motion.div>,
            slot,
        );
    }
    return (
        <div className={cn("flex flex-wrap items-center gap-x-m gap-y-xxs", className)}>
            <LegendItems items={items} />
        </div>
    );
}

function LegendItems({ items }: { items: LegendItem[] }) {
    return (
        <>
            {items.map((it) => (
                <span key={it.label} className="inline-flex items-center gap-xs text-[length:var(--text-200)] text-muted-foreground">
                    {it.line ? (
                        <span
                            className={cn("h-[2px] w-3.5 rounded-full", it.swatch, it.dashed && "opacity-70")}
                            aria-hidden
                        />
                    ) : (
                        <span className={cn("h-2 w-2 rounded-full", it.swatch)} aria-hidden />
                    )}
                    {it.label}
                </span>
            ))}
        </>
    );
}

//-----------------------------------------------------------------------
// Motion table — a real <table> whose rows cascade in (rise, sharpen,
// fade) after the card lands. Numbers are right-aligned tabular figures
// formatted by their column's format string; delta columns carry ▲/▼ and
// sentiment colour; one magnitude column gets a quiet inline bar that
// grows from the left as its row arrives. The header sticks while the
// body scrolls inside the frame. Click a row (or Enter/Space on it) to
// cross-filter the page: it tints, grows an accent bar and gets a light
// sweep while the other rows dim; a click below the rows clears.
//-----------------------------------------------------------------------

import { useEffect, useMemo, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { ColumnDef } from "@/data/types";
import { ChartFrame, numOf, textOf, useBuildDelay, type ChartData, type QuerySpec, type Row } from "./core";
import { useSelection } from "./cross-filter";
import { EASE_APPLE, EASE_OUT, spring, useMotionOK, fast } from "@/lib/motion";
import { formatByKind, formatSignedByKind, kindFromFormat, type Kind } from "@/lib/format";
import { cn } from "@/lib/utils";

interface MotionTableProps {
    spec: QuerySpec;
    /** displayNames rendered as signed, coloured ▲/▼ cells. */
    deltaColumns?: string[];
    /** displayName of a numeric column that gets an inline magnitude bar; default = first numeric non-delta column. */
    barColumn?: string;
}

export function MotionTable({ spec, deltaColumns, barColumn }: MotionTableProps) {
    return (
        <ChartFrame spec={spec} skeleton="table">
            {(data) => <TableInner data={data} deltaColumns={deltaColumns} barColumn={barColumn} />}
        </ChartFrame>
    );
}

// ---------------------------------------------------------------------
// Columns
// ---------------------------------------------------------------------

interface Col {
    name: string;
    label: string;
    numeric: boolean;
    kind: Kind;
    delta: boolean;
    bar: boolean;
}

function toCols(columns: ColumnDef[], rows: Row[], deltaColumns: string[], barColumn: string | undefined): Col[] {
    const deltas = new Set(deltaColumns);
    const cols = columns.map((c, i) => {
        const label = c.displayName ?? c.name;
        // The first column is the row label; others are numeric when formatted or holding numbers.
        const numeric = i > 0 && (c.format != null || rows.some((r) => typeof r[c.name] === "number"));
        return { name: c.name, label, numeric, kind: kindFromFormat(c.format), delta: numeric && deltas.has(label), bar: false };
    });
    const target =
        (barColumn != null ? cols.find((c) => c.numeric && c.label === barColumn) : undefined) ??
        (barColumn == null ? cols.find((c) => c.numeric && !c.delta) : undefined);
    if (target) target.bar = true;
    return cols;
}

/** False until `after` seconds have passed — later rows skip the build delay. */
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
// Table
// ---------------------------------------------------------------------

/** Row stagger (s) and the cap on the whole cascade. */
const STEP = fast(0.035);
const CASCADE = fast(0.8);

const TH = "sticky top-0 z-10 h-8 short:h-7 whitespace-nowrap border-b border-border bg-card px-s align-middle text-[length:var(--text-200)] font-medium text-muted-foreground";
const TD = "h-[29px] short:h-[25px] whitespace-nowrap border-b border-hairline px-s align-middle transition-opacity duration-300 motion-reduce:transition-none";
/** A soft band parked off the row's left edge; sliding the background across sweeps it once. */
const SWEEP = "bg-linear-to-r from-transparent from-40% via-series-1/15 via-50% to-transparent to-60% bg-size-[300%_100%] bg-no-repeat";

interface InnerProps {
    data: ChartData;
    deltaColumns?: string[];
    barColumn?: string;
}

function TableInner({ data, deltaColumns, barColumn }: InnerProps) {
    const buildDelay = useBuildDelay();
    const motionOK = useMotionOK();
    const sel = useSelection();
    const settled = useSettled(buildDelay + CASCADE + 0.6);

    const deltaKey = (deltaColumns ?? []).join("␟");
    const cols = useMemo(
        () => toCols(data.columns, data.rows, deltaKey ? deltaKey.split("␟") : [], barColumn),
        [data.columns, data.rows, deltaKey, barColumn],
    );
    const barCol = cols.find((c) => c.bar);
    const barMax = barCol ? Math.max(0, ...data.rows.map((r) => numOf(r, barCol.name) ?? 0)) : 0;

    const first = cols[0];
    const step = Math.min(STEP, CASCADE / Math.max(data.rows.length, 1));
    const seen = new Map<string, number>();
    const keys = data.rows.map((r) => {
        const base = first ? textOf(r, first.name) : "";
        const n = seen.get(base) ?? 0;
        seen.set(base, n + 1);
        return n ? `${base}#${n}` : base;
    });

    // Cross-filter: rows are the members. This table is the source — it only highlights.
    const onRowKey = (e: ReactKeyboardEvent<HTMLTableRowElement>, row: Row) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        e.preventDefault();
        sel.toggle(row, e);
    };
    /** A click on the blank area below the rows (not the table, not the scrollbar) clears. */
    const onBlankClick = (e: ReactMouseEvent<HTMLDivElement>) => {
        const el = e.currentTarget;
        if (!sel.active || e.target !== el) return;
        if (e.nativeEvent.offsetX > el.clientWidth || e.nativeEvent.offsetY > el.clientHeight) return;
        sel.clear();
    };
    // Room for the selection accent bar left of the first column.
    const firstPad = sel.enabled ? "pl-s" : "pl-xs";

    return (
        <div className="km-scroll absolute inset-0 overflow-auto" onClick={onBlankClick}>
            <table aria-label={first?.label} className="w-full border-separate border-spacing-0 text-[length:var(--text-300)]">
                <thead>
                    <tr>
                        {cols.map((c, ci) => (
                            <th
                                key={c.name}
                                scope="col"
                                className={cn(TH, c.numeric ? "text-right" : "text-left", ci === 0 && ["w-[38%]", firstPad], c.bar && "w-[30%]")}
                            >
                                {c.label}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {data.rows.map((r, i) => {
                        const delay = !motionOK ? 0 : settled ? Math.min(i * 0.02, 0.3) : buildDelay + i * step;
                        const picked = sel.isSelected(r);
                        const dim = sel.active && !picked;
                        return (
                            <motion.tr
                                key={keys[i]}
                                initial={motionOK ? { opacity: 0, y: 8, filter: "blur(4px)", backgroundPositionX: "100%" } : false}
                                animate={{
                                    opacity: 1,
                                    y: 0,
                                    filter: "blur(0px)",
                                    // Becoming selected replays the sweep (left → right) from its parked spot.
                                    ...(motionOK ? { backgroundPositionX: picked ? ["100%", "0%"] : "100%" } : {}),
                                }}
                                transition={{
                                    ...spring.smooth,
                                    delay,
                                    opacity: { duration: fast(0.4), ease: EASE_APPLE, delay },
                                    filter: { duration: fast(0.45), ease: EASE_APPLE, delay },
                                    backgroundPositionX: { duration: fast(0.6), ease: EASE_OUT },
                                }}
                                className={cn(
                                    "transition-colors duration-150 hover:bg-hover",
                                    sel.enabled && "cursor-pointer focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
                                    picked && "bg-accent hover:bg-accent",
                                    picked && motionOK && SWEEP,
                                )}
                                role={sel.enabled ? "button" : undefined}
                                tabIndex={sel.enabled ? 0 : undefined}
                                aria-pressed={sel.enabled ? picked : undefined}
                                onClick={sel.enabled ? (e) => sel.toggle(r, e) : undefined}
                                onKeyDown={sel.enabled ? (e) => onRowKey(e, r) : undefined}
                            >
                                {cols.map((c, ci) => (
                                    <Cell
                                        key={c.name}
                                        col={c}
                                        row={r}
                                        first={ci === 0}
                                        firstPad={firstPad}
                                        barMax={barMax}
                                        delay={delay}
                                        motionOK={motionOK}
                                        picked={picked}
                                        dim={dim}
                                    />
                                ))}
                            </motion.tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}

interface CellProps {
    col: Col;
    row: Row;
    first: boolean;
    /** Left padding class of the first column. */
    firstPad: string;
    barMax: number;
    delay: number;
    motionOK: boolean;
    /** The row is a selected cross-filter member. */
    picked: boolean;
    /** Another row is selected — recede. */
    dim: boolean;
}

function Cell({ col, row, first, firstPad, barMax, delay, motionOK, picked, dim }: CellProps) {
    const fade = dim && "opacity-40";

    if (!col.numeric) {
        const text = textOf(row, col.name);
        return (
            <td className={cn(TD, first && ["relative max-w-0", firstPad], fade)}>
                {first && (
                    <AnimatePresence>
                        {picked && (
                            <motion.span
                                key="mark"
                                aria-hidden
                                className="absolute inset-y-[5px] left-0 w-[3px] rounded-full bg-series-1"
                                initial={motionOK ? { scaleY: 0 } : false}
                                animate={{ scaleY: 1, opacity: 1 }}
                                exit={{ scaleY: 0, opacity: 0 }}
                                transition={spring.grow}
                            />
                        )}
                    </AnimatePresence>
                )}
                <div className={cn("truncate", first ? "text-foreground" : "text-muted-foreground")} title={text}>
                    {text || "—"}
                </div>
            </td>
        );
    }

    const v = numOf(row, col.name);
    if (v == null) {
        return <td className={cn(TD, "tabular text-right text-muted-foreground", fade)}>—</td>;
    }

    if (col.delta) {
        const up = v > 0;
        const down = v < 0;
        return (
            <td className={cn(TD, "tabular text-right", up && "text-positive", down && "text-negative", !up && !down && "text-muted-foreground", fade)}>
                {(up || down) && (
                    <span aria-hidden className="mr-xs text-[length:var(--text-100)]">
                        {up ? "▲" : "▼"}
                    </span>
                )}
                {formatSignedByKind(col.kind, v)}
            </td>
        );
    }

    if (col.bar) {
        const pct = barMax > 0 ? Math.max(0, v) / barMax : 0;
        return (
            <td className={cn(TD, "tabular text-right", fade)}>
                <div className="flex h-5 items-center justify-end gap-s">
                    {/* Magnitude bar: a thin track beside the number (never under it);
                        the fill grows from the left as the row arrives, and again when the row is picked. */}
                    <span aria-hidden className="relative h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
                        <motion.span
                            className="absolute inset-y-0 left-0 rounded-full bg-series-1 transition-[width] duration-500 motion-reduce:transition-none"
                            style={{ width: `${pct * 100}%`, originX: 0 }}
                            initial={motionOK ? { scaleX: 0 } : false}
                            animate={{ scaleX: picked && motionOK ? [0, 1] : 1 }}
                            transition={picked ? spring.grow : { ...spring.grow, delay: delay + 0.08 }}
                        />
                    </span>
                    <span className="shrink-0 text-foreground">{formatByKind(col.kind, v)}</span>
                </div>
            </td>
        );
    }

    return <td className={cn(TD, "tabular text-right text-foreground", fade)}>{formatByKind(col.kind, v)}</td>;
}

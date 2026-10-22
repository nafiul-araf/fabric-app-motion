//-----------------------------------------------------------------------
// Filter sheet — the slicers, Power BI style, in a glass sheet that
// springs in from the right (hidden by default). Edits are staged in a
// draft and only applied on "Apply", so nothing is re-queried on every
// click. Every slicer has search and its own reset; "Reset all"
// restores the defaults. Slicer set follows the active page.
//-----------------------------------------------------------------------

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUp, Check, ChevronDown, RotateCcw, Search, SlidersHorizontal, X } from "lucide-react";
import { spring, useMotionOK, fast, quick } from "@/lib/motion";
import { ALL, DEFAULT_FILTERS, activeFilterCount, membersOf, type Filters } from "@/data/filters";
import { DIM_LABEL } from "@/data/queries";
import type { SlicerKey } from "./nav";
import { cn } from "@/lib/utils";

const FIELD =
    "w-full rounded-xl border border-input bg-card px-m py-s text-[length:var(--text-300)] font-medium text-card-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function SlicerLabel({ label, active, onReset }: { label: string; active: boolean; onReset: () => void }) {
    return (
        <div className="flex items-center justify-between">
            <span className="flex items-center gap-xs text-[length:var(--text-200)] font-medium text-muted-foreground">
                {label}
                {active && <span className="km-spectrum-bg inline-block h-1.5 w-1.5 rounded-full" aria-hidden />}
            </span>
            <AnimatePresence>
                {active && (
                    <motion.button
                        type="button"
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.8 }}
                        transition={spring.snappy}
                        onClick={onReset}
                        aria-label={`Reset ${label}`}
                        title={`Reset ${label}`}
                        className="inline-flex items-center gap-xxs rounded-full px-s py-xxs text-[length:var(--text-200)] font-medium text-accent-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                        <RotateCcw className="icon-size-100" />
                        Reset
                    </motion.button>
                )}
            </AnimatePresence>
        </div>
    );
}

function Option({ selected, onSelect, children }: { selected: boolean; onSelect: () => void; children: ReactNode }) {
    return (
        <li role="option" aria-selected={selected}>
            <button
                type="button"
                onClick={onSelect}
                className={cn(
                    "flex w-full items-center justify-between gap-s px-m py-s text-left text-[length:var(--text-300)] transition-colors",
                    selected ? "bg-accent font-semibold text-accent-foreground" : "text-popover-foreground hover:bg-hover",
                )}
            >
                <span className="truncate">{children}</span>
                {selected && <Check className="icon-size-100 shrink-0" />}
            </button>
        </li>
    );
}

/** Searchable dropdown slicer; the popover is portaled so the sheet never clips it. */
function Slicer({
    label,
    value,
    options,
    onChange,
}: {
    label: string;
    value: string;
    options: readonly string[];
    onChange: (v: string) => void;
}) {
    const active = value !== ALL;
    const [open, setOpen] = useState(false);
    const [q, setQ] = useState("");
    const btnRef = useRef<HTMLButtonElement>(null);
    const popRef = useRef<HTMLDivElement>(null);
    const [pos, setPos] = useState<{ left: number; top: number; width: number; maxHeight: number } | null>(null);

    const place = () => {
        const el = btnRef.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        const top = r.bottom + 6;
        setPos({ left: r.left, top, width: r.width, maxHeight: Math.max(140, Math.min(300, window.innerHeight - top - 12)) });
    };

    useLayoutEffect(() => {
        if (open) place();
    }, [open]);

    useEffect(() => {
        if (!open) return;
        const reposition = () => place();
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                e.stopPropagation();
                setOpen(false);
            }
        };
        const onDown = (e: MouseEvent) => {
            const t = e.target as Node;
            if (!btnRef.current?.contains(t) && !popRef.current?.contains(t)) setOpen(false);
        };
        window.addEventListener("scroll", reposition, true);
        window.addEventListener("resize", reposition);
        document.addEventListener("keydown", onKey, true);
        document.addEventListener("mousedown", onDown);
        return () => {
            window.removeEventListener("scroll", reposition, true);
            window.removeEventListener("resize", reposition);
            document.removeEventListener("keydown", onKey, true);
            document.removeEventListener("mousedown", onDown);
        };
    }, [open]);

    const needle = q.trim().toLowerCase();
    const filtered = needle ? options.filter((o) => o.toLowerCase().includes(needle)) : options;

    const choose = (v: string) => {
        onChange(v);
        setOpen(false);
        setQ("");
    };

    return (
        <div className="flex flex-col gap-xs">
            <SlicerLabel label={label} active={active} onReset={() => onChange(ALL)} />
            <button
                ref={btnRef}
                type="button"
                aria-label={label}
                aria-haspopup="listbox"
                aria-expanded={open}
                onClick={() => setOpen((o) => !o)}
                className={cn(FIELD, "flex items-center justify-between gap-s text-left")}
            >
                <span className={cn("truncate", !active && "text-muted-foreground")}>{value === ALL ? "All" : value}</span>
                <ChevronDown className={cn("icon-size-200 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
            </button>

            {open &&
                pos &&
                createPortal(
                    <motion.div
                        ref={popRef}
                        initial={{ opacity: 0, y: -6, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        transition={spring.snappy}
                        style={{ position: "fixed", left: pos.left, top: pos.top, width: pos.width, transformOrigin: "top center" }}
                        className="km-glass-strong z-[70] flex flex-col overflow-hidden rounded-xl text-popover-foreground shadow-float"
                    >
                        <div className="flex items-center gap-xs border-b border-glass-border px-m py-s">
                            <Search className="icon-size-100 shrink-0 text-muted-foreground" />
                            <input
                                autoFocus
                                value={q}
                                onChange={(e) => setQ(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter" && filtered.length) {
                                        e.preventDefault();
                                        choose(filtered[0]);
                                    }
                                }}
                                placeholder={`Search ${label.toLowerCase()}…`}
                                aria-label={`Search ${label.toLowerCase()}`}
                                autoComplete="off"
                                data-1p-ignore
                                className="w-full bg-transparent text-[length:var(--text-300)] text-popover-foreground placeholder:text-muted-foreground focus:outline-none"
                            />
                        </div>
                        <ul role="listbox" aria-label={label} className="km-scroll overflow-y-auto py-xs" style={{ maxHeight: pos.maxHeight }}>
                            {!needle && (
                                <Option selected={value === ALL} onSelect={() => choose(ALL)}>
                                    All
                                </Option>
                            )}
                            {filtered.length === 0 ? (
                                <li className="px-m py-s text-[length:var(--text-300)] text-muted-foreground">No matches</li>
                            ) : (
                                filtered.map((o) => (
                                    <Option key={o} selected={o === value} onSelect={() => choose(o)}>
                                        {o}
                                    </Option>
                                ))
                            )}
                        </ul>
                    </motion.div>,
                    document.body,
                )}
        </div>
    );
}

function DateRangeSlicer({ from, to, onChange }: { from: string; to: string; onChange: (patch: Partial<Filters>) => void }) {
    const active = from !== DEFAULT_FILTERS.dateFrom || to !== DEFAULT_FILTERS.dateTo;
    return (
        <div className="flex flex-col gap-xs">
            <SlicerLabel
                label="Date range"
                active={active}
                onReset={() => onChange({ dateFrom: DEFAULT_FILTERS.dateFrom, dateTo: DEFAULT_FILTERS.dateTo })}
            />
            <div className="grid grid-cols-2 gap-xs">
                <input
                    type="date"
                    aria-label="Date from"
                    value={from}
                    min={DATA_FIRST}
                    max={to || DATA_LAST}
                    onChange={(e) => onChange({ dateFrom: e.target.value })}
                    className={FIELD}
                />
                <input
                    type="date"
                    aria-label="Date to"
                    value={to}
                    min={from || DATA_FIRST}
                    max={DATA_LAST}
                    onChange={(e) => onChange({ dateTo: e.target.value })}
                    className={FIELD}
                />
            </div>
        </div>
    );
}

/** The sample data covers two calendar years. */
const DATA_FIRST = "2024-01-01";
const DATA_LAST = "2025-12-31";

type ApplyPhase = "idle" | "busy" | "done";

/**
 * "Click → done", from the reference reel: the pill squeezes into a circle
 * whose progress ring fills, turns into a green check with ripples, then
 * the sheet closes. The filters apply on click, so the data is already
 * being queried (the island's live timer) while the button plays out.
 */
function ApplyButton({ dirty, onApply, onClose }: { dirty: boolean; onApply: () => void; onClose: () => void }) {
    const ok = useMotionOK();
    const [phase, setPhase] = useState<ApplyPhase>("idle");
    const timers = useRef<number[]>([]);
    useEffect(() => {
        const list = timers.current;
        return () => list.forEach((t) => window.clearTimeout(t));
    }, []);

    const click = () => {
        onApply();
        if (!ok) {
            onClose();
            return;
        }
        setPhase("busy");
        timers.current.push(window.setTimeout(() => setPhase("done"), fast(700)));
        timers.current.push(window.setTimeout(onClose, fast(1400)));
    };

    const morphing = phase !== "idle";
    const fade = { initial: { opacity: 0, scale: 0.6, filter: "blur(4px)" }, animate: { opacity: 1, scale: 1, filter: "blur(0px)" }, exit: { opacity: 0, scale: 0.6, filter: "blur(4px)" } };

    return (
        <div className="flex justify-center">
            <motion.button
                layout
                type="button"
                onClick={click}
                disabled={!dirty || morphing}
                whileTap={dirty && !morphing ? { scale: 0.97 } : undefined}
                transition={spring.snappy}
                style={{ borderRadius: 999 }}
                aria-label={phase === "done" ? "Filters applied" : phase === "busy" ? "Applying filters" : "Apply filters"}
                className={cn(
                    "relative inline-flex items-center justify-center text-[length:var(--text-300)] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    morphing ? "h-10 w-10" : "w-full px-l py-s",
                    phase === "done"
                        ? "bg-up text-knob"
                        : dirty || morphing
                          ? "bg-primary text-primary-foreground"
                          : "cursor-not-allowed bg-muted text-muted-foreground",
                )}
            >
                {(dirty || morphing) && (
                    <span aria-hidden className="pointer-events-none absolute inset-x-[3px] top-[2px] h-1/2 rounded-full bg-linear-to-b from-gloss to-transparent" />
                )}
                <AnimatePresence mode="wait" initial={false}>
                    {phase === "idle" && (
                        <motion.span key="label" {...fade} transition={{ duration: fast(0.18) }} className="relative whitespace-nowrap">
                            Apply filters
                        </motion.span>
                    )}
                    {phase === "busy" && (
                        <motion.span key="busy" {...fade} transition={{ duration: fast(0.18) }} className="relative flex h-10 w-10 items-center justify-center">
                            <svg viewBox="0 0 40 40" className="absolute inset-0 -rotate-90" aria-hidden>
                                <circle cx="20" cy="20" r="16" className="fill-none stroke-gloss" strokeWidth={3} />
                                <motion.circle
                                    cx="20"
                                    cy="20"
                                    r="16"
                                    className="fill-none stroke-knob"
                                    strokeWidth={3}
                                    strokeLinecap="round"
                                    initial={{ pathLength: 0 }}
                                    animate={{ pathLength: 1 }}
                                    transition={{ duration: fast(0.6), ease: "easeInOut" }}
                                />
                            </svg>
                            <ArrowUp className="icon-size-200" />
                        </motion.span>
                    )}
                    {phase === "done" && (
                        <motion.span key="done" {...fade} transition={spring.bouncy} className="relative flex h-10 w-10 items-center justify-center">
                            {[0, 0.18].map((d) => (
                                <motion.span
                                    key={d}
                                    aria-hidden
                                    className="absolute inset-0 rounded-full border-2 border-up"
                                    initial={{ scale: 1, opacity: 0.6 }}
                                    animate={{ scale: 2.1, opacity: 0 }}
                                    transition={{ duration: fast(0.75), ease: "easeOut", delay: d }}
                                />
                            ))}
                            <Check className="icon-size-300" strokeWidth={3} />
                        </motion.span>
                    )}
                </AnimatePresence>
            </motion.button>
        </div>
    );
}

function differs(a: Filters, b: Filters): boolean {
    return (Object.keys(a) as (keyof Filters)[]).some((k) => a[k] !== b[k]);
}

interface FilterSheetProps {
    open: boolean;
    onClose: () => void;
    applied: Filters;
    slicers: SlicerKey[];
    onApply: (f: Filters) => void;
}

/** The body is mounted only while open, so its draft starts from the applied set each time. */
function SheetBody({ applied, slicers, onApply, onClose }: Omit<FilterSheetProps, "open">) {
    const [draft, setDraft] = useState<Filters>(applied);
    const patch = (p: Partial<Filters>) => setDraft((d) => ({ ...d, ...p }));
    const dirty = differs(draft, applied);
    const canReset = differs(draft, DEFAULT_FILTERS) || differs(applied, DEFAULT_FILTERS);
    const count = activeFilterCount(applied);

    const renderSlicer = (k: SlicerKey) => {
        if (k === "dateRange") return <DateRangeSlicer key={k} from={draft.dateFrom} to={draft.dateTo} onChange={patch} />;
        return (
            <Slicer
                key={k}
                label={DIM_LABEL[k]}
                value={draft[k]}
                options={membersOf(k)}
                onChange={(v) => patch({ [k]: v })}
            />
        );
    };

    return (
        <>
            <header className="flex items-center justify-between gap-s">
                <div className="flex items-center gap-s">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-accent-foreground">
                        <SlidersHorizontal className="icon-size-200" />
                    </span>
                    <div>
                        <h2 className="text-[length:var(--text-500)] font-semibold leading-500 tracking-tight">Filters</h2>
                        <p className="text-[length:var(--text-200)] text-muted-foreground">
                            {count > 0 ? `${count} applied` : "Showing everything"}
                        </p>
                    </div>
                </div>
                <button
                    type="button"
                    onClick={onClose}
                    aria-label="Close filters"
                    className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                    <X className="icon-size-200" />
                </button>
            </header>

            <div className="km-scroll -mx-xs flex min-h-0 flex-1 flex-col gap-l overflow-y-auto px-xs py-l">
                {slicers.map((k, i) => (
                    <motion.div
                        key={k}
                        initial={{ opacity: 0, x: 24 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ ...spring.smooth, delay: fast(0.08) + i * 0.05 }}
                    >
                        {renderSlicer(k)}
                    </motion.div>
                ))}
            </div>

            <footer className="flex flex-col gap-s border-t border-glass-border pt-l">
                <ApplyButton dirty={dirty} onApply={() => onApply(draft)} onClose={onClose} />
                <button
                    type="button"
                    onClick={() => {
                        // Like the original rail: Reset all applies immediately.
                        setDraft(DEFAULT_FILTERS);
                        onApply(DEFAULT_FILTERS);
                    }}
                    disabled={!canReset}
                    className={cn(
                        "inline-flex items-center justify-center gap-xs rounded-full px-l py-s text-[length:var(--text-300)] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        canReset ? "text-foreground hover:bg-hover" : "cursor-not-allowed text-muted-foreground",
                    )}
                >
                    <RotateCcw className="icon-size-200" />
                    Reset all
                </button>
            </footer>
        </>
    );
}

export function FilterSheet({ open, onClose, ...rest }: FilterSheetProps) {
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, [open, onClose]);

    return (
        <AnimatePresence>
            {open && (
                <>
                    <motion.div
                        key="backdrop"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: fast(0.25) }}
                        onClick={onClose}
                        className="fixed inset-0 z-50 bg-backdrop"
                        aria-hidden
                    />
                    <motion.aside
                        key="sheet"
                        role="dialog"
                        aria-modal="true"
                        aria-label="Filters"
                        initial={{ x: "112%", opacity: 0.6 }}
                        animate={{ x: 0, opacity: 1 }}
                        exit={{ x: "112%", opacity: 0.6, transition: quick({ type: "spring", stiffness: 420, damping: 40 }) }}
                        transition={spring.smooth}
                        className="km-glass-strong fixed inset-y-s right-s z-50 flex w-[320px] max-w-[calc(100vw-16px)] flex-col rounded-3xl p-l shadow-float"
                    >
                        <SheetBody onClose={onClose} {...rest} />
                    </motion.aside>
                </>
            )}
        </AnimatePresence>
    );
}

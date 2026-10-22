//-----------------------------------------------------------------------
// Scene hero — "words on screen". Each page opens with a scene counter
// that rolls (01 / 03 → 02 / 03), the title rising word by word from a
// blur while its weight swells from thin to bold, the last word set in
// the accent gradient, and the applied scope underneath. Beside it, the
// page's own KPI strip: tiles rise in sequence and their numbers spin
// into place on odometer wheels.
//
// Both halves are reel actors (see reel.tsx): on their beat the accent
// word "breathes" thin → bold again (the reel's "Weight → bold"), and
// the KPI wheels spin up from zero through a motion blur while the goal
// ring un-winds and closes again ("0 → 12,480", "Rings → closed").
//-----------------------------------------------------------------------

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useAnimationControls } from "framer-motion";
import { Check, MousePointerClick, TrendingDown, TrendingUp, X } from "lucide-react";
import { useQuery } from "@/data/use-query";
import { buildTile, KPI_ICON, type KpiKey, type Tile } from "@/lib/kpi-tiles";
import { formatSignedPercent } from "@/lib/format";
import { EASE_APPLE, EASE_OUT, SCENE, spring, useMotionOK, fast } from "@/lib/motion";
import { kpiSummary } from "@/data/queries";
import { scopeLabel, type Filters } from "@/data/filters";
import { ChartError } from "@/components/charts/core";
import { useCrossFilter } from "@/components/charts/cross-filter";
import { Odometer } from "./odometer";
import { PAGES, PAGE_TITLE, type PageKey } from "./nav";
import { useReelBeat } from "./reel";
import { cn } from "@/lib/utils";

const THIN = 250;
const BOLD = 620;

/** The accent word: rises with the others, then breathes thin → bold on each beat. */
function AccentWord({ word, delay, cycle }: { word: string; delay: number; cycle: number }) {
    const ok = useMotionOK();
    const controls = useAnimationControls();
    useEffect(() => {
        if (!ok) return;
        if (cycle === 0) {
            void controls.start({
                opacity: 1,
                y: "0em",
                filter: "blur(0px)",
                fontWeight: BOLD,
                transition: {
                    ...spring.smooth,
                    delay,
                    opacity: { duration: fast(0.5), ease: EASE_APPLE, delay },
                    filter: { duration: fast(0.55), ease: EASE_APPLE, delay },
                    fontWeight: { duration: fast(1.1), ease: EASE_OUT, delay: delay + 0.1 },
                },
            });
        } else {
            void controls.start({
                fontWeight: [BOLD, THIN, BOLD],
                transition: { fontWeight: { duration: fast(1.8), times: [0, 0.4, 1], ease: "easeInOut" } },
            });
        }
    }, [ok, cycle, controls, delay]);
    return (
        <motion.span
            aria-hidden
            initial={ok ? { opacity: 0, y: "0.45em", filter: "blur(10px)", fontWeight: THIN } : false}
            animate={ok ? controls : undefined}
            className="km-spectrum-text inline-block"
        >
            {word}
        </motion.span>
    );
}

function KineticTitle({ text, cycle }: { text: string; cycle: number }) {
    const ok = useMotionOK();
    const words = text.split(" ");
    const last = words.length - 1;
    return (
        <h1
            aria-label={text}
            className="text-[length:var(--text-hero-800)] font-semibold leading-hero-800 tracking-tight text-foreground short:text-[length:var(--text-hero-700)] short:leading-hero-700"
        >
            {words.map((w, i) => {
                const delay = SCENE.title + i * SCENE.titleWordStep;
                if (i === last && words.length > 1) return <AccentWord key={`${w}-${i}`} word={w} delay={delay} cycle={cycle} />;
                return (
                    <motion.span
                        key={`${w}-${i}`}
                        aria-hidden
                        initial={ok ? { opacity: 0, y: "0.45em", filter: "blur(10px)", fontWeight: THIN } : false}
                        animate={{ opacity: 1, y: "0em", filter: "blur(0px)", fontWeight: BOLD }}
                        transition={{
                            ...spring.smooth,
                            delay,
                            opacity: { duration: fast(0.5), ease: EASE_APPLE, delay },
                            filter: { duration: fast(0.55), ease: EASE_APPLE, delay },
                            fontWeight: { duration: fast(1.1), ease: EASE_OUT, delay: delay + 0.1 },
                        }}
                        className="inline-block"
                    >
                        {w}
                        {i < last && " "}
                    </motion.span>
                );
            })}
        </h1>
    );
}

/** The active cross-filter as a chip — springs in, ✕ clears (so does Esc). */
function SelectionChip() {
    const { selection, setSelection } = useCrossFilter();
    const text = selection ? `${selection.field.label}: ${selection.displays.join(", ")}` : "";
    return (
        <AnimatePresence>
            {selection && (
                <motion.span
                    key="chip"
                    layout
                    initial={{ opacity: 0, scale: 0.6, x: -6, filter: "blur(4px)" }}
                    animate={{ opacity: 1, scale: 1, x: 0, filter: "blur(0px)" }}
                    exit={{ opacity: 0, scale: 0.6, filter: "blur(4px)" }}
                    transition={spring.bouncy}
                    className="inline-flex min-w-0 max-w-[260px] items-center gap-xxs rounded-full bg-primary py-[1px] pl-s pr-xxs text-[length:var(--text-200)] font-semibold text-primary-foreground shadow-card"
                    title={`Cross-filtered by ${text}. Click the selection again, press Esc, or ✕ to clear.`}
                >
                    <MousePointerClick className="icon-size-100 shrink-0" aria-hidden />
                    <motion.span key={text} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="truncate">
                        {text}
                    </motion.span>
                    <button
                        type="button"
                        onClick={() => setSelection(null)}
                        aria-label="Clear cross-filter selection"
                        className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full hover:bg-gloss focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                        <X className="h-3 w-3" strokeWidth={2.5} />
                    </button>
                </motion.span>
            )}
        </AnimatePresence>
    );
}

export function SceneTitle({ page, filters }: { page: PageKey; filters: Filters }) {
    const ok = useMotionOK();
    const [hovered, setHovered] = useState(false);
    const { cycle } = useReelBeat(3.1, hovered);
    const n = PAGES.findIndex((p) => p.key === page) + 1;
    const pad = (x: number) => String(x).padStart(2, "0");
    return (
        <div className="min-w-0" onPointerEnter={() => setHovered(true)} onPointerLeave={() => setHovered(false)}>
            <motion.p
                initial={ok ? { opacity: 0, y: 6 } : false}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: fast(0.4), ease: EASE_APPLE }}
                className="mb-xxs flex items-center gap-s text-[length:var(--text-200)] font-medium text-muted-foreground"
            >
                <span className="inline-flex shrink-0 items-center gap-xxs whitespace-nowrap text-foreground">
                    <Odometer value={pad(n)} />
                    <span className="text-muted-foreground">/ {pad(PAGES.length)}</span>
                </span>
                <span aria-hidden>·</span>
                <span className="min-w-0 truncate">{scopeLabel(filters)}</span>
                <SelectionChip />
            </motion.p>
            <KineticTitle key={page} text={PAGE_TITLE[page]} cycle={cycle} />
        </div>
    );
}

function DeltaChip({ value, label }: { value: number; label: string }) {
    const up = value >= 0;
    return (
        <span className="inline-flex min-w-0 items-center gap-xxs text-[length:var(--text-200)]">
            <span
                className={cn(
                    "inline-flex items-center gap-xxs rounded-full px-s-nudge py-[1px] font-semibold tabular",
                    up ? "bg-up/15 text-positive" : "bg-down/15 text-negative",
                )}
            >
                {up ? <TrendingUp className="icon-size-100" /> : <TrendingDown className="icon-size-100" />}
                {formatSignedPercent(value)}
            </span>
            <span className="truncate text-muted-foreground">{label}</span>
        </span>
    );
}

const RAYS = Array.from({ length: 8 }, (_, i) => (i * Math.PI) / 4);

/**
 * "Rings → closed": an activity-style ring that fills to the share of plan
 * achieved, with a glowing tip; once the goal is hit it closes with a check
 * and a burst of rays. On a replay it first un-winds back to the top.
 */
function GoalRing({ achieved, delay, replay }: { achieved: number; delay: number; replay: boolean }) {
    const ok = useMotionOK();
    const hit = achieved >= 1;
    const p = Math.max(0, Math.min(1, achieved));
    const R = 11;
    const fillT = fast(replay ? 1.9 : 1.1);
    const doneAt = delay + fillT;
    return (
        <span className="relative flex h-7 w-7 shrink-0 items-center justify-center" title={`${(achieved * 100).toFixed(1)}% of plan`}>
            <svg viewBox="0 0 28 28" className="absolute inset-0 -rotate-90 overflow-visible" aria-hidden>
                <circle cx="14" cy="14" r={R} className="fill-none stroke-muted" strokeWidth={3.5} />
                <motion.circle
                    cx="14"
                    cy="14"
                    r={R}
                    className={cn("fill-none", hit ? "stroke-up" : "stroke-series-3")}
                    strokeWidth={3.5}
                    strokeLinecap="round"
                    initial={ok ? { pathLength: replay ? p : 0 } : false}
                    animate={{ pathLength: ok && replay ? [p, 0.001, p] : p }}
                    transition={
                        replay
                            ? { duration: fillT, times: [0, 0.38, 1], ease: ["easeIn", [0.16, 1, 0.3, 1]], delay }
                            : { duration: fillT, ease: [0.16, 1, 0.3, 1], delay }
                    }
                />
                {/* Burst of rays when the ring closes */}
                {ok &&
                    hit &&
                    RAYS.map((a) => (
                        <motion.line
                            key={a}
                            x1={14 + Math.cos(a) * 15}
                            y1={14 + Math.sin(a) * 15}
                            x2={14 + Math.cos(a) * 18}
                            y2={14 + Math.sin(a) * 18}
                            className="stroke-up"
                            strokeWidth={1.5}
                            strokeLinecap="round"
                            initial={{ opacity: 0, pathLength: 0 }}
                            animate={{ opacity: [0, 1, 0], pathLength: [0, 1, 1] }}
                            transition={{ duration: fast(0.7), times: [0, 0.4, 1], ease: "easeOut", delay: doneAt }}
                        />
                    ))}
            </svg>
            {hit && (
                <motion.span
                    initial={ok ? { scale: 0, opacity: 0, filter: "blur(4px)" } : false}
                    animate={{ scale: 1, opacity: 1, filter: "blur(0px)" }}
                    transition={{ ...spring.bouncy, delay: doneAt - fast(0.1) }}
                    className="relative text-up"
                    aria-hidden
                >
                    <Check className="h-3 w-3" strokeWidth={3.5} />
                </motion.span>
            )}
        </span>
    );
}

// Pastel halos cycled across the strip (static strings for Tailwind).
const TILE_HALOS = ["km-halo-1", "km-halo-6", "km-halo-2", "km-halo-3", "km-halo-4", "km-halo-5"] as const;

function KpiTile({ tile, index, kpiKey, cycle, version }: { tile: Tile; index: number; kpiKey: KpiKey; cycle: number; version: string }) {
    const ok = useMotionOK();
    const delay = SCENE.kpis + index * SCENE.kpiStep;
    // Entrance: wheels start once the tile lands. Replays: a left-to-right wave across the strip.
    const spinAt = cycle === 0 ? delay + fast(0.15) : index * fast(0.12);
    const Icon = tile.icon;
    const d = tile.delta;
    const toneText = tile.tone === "up" ? "text-positive" : tile.tone === "down" ? "text-negative" : "text-card-foreground";
    return (
        <motion.div
            initial={ok ? { opacity: 0, y: 18, filter: "blur(8px)" } : false}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            whileHover={{ y: -2 }}
            transition={{
                ...spring.smooth,
                delay,
                opacity: { duration: fast(0.45), ease: EASE_APPLE, delay },
                filter: { duration: fast(0.5), ease: EASE_APPLE, delay },
            }}
            className={cn(
                "km-sheen relative flex min-w-0 flex-col justify-between gap-xs rounded-3xl border border-border bg-card px-l py-m shadow-card short:gap-xxs short:py-s",
                TILE_HALOS[index % TILE_HALOS.length],
            )}
            title={tile.sub ? `${tile.label} — ${tile.sub}` : tile.label}
        >
            <div className="flex min-w-0 items-center justify-between gap-s">
                <p className="truncate text-[length:var(--text-200)] font-medium text-muted-foreground">{tile.label}</p>
                {kpiKey === "budget" && tile.raw != null ? (
                    <GoalRing key={`${cycle}|${version}`} achieved={tile.raw + 1} delay={cycle === 0 ? delay + fast(0.3) : spinAt} replay={cycle > 0} />
                ) : (
                    Icon && <Icon className="icon-size-200 shrink-0 text-muted-foreground" aria-hidden />
                )}
            </div>
            <p className={cn("text-[length:var(--text-hero-700)] font-semibold leading-none tracking-tight short:text-[length:var(--text-600)]", toneText)}>
                {/* Re-keyed on a reel beat or on new (e.g. cross-filtered) data: the wheels spin up again. */}
                <Odometer key={`${cycle}|${version}`} value={tile.value} delay={spinAt} />
            </p>
            <div className="flex min-h-[18px] min-w-0 items-center">
                {d && d.value != null ? (
                    <DeltaChip value={d.value} label={d.label} />
                ) : (
                    tile.sub && <span className="truncate text-[length:var(--text-200)] text-muted-foreground">{tile.sub}</span>
                )}
            </div>
        </motion.div>
    );
}

// Static grid classes keyed by tile count (Tailwind can't see dynamic strings).
const COLS: Record<number, string> = {
    4: "sm:grid-cols-2 lg:grid-cols-4",
    5: "sm:grid-cols-3 lg:grid-cols-5",
    6: "sm:grid-cols-3 lg:grid-cols-6",
};

export function KpiStrip({ filters, keys }: { filters: Filters; keys: KpiKey[] }) {
    const { data, isLoading, error, version } = useQuery(kpiSummary(filters));
    const [hovered, setHovered] = useState(false);
    const { cycle } = useReelBeat(7.6, hovered);
    const cols = COLS[keys.length] ?? COLS[5];

    if (error && !isLoading) {
        return (
            <div className="h-[92px]">
                <ChartError message={error} />
            </div>
        );
    }

    if (!data) {
        return (
            <div className={cn("grid grid-cols-2 gap-m", cols)} aria-busy>
                {keys.map((k) => (
                    <div key={k} className="km-skeleton h-[84px] rounded-3xl short:h-[68px]" />
                ))}
            </div>
        );
    }

    const tiles = keys.map((k) => ({ key: k, tile: { ...buildTile(k, data), icon: KPI_ICON[k] } }));
    // `version` changes with every new result (filters changed): the wheels re-spin.
    return (
        <div
            className={cn("grid grid-cols-2 gap-m transition-opacity duration-300", cols, isLoading && "opacity-70")}
            onPointerEnter={() => setHovered(true)}
            onPointerLeave={() => setHovered(false)}
        >
            {tiles.map(({ key, tile }, i) => (
                <KpiTile key={key} kpiKey={key} tile={tile} index={i} cycle={cycle} version={version} />
            ))}
        </div>
    );
}

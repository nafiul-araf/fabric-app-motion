//-----------------------------------------------------------------------
// Dynamic Island — the app's signature. A black pill at the top centre
// that morphs on one spring between three states:
//   1. live     — while queries are in flight it grows into
//                 a live timer (spectrum ring + elapsed seconds + count);
//   2. landed   — a brief "done in 1.4 s · 7 queries" beat;
//   3. insight  — the page's one-line verdict (headline · detail), which
//                 expands on hover/focus to show the full detail and the
//                 time of the last query;
//   4. on air   — on its reel beat it briefly collapses to a pulsing
//                 "● LIVE · …" pill and springs back.
// Every number comes from the same KPI summary as the KPI tiles, so the
// sentence can't drift from the cards.
//-----------------------------------------------------------------------

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import { Check, Sparkles, TrendingDown, TrendingUp } from "lucide-react";
import { useQuery } from "@/data/use-query";
import { buildInsight } from "@/lib/insight";
import { useQueryActivity } from "@/lib/query-activity";
import { useReelBeat } from "./reel";
import { spring, fast } from "@/lib/motion";
import { kpiSummary } from "@/data/queries";
import type { Filters } from "@/data/filters";
import type { PageKey } from "./nav";
import { cn } from "@/lib/utils";

/** Seconds since `since`, ticking every 100 ms while live. */
function useElapsed(since: number | null): number {
    const [now, setNow] = useState(() => performance.now());
    useEffect(() => {
        if (since == null) return;
        const id = window.setInterval(() => setNow(performance.now()), 100);
        return () => window.clearInterval(id);
    }, [since]);
    return since == null ? 0 : Math.max(0, (now - since) / 1000);
}

type Mode = "live" | "landed" | "onair" | "insight";

const fade = {
    initial: { opacity: 0, filter: "blur(6px)", scale: 0.96 },
    animate: { opacity: 1, filter: "blur(0px)", scale: 1 },
    exit: { opacity: 0, filter: "blur(6px)", scale: 0.96 },
    transition: { duration: fast(0.22) },
};

export function Island({ page, filters }: { page: PageKey; filters: Filters }) {
    const activity = useQueryActivity();
    const elapsed = useElapsed(activity.since);

    const { data } = useQuery(kpiSummary(filters));
    const insight = data ? buildInsight(page, data) : null;

    // "Updated 10:42" — when the last burst of queries landed.
    const [lastAt, setLastAt] = useState<Date | null>(null);
    const lastRefresh = lastAt ? `Updated ${lastAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "";

    // "landed" beat: show for 1.4 s after a burst completes.
    const [landed, setLanded] = useState(false);
    const lastSeen = useRef<number | null>(null);
    useEffect(() => {
        if (activity.inflight > 0 || activity.lastMs == null || activity.lastMs === lastSeen.current) return;
        lastSeen.current = activity.lastMs;
        setLanded(true);
        setLastAt(new Date());
        const id = window.setTimeout(() => setLanded(false), fast(1400));
        return () => window.clearTimeout(id);
    }, [activity.inflight, activity.lastMs]);

    const [open, setOpen] = useState(false);
    const { beat: onAir } = useReelBeat(5.0, open, 2800);

    const mode: Mode =
        activity.inflight > 0 ? "live" : landed || !insight ? "landed" : onAir ? "onair" : "insight";
    const expanded = mode === "insight" && open;

    const ToneIcon = insight?.tone === "good" ? TrendingUp : insight?.tone === "bad" ? TrendingDown : Sparkles;
    const toneText =
        insight?.tone === "good" ? "text-up" : insight?.tone === "bad" ? "text-down" : "text-island-foreground";

    return (
        <LayoutGroup>
            <motion.div
                layout
                transition={spring.island}
                style={{ borderRadius: expanded ? 22 : 999 }}
                role="status"
                aria-live="polite"
                tabIndex={mode === "insight" ? 0 : -1}
                onPointerEnter={() => setOpen(true)}
                onPointerLeave={() => setOpen(false)}
                onFocus={() => setOpen(true)}
                onBlur={() => setOpen(false)}
                className={cn(
                    "relative flex max-w-[min(640px,calc(100vw-360px))] min-w-0 items-center overflow-hidden bg-island text-island-foreground shadow-float",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    expanded ? "px-l py-m" : "h-9 px-m",
                )}
            >
                <AnimatePresence mode="popLayout" initial={false}>
                    {mode === "live" && (
                        <motion.div key="live" {...fade} layout="position" className="flex items-center gap-s whitespace-nowrap">
                            <span className="relative flex h-4 w-4 items-center justify-center" aria-hidden>
                                <span className="km-spectrum-bg km-spin absolute inset-0 rounded-full" />
                                <span className="absolute inset-[3px] rounded-full bg-island" />
                            </span>
                            <span className="text-[length:var(--text-200)] font-medium">Querying</span>
                            <span className="tabular text-[length:var(--text-200)] font-semibold">{elapsed.toFixed(1)}s</span>
                            <span className="text-[length:var(--text-200)] text-island-muted">
                                {activity.inflight} {activity.inflight === 1 ? "query" : "queries"}
                            </span>
                        </motion.div>
                    )}

                    {mode === "landed" && (
                        <motion.div key="landed" {...fade} layout="position" className="flex items-center gap-s whitespace-nowrap">
                            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-up text-island" aria-hidden>
                                <Check className="h-3 w-3" strokeWidth={3} />
                            </span>
                            <span className="text-[length:var(--text-200)] font-medium">Ready</span>
                            {activity.lastMs != null && (
                                <span className="tabular text-[length:var(--text-200)] text-island-muted">
                                    {(activity.lastMs / 1000).toFixed(1)}s · {activity.lastCount}{" "}
                                    {activity.lastCount === 1 ? "query" : "queries"}
                                </span>
                            )}
                        </motion.div>
                    )}

                    {mode === "onair" && (
                        <motion.div key="onair" {...fade} layout="position" className="flex items-center gap-s whitespace-nowrap">
                            <span className="relative flex h-3 w-3 items-center justify-center" aria-hidden>
                                <motion.span
                                    className="absolute inset-0 rounded-full bg-down"
                                    animate={{ scale: [1, 2.2], opacity: [0.55, 0] }}
                                    transition={{ duration: fast(1.1), ease: "easeOut", repeat: Infinity }}
                                />
                                <span className="relative h-2.5 w-2.5 rounded-full bg-down" />
                            </span>
                            <span className="text-[length:var(--text-300)] font-bold tracking-wide">LIVE</span>
                            {lastRefresh && (
                                <span className="text-[length:var(--text-200)] text-island-muted">{lastRefresh}</span>
                            )}
                        </motion.div>
                    )}

                    {mode === "insight" && insight && (
                        <motion.div
                            key={`insight-${page}`}
                            {...fade}
                            layout="position"
                            className={cn("flex min-w-0 gap-s", expanded ? "items-start" : "items-center")}
                        >
                            <ToneIcon className={cn("icon-size-200 shrink-0", toneText)} aria-hidden />
                            {expanded ? (
                                <div className="flex min-w-0 flex-col gap-xxs">
                                    <span className={cn("text-[length:var(--text-300)] font-semibold", toneText)}>
                                        {insight.headline}
                                    </span>
                                    {insight.detail && (
                                        <span className="text-[length:var(--text-200)] text-island-foreground">{insight.detail}</span>
                                    )}
                                    {(lastRefresh || activity.lastMs != null) && (
                                        <span className="tabular text-[length:var(--text-100)] text-island-muted">
                                            {[lastRefresh, activity.lastMs != null && `last read ${(activity.lastMs / 1000).toFixed(1)}s`]
                                                .filter(Boolean)
                                                .join(" · ")}
                                        </span>
                                    )}
                                </div>
                            ) : (
                                <p className="min-w-0 truncate text-[length:var(--text-200)]">
                                    <span className={cn("font-semibold", toneText)}>{insight.headline}</span>
                                    {insight.detail && <span className="text-island-muted"> · {insight.detail}</span>}
                                </p>
                            )}
                        </motion.div>
                    )}
                </AnimatePresence>
            </motion.div>
        </LayoutGroup>
    );
}

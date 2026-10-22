//-----------------------------------------------------------------------
// Stage card — the frame around every chart and table. It rises into the
// scene (blur → sharp, small overshoot), carries a pointer-following
// specular sheen, and publishes the moment it has landed so the chart
// inside builds after it, not underneath the entrance. It is also a reel
// actor: every REEL.period its chart blurs away and builds again, out of
// phase with the other cards; hovering the card holds it still. It also
// carries the card's id for cross-filtering, and a springy filter badge
// whenever another visual's selection is filtering this one.
//-----------------------------------------------------------------------

import { useState, type CSSProperties, type PointerEvent, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Filter } from "lucide-react";
import { BuildContext, LegendSlotContext, REPLAY_EXIT_S, ReplayContext } from "@/components/charts/core";
import { CardIdContext, useCrossFilter } from "@/components/charts/cross-filter";
import { useReelBeat } from "./reel";
import { EASE_APPLE, SCENE, spring, useMotionOK, fast } from "@/lib/motion";
import { cn } from "@/lib/utils";

interface CardProps {
    title: string;
    subtitle?: string;
    /** Right side of the header (legend, toggle). */
    action?: ReactNode;
    /** Order of entrance within the scene. */
    index: number;
    className?: string;
    style?: CSSProperties;
    children: ReactNode;
}

/** Roughly how long the entrance spring takes to settle (s). */
const LAND = fast(0.42);

/** Pastel corner halos, cycled by card order (the reel's tinted tiles). Static for Tailwind. */
const HALOS = ["km-halo-1", "km-halo-6", "km-halo-2", "km-halo-3"] as const;

export function Card({ title, subtitle, action, index, className, style, children }: CardProps) {
    const ok = useMotionOK();
    const delay = SCENE.cards + index * SCENE.cardStep;
    const [entranceReadyAt] = useState(() => performance.now() + (ok ? (delay + LAND + SCENE.buildAfter) * 1000 : 0));
    const [hovered, setHovered] = useState(false);
    const { cycle, at } = useReelBeat(0.3 + index * 1.9, hovered);
    // Replays build as soon as the old plot has blurred away.
    const readyAt = cycle === 0 ? entranceReadyAt : at + REPLAY_EXIT_S * 1000;
    // Charts portal their legend here (callback ref → state so the context updates).
    const [legendSlot, setLegendSlot] = useState<HTMLDivElement | null>(null);
    // Filtered by another visual's selection (the source card itself stays unfiltered).
    const { selection } = useCrossFilter();
    const filteredBy = selection && selection.source !== index ? selection : null;

    const onPointerMove = (e: PointerEvent<HTMLElement>) => {
        const r = e.currentTarget.getBoundingClientRect();
        e.currentTarget.style.setProperty("--mx", `${e.clientX - r.left}px`);
        e.currentTarget.style.setProperty("--my", `${e.clientY - r.top}px`);
    };

    return (
        <motion.section
            initial={ok ? { opacity: 0, y: 26, scale: 0.965, filter: "blur(10px)" } : false}
            animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
            transition={{
                ...spring.smooth,
                delay,
                opacity: { duration: fast(0.45), ease: EASE_APPLE, delay },
                filter: { duration: fast(0.5), ease: EASE_APPLE, delay },
            }}
            onPointerMove={onPointerMove}
            onPointerEnter={() => setHovered(true)}
            onPointerLeave={() => setHovered(false)}
            style={style}
            className={cn(
                // Below lg the page scrolls and each card takes a fixed height;
                // from lg up the bento grid sizes cards to fit the viewport.
                "km-sheen relative flex min-h-0 min-w-0 flex-col rounded-3xl border border-border bg-card p-l shadow-card max-lg:h-[300px] short:px-l short:py-m",
                HALOS[index % HALOS.length],
                className,
            )}
            aria-label={title}
        >
            <header className="mb-s flex min-w-0 items-start justify-between gap-m short:mb-xs">
                <div className="min-w-0">
                    <h3 className="truncate text-[length:var(--text-400)] font-semibold leading-400 tracking-tight text-card-foreground">
                        {/* Scene-style numbering, as in the reel ("01 Bars → trend"). */}
                        <span className="tabular mr-s font-medium text-muted-foreground">{String(index + 1).padStart(2, "0")}</span>
                        {title}
                        {/* Short screens: subtitle rides on the title line to save a row. */}
                        {subtitle && (
                            <span className="hidden text-[length:var(--text-200)] font-normal tracking-normal text-muted-foreground short:inline">
                                {" "}· {subtitle}
                            </span>
                        )}
                    </h3>
                    {subtitle && (
                        <p className="truncate text-[length:var(--text-200)] leading-200 text-muted-foreground short:hidden">{subtitle}</p>
                    )}
                </div>
                <div className="flex max-w-[60%] shrink-0 items-center justify-end gap-m">
                    <AnimatePresence>
                        {filteredBy && (
                            <motion.span
                                key={filteredBy.values.join("|")}
                                initial={{ opacity: 0, scale: 0.6, filter: "blur(4px)" }}
                                animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
                                exit={{ opacity: 0, scale: 0.6, filter: "blur(4px)" }}
                                transition={spring.bouncy}
                                title={`Filtered by ${filteredBy.field.label}: ${filteredBy.displays.join(", ")}`}
                                className="inline-flex max-w-[140px] items-center gap-xxs rounded-full bg-accent px-s py-xxs text-[length:var(--text-100)] font-semibold text-accent-foreground"
                            >
                                <Filter className="icon-size-100 shrink-0" aria-hidden />
                                <span className="truncate">
                                    {filteredBy.displays[0]}
                                    {filteredBy.displays.length > 1 && ` +${filteredBy.displays.length - 1}`}
                                </span>
                            </motion.span>
                        )}
                    </AnimatePresence>
                    <div ref={setLegendSlot} className="min-w-0" />
                    {action}
                </div>
            </header>
            <div className="relative min-h-0 flex-1">
                <LegendSlotContext.Provider value={legendSlot}>
                    <ReplayContext.Provider value={cycle}>
                        <CardIdContext.Provider value={index}>
                            <BuildContext.Provider value={readyAt}>{children}</BuildContext.Provider>
                        </CardIdContext.Provider>
                    </ReplayContext.Provider>
                </LegendSlotContext.Provider>
            </div>
        </motion.section>
    );
}

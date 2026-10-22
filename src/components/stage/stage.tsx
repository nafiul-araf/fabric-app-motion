//-----------------------------------------------------------------------
// Stage — the app shell. A slim top bar (wordmark · Dynamic Island ·
// motion play/pause · filters · glossy theme switch), the active scene,
// and the dock. Pages are scenes: the outgoing one recedes into blur, the
// incoming one opens up out of the dock ("Dock → open") and builds —
// title words, then KPI wheels, then cards, then their marks — and then
// keeps moving on the reel loop (reel.tsx) until paused. Filters are
// global across scenes and change only when the sheet's Apply commits.
//-----------------------------------------------------------------------

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Moon, Pause, Play, SlidersHorizontal, Sun } from "lucide-react";
import { useThemeContext } from "@/lib/theme";
import { DEFAULT_FILTERS, activeFilterCount, type Filters } from "@/data/filters";
import { TooltipProvider } from "@/components/charts/tooltip";
import { CrossFilterProvider, withSelection, type Selection } from "@/components/charts/cross-filter";
import { EASE_APPLE, spring, fast } from "@/lib/motion";
import { OverviewPage } from "@/components/pages/overview";
import { VariancePage } from "@/components/pages/variance";
import { CustomerPage } from "@/components/pages/customer";
import { ProductsPage } from "@/components/pages/products";
import { StageBackdrop } from "./backdrop";
import { GlossySwitch } from "./controls";
import { Dock } from "./dock";
import { FilterSheet } from "./filter-sheet";
import { Island } from "./island";
import { PAGE_SLICERS, type PageKey } from "./nav";
import { ReelProvider, useReel } from "./reel";
import { cn } from "@/lib/utils";

const SCENES: Record<PageKey, (p: { filters: Filters }) => ReactNode> = {
    overview: OverviewPage,
    variance: VariancePage,
    customer: CustomerPage,
    products: ProductsPage,
};

function Wordmark() {
    return (
        <div className="flex min-w-0 items-center gap-s">
            <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden className="shrink-0">
                <rect x="3" y="13" width="4.5" height="8" rx="2.25" className="fill-accent-1" />
                <rect x="9.75" y="8" width="4.5" height="13" rx="2.25" className="fill-accent-2" />
                <rect x="16.5" y="3" width="4.5" height="18" rx="2.25" className="fill-accent-3" />
            </svg>
            <span className="hidden truncate text-[length:var(--text-400)] font-semibold tracking-tight sm:inline">
                Sales <span className="km-spectrum-text">Motion</span>
            </span>
        </div>
    );
}

function FiltersButton({ count, open, onClick }: { count: number; open: boolean; onClick: () => void }) {
    return (
        <motion.button
            type="button"
            onClick={onClick}
            whileTap={{ scale: 0.95 }}
            aria-expanded={open}
            aria-label={count > 0 ? `Filters, ${count} applied` : "Filters"}
            title="Filters"
            className="km-glass relative inline-flex h-[30px] items-center gap-xs rounded-full px-m text-[length:var(--text-300)] font-medium text-foreground transition-colors hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
            <SlidersHorizontal className="icon-size-200" />
            <span className="hidden sm:inline">Filters</span>
            <AnimatePresence>
                {count > 0 && (
                    <motion.span
                        key="count"
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        exit={{ scale: 0 }}
                        transition={spring.bouncy}
                        className="tabular inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary px-xs text-[length:var(--text-100)] font-semibold text-primary-foreground"
                    >
                        {count}
                    </motion.span>
                )}
            </AnimatePresence>
        </motion.button>
    );
}

/** Play/pause the reel loop — glossy pill, like the reel's own controls. */
function MotionToggle() {
    const { playing, togglePlaying } = useReel();
    return (
        <motion.button
            type="button"
            onClick={togglePlaying}
            whileTap={{ scale: 0.95 }}
            aria-pressed={playing}
            aria-label={playing ? "Pause motion" : "Play motion"}
            title={playing ? "Pause the looping motion" : "Play the looping motion"}
            className="km-glass relative inline-flex h-[30px] items-center gap-xs rounded-full px-m text-[length:var(--text-300)] font-medium text-foreground transition-colors hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
            <AnimatePresence mode="wait" initial={false}>
                <motion.span
                    key={playing ? "pause" : "play"}
                    initial={{ scale: 0.5, opacity: 0, rotate: -45 }}
                    animate={{ scale: 1, opacity: 1, rotate: 0 }}
                    exit={{ scale: 0.5, opacity: 0, rotate: 45 }}
                    transition={spring.snappy}
                    className="flex"
                >
                    {playing ? <Pause className="icon-size-200" /> : <Play className="icon-size-200" />}
                </motion.span>
            </AnimatePresence>
            <span className="hidden md:inline">Motion</span>
        </motion.button>
    );
}

export function Stage() {
    const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
    const [page, setPage] = useState<PageKey>("overview");
    const [filtersOpen, setFiltersOpen] = useState(false);
    const { isDark, toggleTheme } = useThemeContext();
    const closeFilters = useCallback(() => setFiltersOpen(false), []);

    // Cross-filter selection (Power BI style) — per page, cleared on page change and Esc.
    const [selection, setSelection] = useState<Selection | null>(null);
    const crossFilter = useMemo(() => ({ selection, setSelection }), [selection]);
    const goTo = useCallback((key: PageKey) => {
        setSelection(null);
        setPage(key);
    }, []);
    useEffect(() => {
        if (!selection) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape" && !filtersOpen) setSelection(null);
        };
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, [selection, filtersOpen]);

    const Scene = SCENES[page];

    return (
        <CrossFilterProvider value={crossFilter}>
        {/* The reel holds while the filter sheet is open or a selection is being explored. */}
        <ReelProvider held={filtersOpen || selection != null}>
        <TooltipProvider>
            <div className="relative flex min-h-dvh flex-col bg-background lg:h-dvh lg:overflow-hidden">
                {/* The reel's set: porcelain grid + corner starbursts. */}
                <StageBackdrop />

                <header className="relative z-30 grid h-[52px] shrink-0 short:h-[46px] grid-cols-[1fr_auto_1fr] items-center gap-m px-l sm:px-xxl">
                    <Wordmark />
                    <Island page={page} filters={withSelection(filters, selection)} />
                    <div className="flex items-center justify-end gap-s">
                        <MotionToggle />
                        <FiltersButton count={activeFilterCount(filters)} open={filtersOpen} onClick={() => setFiltersOpen((o) => !o)} />
                        <GlossySwitch
                            checked={isDark}
                            onChange={toggleTheme}
                            label="Dark mode"
                            onIcon={<Moon className="icon-size-100" />}
                            offIcon={<Sun className="icon-size-100" />}
                        />
                    </div>
                </header>

                <main className={cn("relative z-10 flex min-h-0 flex-1 flex-col px-l pb-[84px] pt-xs sm:px-xxl short:pb-[70px] short:pt-none")}>
                    {/* No initial={false} here: it would block the entrance of everything in the first scene. */}
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={page}
                            className="flex min-h-0 flex-1 flex-col gap-m short:gap-s"
                            // "Dock → open": the scene opens up out of the dock.
                            style={{ transformOrigin: "50% 100%" }}
                            initial={{ opacity: 0, scale: 0.9, y: 48, filter: "blur(14px)" }}
                            animate={{ opacity: 1, scale: 1, y: 0, filter: "blur(0px)" }}
                            exit={{ opacity: 0, scale: 0.97, y: 20, filter: "blur(12px)", transition: { duration: fast(0.26), ease: EASE_APPLE } }}
                            transition={{ ...spring.smooth, opacity: { duration: fast(0.35) }, filter: { duration: fast(0.4) } }}
                        >
                            <Scene filters={filters} />
                        </motion.div>
                    </AnimatePresence>
                </main>

                <Dock active={page} onSelect={goTo} />

                <FilterSheet
                    open={filtersOpen}
                    onClose={closeFilters}
                    applied={filters}
                    slicers={PAGE_SLICERS[page]}
                    onApply={setFilters}
                />
            </div>
        </TooltipProvider>
        </ReelProvider>
        </CrossFilterProvider>
    );
}

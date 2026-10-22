//-----------------------------------------------------------------------
// Dock — page navigation as a macOS-style dock. Tiles magnify with
// pointer proximity on a spring, a glass label rises above the hovered
// tile, the launched tile bounces, and a spectrum dot marks the open page.
// Fully keyboard operable: Tab to a tile, Enter/Space to open, ←/→ to
// move between tiles.
//-----------------------------------------------------------------------

import { useRef, useState, useSyncExternalStore, type KeyboardEvent } from "react";
import {
    AnimatePresence,
    motion,
    useAnimationControls,
    useMotionValue,
    useSpring,
    useTransform,
    type MotionValue,
} from "framer-motion";
import { PAGES, type PageDef, type PageKey } from "./nav";
import { spring, useMotionOK, fast } from "@/lib/motion";
import { cn } from "@/lib/utils";

const REACH = 130;
/** Tile sizes: full, and compact for short desktop viewports (matches the `short` CSS variant). */
const SIZES = { full: { base: 40, peak: 60 }, compact: { base: 34, peak: 50 } };
const SHORT_QUERY = "(min-width: 1024px) and (max-height: 820px)";

function useShortViewport(): boolean {
    return useSyncExternalStore(
        (cb) => {
            const mql = window.matchMedia?.(SHORT_QUERY);
            mql?.addEventListener("change", cb);
            return () => mql?.removeEventListener("change", cb);
        },
        () => window.matchMedia?.(SHORT_QUERY).matches ?? false,
    );
}

// Static class strings so Tailwind generates them.
const TINT_IDLE = [
    "bg-series-1/15 text-series-1",
    "bg-series-2/15 text-series-2",
    "bg-series-3/15 text-series-3",
    "bg-series-4/15 text-series-4",
    "bg-series-5/15 text-series-5",
    "bg-series-6/15 text-series-6",
    "bg-series-7/15 text-series-7",
];
const TINT_ACTIVE = [
    "bg-series-1 text-knob",
    "bg-series-2 text-knob",
    "bg-series-3 text-knob",
    "bg-series-4 text-knob",
    "bg-series-5 text-knob",
    "bg-series-6 text-knob",
    "bg-series-7 text-knob",
];

interface TileProps {
    page: PageDef;
    base: number;
    peak: number;
    active: boolean;
    pointerX: MotionValue<number>;
    onSelect: (key: PageKey) => void;
    onKey: (e: KeyboardEvent<HTMLButtonElement>) => void;
}

function DockTile({ page, base, peak, active, pointerX, onSelect, onKey }: TileProps) {
    const ok = useMotionOK();
    const ref = useRef<HTMLButtonElement>(null);
    const [hover, setHover] = useState(false);
    const bounce = useAnimationControls();

    const distance = useTransform(pointerX, (x) => {
        const r = ref.current?.getBoundingClientRect();
        return r ? x - (r.left + r.width / 2) : REACH * 2;
    });
    const target = useTransform(distance, [-REACH, 0, REACH], [base, ok ? peak : base, base]);
    const size = useSpring(target, { stiffness: 340, damping: 22, mass: 0.35 });
    const iconSize = useTransform(size, [base, peak], [base * 0.45, peak * 0.43]);

    const Icon = page.icon;

    const launch = () => {
        onSelect(page.key);
        if (ok) void bounce.start({ y: [0, -14, 0], transition: { duration: fast(0.55), times: [0, 0.4, 1], ease: "easeOut" } });
    };

    return (
        <div className="relative flex flex-col items-center">
            <AnimatePresence>
                {hover && (
                    <motion.span
                        initial={{ opacity: 0, y: 6, scale: 0.9, filter: "blur(4px)" }}
                        animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
                        exit={{ opacity: 0, y: 4, scale: 0.95 }}
                        transition={spring.snappy}
                        className="km-glass-strong pointer-events-none absolute bottom-full mb-s whitespace-nowrap rounded-lg px-s py-xxs text-[length:var(--text-200)] font-medium text-popover-foreground shadow-float"
                    >
                        {page.label}
                    </motion.span>
                )}
            </AnimatePresence>
            <motion.button
                ref={ref}
                type="button"
                data-dock-tile
                onClick={launch}
                onKeyDown={onKey}
                onPointerEnter={() => setHover(true)}
                onPointerLeave={() => setHover(false)}
                onFocus={() => setHover(true)}
                onBlur={() => setHover(false)}
                animate={bounce}
                style={{ width: size, height: size }}
                aria-label={page.label}
                aria-current={active ? "page" : undefined}
                className={cn(
                    "relative flex items-center justify-center rounded-xl transition-colors duration-300",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    active ? TINT_ACTIVE[page.tint] : TINT_IDLE[page.tint],
                )}
            >
                <span
                    aria-hidden
                    className="pointer-events-none absolute inset-x-[3px] top-[2px] h-1/2 rounded-lg bg-linear-to-b from-gloss to-transparent"
                />
                <motion.span style={{ width: iconSize, height: iconSize }} className="relative flex">
                    <Icon className="h-full w-full" strokeWidth={2} />
                </motion.span>
            </motion.button>
            <span className="mt-[3px] flex h-1 items-center justify-center">
                {active && (
                    <motion.span
                        layoutId="dock-dot"
                        transition={spring.bouncy}
                        className="km-spectrum-bg h-1 w-1 rounded-full"
                        aria-hidden
                    />
                )}
            </span>
        </div>
    );
}

export function Dock({ active, onSelect }: { active: PageKey; onSelect: (key: PageKey) => void }) {
    const pointerX = useMotionValue(Number.POSITIVE_INFINITY);
    const ok = useMotionOK();
    const navRef = useRef<HTMLElement>(null);
    const { base, peak } = useShortViewport() ? SIZES.compact : SIZES.full;

    const onKey = (e: KeyboardEvent<HTMLButtonElement>) => {
        if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
        e.preventDefault();
        const tiles = Array.from(navRef.current?.querySelectorAll<HTMLButtonElement>("[data-dock-tile]") ?? []);
        const i = tiles.indexOf(e.currentTarget);
        const next = tiles[(i + (e.key === "ArrowRight" ? 1 : -1) + tiles.length) % tiles.length];
        next?.focus();
    };

    return (
        <motion.nav
            ref={navRef}
            aria-label="Pages"
            initial={ok ? { y: 90, opacity: 0 } : false}
            animate={{ y: 0, opacity: 1 }}
            transition={{ ...spring.smooth, delay: fast(0.15) }}
            onPointerMove={(e) => pointerX.set(e.clientX)}
            onPointerLeave={() => pointerX.set(Number.POSITIVE_INFINITY)}
            className="km-glass fixed bottom-s left-1/2 z-40 flex h-[60px] max-w-[calc(100vw-16px)] short:h-[50px] -translate-x-1/2 items-end gap-s overflow-visible rounded-4xl px-m pb-[5px] shadow-float"
        >
            {PAGES.map((p) => (
                <DockTile
                    key={`${p.key}-${base}`}
                    page={p}
                    base={base}
                    peak={peak}
                    active={p.key === active}
                    pointerX={pointerX}
                    onSelect={onSelect}
                    onKey={onKey}
                />
            ))}
        </motion.nav>
    );
}

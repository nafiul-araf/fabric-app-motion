//-----------------------------------------------------------------------
// Glass tooltip — one shared layer for every chart. Marks call
// `show(event, content)` on pointer move and `hide()` on leave; the panel
// glides after the pointer on a spring and flips to stay on screen.
// Precise numbers live here, not as data labels on the marks.
//-----------------------------------------------------------------------

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useMotionValue, useSpring } from "framer-motion";
import { cn } from "@/lib/utils";
import { fast } from "@/lib/motion";

export interface TooltipRow {
    label: string;
    value: string;
    /** bg-* swatch class. */
    swatch?: string;
    /** Colour the value by sentiment. */
    tone?: "up" | "down";
}

export interface TooltipContent {
    title: string;
    rows: TooltipRow[];
}

interface PointerLike {
    clientX: number;
    clientY: number;
}

interface TooltipApi {
    show: (e: PointerLike, content: TooltipContent) => void;
    hide: () => void;
}

const TooltipCtx = createContext<TooltipApi>({ show: () => {}, hide: () => {} });

const PANEL_W = 220;

export function TooltipProvider({ children }: { children: ReactNode }) {
    const [content, setContent] = useState<TooltipContent | null>(null);
    const x = useMotionValue(0);
    const y = useMotionValue(0);
    const sx = useSpring(x, { stiffness: 520, damping: 40, mass: 0.6 });
    const sy = useSpring(y, { stiffness: 520, damping: 40, mass: 0.6 });
    const visible = useRef(false);

    const show = useCallback(
        (e: PointerLike, c: TooltipContent) => {
            const flipX = e.clientX + 16 + PANEL_W > window.innerWidth;
            const nx = flipX ? e.clientX - 16 - PANEL_W : e.clientX + 16;
            const ny = Math.min(e.clientY + 14, window.innerHeight - 24 - c.rows.length * 22 - 36);
            if (!visible.current) {
                // First show: jump, don't glide in from the last spot.
                sx.jump(nx);
                sy.jump(ny);
            }
            x.set(nx);
            y.set(ny);
            visible.current = true;
            setContent((prev) =>
                prev && prev.title === c.title && prev.rows.length === c.rows.length && prev.rows.every((r, i) => r.value === c.rows[i].value)
                    ? prev
                    : c,
            );
        },
        [x, y, sx, sy],
    );

    const hide = useCallback(() => {
        visible.current = false;
        setContent(null);
    }, []);

    const api = useMemo(() => ({ show, hide }), [show, hide]);

    return (
        <TooltipCtx.Provider value={api}>
            {children}
            {createPortal(
                <AnimatePresence>
                    {content && (
                        <motion.div
                            key="tip"
                            role="tooltip"
                            initial={{ opacity: 0, scale: 0.94, filter: "blur(4px)" }}
                            animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
                            exit={{ opacity: 0, scale: 0.96, transition: { duration: fast(0.12) } }}
                            transition={{ type: "spring", stiffness: 520, damping: 32 }}
                            style={{ left: sx, top: sy, width: PANEL_W, transformOrigin: "top left" }}
                            className="km-glass-strong pointer-events-none fixed z-[60] rounded-xl px-m py-s shadow-float"
                        >
                            <p className="mb-xs truncate text-[length:var(--text-200)] font-semibold text-popover-foreground">
                                {content.title}
                            </p>
                            <ul className="flex flex-col gap-xxs">
                                {content.rows.map((r) => (
                                    <li key={r.label} className="flex items-center justify-between gap-m text-[length:var(--text-200)]">
                                        <span className="flex min-w-0 items-center gap-xs text-muted-foreground">
                                            {r.swatch && <span className={cn("h-2 w-2 shrink-0 rounded-full", r.swatch)} />}
                                            <span className="truncate">{r.label}</span>
                                        </span>
                                        <span
                                            className={cn(
                                                "tabular shrink-0 font-semibold text-popover-foreground",
                                                r.tone === "up" && "text-positive",
                                                r.tone === "down" && "text-negative",
                                            )}
                                        >
                                            {r.value}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        </motion.div>
                    )}
                </AnimatePresence>,
                document.body,
            )}
        </TooltipCtx.Provider>
    );
}

export function useChartTooltip(): TooltipApi {
    return useContext(TooltipCtx);
}

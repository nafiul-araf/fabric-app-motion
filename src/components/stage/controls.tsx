//-----------------------------------------------------------------------
// Glossy controls — the "springy switch" beat from the reference films.
//  • GlossySwitch: an iOS-style switch whose knob springs across with a
//    little overshoot and stretches while pressed; a gloss layer sits on
//    the track.
//  • Segmented: a pill control whose glossy thumb slides between options
//    on a shared-layout spring.
// Both handlers are plain synchronous state updates (no view transitions).
//-----------------------------------------------------------------------

import { useId, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { spring } from "@/lib/motion";
import { cn } from "@/lib/utils";

interface GlossySwitchProps {
    checked: boolean;
    onChange: () => void;
    label: string;
    /** Glyph inside the knob for each state. */
    onIcon?: ReactNode;
    offIcon?: ReactNode;
}

export function GlossySwitch({ checked, onChange, label, onIcon, offIcon }: GlossySwitchProps) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            aria-label={label}
            title={label}
            onClick={onChange}
            className={cn(
                "relative inline-flex h-[30px] w-[52px] shrink-0 items-center rounded-full p-[3px] transition-colors duration-300",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                checked ? "bg-primary" : "bg-input",
            )}
        >
            {/* gloss on the track */}
            <span
                aria-hidden
                className="pointer-events-none absolute inset-x-[2px] top-[2px] h-1/2 rounded-full bg-linear-to-b from-gloss to-transparent"
            />
            <motion.span
                aria-hidden
                layout
                transition={spring.bouncy}
                whileTap={{ scaleX: 1.18 }}
                className={cn(
                    "relative z-10 flex h-6 w-6 items-center justify-center rounded-full bg-knob text-primary shadow-float",
                    checked ? "ml-auto" : "ml-0",
                )}
            >
                <AnimatePresence mode="wait" initial={false}>
                    <motion.span
                        key={checked ? "on" : "off"}
                        initial={{ opacity: 0, rotate: -90, scale: 0.6 }}
                        animate={{ opacity: 1, rotate: 0, scale: 1 }}
                        exit={{ opacity: 0, rotate: 90, scale: 0.6 }}
                        transition={spring.snappy}
                        className={cn("flex", !checked && "text-muted-foreground")}
                    >
                        {checked ? onIcon : offIcon}
                    </motion.span>
                </AnimatePresence>
            </motion.span>
        </button>
    );
}

interface SegmentedProps<T extends string | number> {
    value: T;
    options: { value: T; label: string }[];
    onChange: (v: T) => void;
    label: string;
}

export function Segmented<T extends string | number>({ value, options, onChange, label }: SegmentedProps<T>) {
    const id = useId();
    return (
        <div role="radiogroup" aria-label={label} className="relative inline-flex rounded-full bg-muted p-[3px]">
            {options.map((o) => {
                const active = o.value === value;
                return (
                    <button
                        key={String(o.value)}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => onChange(o.value)}
                        className={cn(
                            "relative rounded-full px-m py-xxs text-[length:var(--text-200)] font-medium transition-colors",
                            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                            active ? "text-card-foreground" : "text-muted-foreground hover:text-foreground",
                        )}
                    >
                        {active && (
                            <motion.span
                                layoutId={`seg-${id}`}
                                transition={spring.bouncy}
                                className="absolute inset-0 rounded-full bg-card shadow-card"
                                aria-hidden
                            >
                                <span className="absolute inset-x-[2px] top-[1px] h-1/2 rounded-full bg-linear-to-b from-gloss to-transparent" />
                            </motion.span>
                        )}
                        <span className="relative">{o.label}</span>
                    </button>
                );
            })}
        </div>
    );
}

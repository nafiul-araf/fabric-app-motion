//-----------------------------------------------------------------------
// Odometer — a formatted number whose digits spin into place on wheels,
// like the reel's "0 → 12,480" tile: on mount every wheel spins a full
// revolution through a vertical motion blur and the digits land left to
// right; when the value changes (filters) each wheel springs to its new
// digit. Non-digits ($, ., %, B) sit still. Wheels are keyed from the
// right so "$980.5M" → "$4.02B" keeps the columns aligned. Remount it
// (key) to replay the spin. Screen readers get the plain value.
//-----------------------------------------------------------------------

import { motion } from "framer-motion";
import { useMotionOK, fast, quick } from "@/lib/motion";
import { cn } from "@/lib/utils";

/** Two decades on each wheel so the landing spin passes a full revolution. */
const DIGITS = Array.from({ length: 20 }, (_, i) => i % 10);

function Wheel({ digit, delay }: { digit: number; delay: number }) {
    const ok = useMotionOK();
    return (
        <span aria-hidden className="relative block overflow-hidden" style={{ height: "1em", lineHeight: "1em" }}>
            {/* sizes the wheel to one tabular digit */}
            <span className="invisible">0</span>
            <motion.span
                className="absolute inset-x-0 top-0 flex flex-col"
                // Percent of the 20-digit column (5% per digit): Framer interpolates
                // %-based transforms, whereas an `em` y snaps straight to the target.
                initial={ok ? { y: "0%", filter: "blur(0px)" } : false}
                animate={{
                    y: `${-(10 + digit) * 5}%`,
                    filter: ok ? ["blur(0px)", "blur(2.6px)", "blur(0px)"] : "blur(0px)",
                }}
                transition={{
                    y: { ...quick({ type: "spring", stiffness: 120, damping: 20, mass: 1 }), delay },
                    filter: { duration: fast(1.0), times: [0, 0.3, 1], ease: "easeOut", delay },
                }}
            >
                {DIGITS.map((d, i) => (
                    <span key={i} className="block text-center" style={{ height: "1em", lineHeight: "1em" }}>
                        {d}
                    </span>
                ))}
            </motion.span>
        </span>
    );
}

interface OdometerProps {
    value: string;
    /** Seconds before the wheels start (scene choreography). */
    delay?: number;
    /** Extra delay per character — the leftmost digit lands first. */
    stagger?: number;
    className?: string;
}

export function Odometer({ value, delay = 0, stagger = fast(0.06), className }: OdometerProps) {
    const chars = value.split("");
    const n = chars.length;
    return (
        // Every glyph — wheel or static — is a 1em box with a 1em line box and
        // the row aligns box tops, so "$", ".", "%" and the digits share one
        // baseline (inline-block + overflow:hidden would shift the baseline).
        <span className={cn("tabular inline-flex items-start align-top leading-none", className)} role="text" aria-label={value}>
            {chars.map((c, i) => {
                const key = n - i; // position from the right
                return /\d/.test(c) ? (
                    <Wheel key={`d${key}`} digit={Number(c)} delay={delay + i * stagger} />
                ) : (
                    <span key={`s${key}`} aria-hidden className="block" style={{ height: "1em", lineHeight: "1em" }}>
                        {c}
                    </span>
                );
            })}
        </span>
    );
}

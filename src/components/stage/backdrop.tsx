//-----------------------------------------------------------------------
// Stage backdrop — the reference reel's set: porcelain with a faint
// graph-paper grid, and two soft peach starbursts in the top corners that
// turn very slowly (stilled for reduced motion). The bursts are a generic
// rounded sunburst, not a logo.
//
// Also mounts, once, the SVG gradients the charts' glossy marks use
// (global.css maps fill-series-1 / fill-up / fill-down onto them): a
// lighter top fading into the base colour, like the reel's blue bars.
//-----------------------------------------------------------------------

import { cn } from "@/lib/utils";

/** 12 rounded rays of alternating length, radiating from the centre. */
function Burst({ className }: { className?: string }) {
    const rays = Array.from({ length: 12 }, (_, i) => i);
    return (
        <svg viewBox="-100 -100 200 200" className={className} aria-hidden>
            {rays.map((i) => {
                const len = i % 2 === 0 ? 96 : 74;
                const w = i % 2 === 0 ? 17 : 14;
                return (
                    <rect
                        key={i}
                        x={-w / 2}
                        y={-len}
                        width={w}
                        height={len - 10}
                        rx={w / 2}
                        transform={`rotate(${i * 30 + (i % 3) * 4})`}
                        className="fill-burst stroke-burst-edge"
                        strokeWidth={0.8}
                    />
                );
            })}
        </svg>
    );
}

function Grad({ id, top, base }: { id: string; top: string; base: string }) {
    return (
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" style={{ stopColor: top }} />
            <stop offset="100%" style={{ stopColor: base }} />
        </linearGradient>
    );
}

export function StageBackdrop({ className }: { className?: string }) {
    return (
        <div aria-hidden className={cn("km-stage-grid pointer-events-none fixed inset-0 z-0 overflow-hidden", className)}>
            <Burst className="km-burst absolute -left-[170px] -top-[190px] h-[470px] w-[470px]" />
            <Burst className="km-burst-rev absolute -right-[190px] -top-[170px] h-[430px] w-[430px]" />
            <svg width="0" height="0" className="absolute">
                <defs>
                    <Grad id="km-grad-series-1" top="var(--color-series-1-light)" base="var(--color-series-1)" />
                    <Grad id="km-grad-up" top="var(--color-up-light)" base="var(--color-up)" />
                    <Grad id="km-grad-down" top="var(--color-down-light)" base="var(--color-down)" />
                </defs>
            </svg>
        </div>
    );
}

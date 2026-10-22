//-----------------------------------------------------------------------
// Reel — the loop that makes the pages move like the reference GIF.
//
// In the reel every tile runs the same beat on repeat, out of phase with
// its neighbours: HOLD the finished state (with a live accent) → RESET
// through a blur → BUILD again with springy stagger → FINISH flourish.
// Here every "actor" (each card, the KPI strip, the title, the island)
// asks for a beat via useReelBeat(offset): its `cycle` ticks every
// REEL.period seconds at its own offset, so something on screen is
// always moving while each element holds still long enough to read.
//
// Loops stop for: the Motion switch (pause), hover on that actor, the
// filter sheet being open, reduced-motion users, and hidden tabs.
//-----------------------------------------------------------------------

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { fast, useMotionOK } from "@/lib/motion";

export const REEL = {
    /** Seconds between an actor's replays (the reel's own loop is 6 s; a dashboard holds longer). */
    period: fast(9),
    /** Seconds after mount before an actor's first replay (lets the entrance finish and be read). */
    first: fast(6),
} as const;

interface ReelState {
    playing: boolean;
    togglePlaying: () => void;
    /** True while something modal (the filter sheet) has the user's attention. */
    held: boolean;
}

const ReelContext = createContext<ReelState>({ playing: false, togglePlaying: () => {}, held: false });

export function ReelProvider({ held, children }: { held: boolean; children: ReactNode }) {
    const [playing, setPlaying] = useState(true);
    const value = useMemo(() => ({ playing, togglePlaying: () => setPlaying((p) => !p), held }), [playing, held]);
    return <ReelContext.Provider value={value}>{children}</ReelContext.Provider>;
}

export function useReel(): ReelState {
    return useContext(ReelContext);
}

export interface ReelBeat {
    /** Increments on every replay (0 = the first, entrance build). */
    cycle: number;
    /** performance.now() of the latest replay. */
    at: number;
    /** True for `beatMs` after each replay — for actors with a timed "moment" (the island). */
    beat: boolean;
}

/**
 * One actor's place in the reel. `offset` staggers actors; `paused` holds
 * this actor (e.g. while hovered). All state changes happen in timers, so
 * nothing re-renders unless a beat actually fires.
 */
export function useReelBeat(offset: number, paused = false, beatMs = 0): ReelBeat {
    const { playing, held } = useReel();
    const motionOK = useMotionOK();
    const active = playing && !held && !paused && motionOK;
    const [state, setState] = useState<ReelBeat>({ cycle: 0, at: 0, beat: false });

    useEffect(() => {
        if (!active) return;
        const timers: number[] = [];
        const fire = () => {
            if (!document.hidden) {
                setState((s) => ({ cycle: s.cycle + 1, at: performance.now(), beat: beatMs > 0 }));
                if (beatMs > 0) timers.push(window.setTimeout(() => setState((s) => ({ ...s, beat: false })), fast(beatMs)));
            }
            timers.push(window.setTimeout(fire, REEL.period * 1000));
        };
        timers.push(window.setTimeout(fire, (REEL.first + fast(offset)) * 1000));
        return () => {
            timers.forEach((t) => window.clearTimeout(t));
            // Paused mid-beat: don't leave the beat stuck on.
            setState((s) => (s.beat ? { ...s, beat: false } : s));
        };
    }, [active, offset, beatMs]);

    return state;
}

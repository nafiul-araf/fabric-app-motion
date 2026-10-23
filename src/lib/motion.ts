//-----------------------------------------------------------------------
// Motion vocabulary — every animation in the app draws from these.
// Springs for anything that moves; one Apple-style ease for opacity/blur.
// Framer Motion's <MotionConfig reducedMotion="user"> (main.tsx) turns
// transforms off for reduced-motion users; charts additionally skip their
// build-in via useMotionOK().
//
// SPEED is the app's playback rate. Every duration, delay and timeout goes
// through fast(); every spring through quick(), which raises stiffness by
// SPEED² and damping by SPEED — the same spring, played SPEED× faster,
// with exactly the same bounce. Change the one number to retime the app.
//-----------------------------------------------------------------------

import { useReducedMotion, type Transition } from "framer-motion";

/** Playback rate of all motion (1 = the original timing). */
export const SPEED = 1.95;

/** A duration, delay or timeout (seconds or ms) at the app's playback rate. */
export function fast(n: number): number {
    return n / SPEED;
}

/** The same spring, SPEED× faster: identical damping ratio, so identical feel. */
// `const T` keeps literals like type: "spring" from widening to string.
export function quick<const T extends { stiffness?: number; damping?: number }>(s: T): T {
    return { ...s, stiffness: (s.stiffness ?? 100) * SPEED * SPEED, damping: (s.damping ?? 10) * SPEED };
}

/** Apple's long-tail ease-out (fast start, soft landing). */
export const EASE_APPLE = [0.32, 0.72, 0, 1] as const;
/** Expo-style ease-out for line draws and reveals. */
export const EASE_OUT = [0.16, 1, 0.3, 1] as const;

/**
 * Blur fades always tween. A spring overshoots its target, and a blur that
 * dips below blur(0px) is invalid CSS, so pair springs with this for `filter`.
 */
export const BLUR_FADE = { duration: fast(0.3), ease: EASE_OUT };

export const spring = {
    /** UI controls, tooltips, chips. */
    snappy: quick({ type: "spring", stiffness: 420, damping: 34, mass: 0.9 }),
    /** Card and scene entrances, value morphs on filter change. */
    smooth: quick({ type: "spring", stiffness: 190, damping: 26, mass: 1 }),
    /** Marks growing out of the baseline — a touch of overshoot. */
    grow: quick({ type: "spring", stiffness: 240, damping: 22, mass: 0.9 }),
    /** Dock magnification, glossy switch knob. */
    bouncy: quick({ type: "spring", stiffness: 520, damping: 22, mass: 0.7 }),
    /** Dynamic Island morph. */
    island: quick({ type: "spring", stiffness: 360, damping: 30, mass: 0.9 }),
} satisfies Record<string, Transition>;

/** Scene choreography (seconds from page mount). */
export const SCENE = {
    title: fast(0.05),
    titleWordStep: fast(0.06),
    kpis: fast(0.22),
    kpiStep: fast(0.06),
    cards: fast(0.4),
    cardStep: fast(0.08),
    /** Marks start building this long after their card has landed. */
    buildAfter: fast(0.18),
} as const;

/**
 * Per-mark stagger so a series builds left → right, one mark at a time,
 * yet a long series still finishes within `total` seconds.
 */
export function markDelay(i: number, n: number, total = fast(0.75), maxStep = fast(0.07)): number {
    const step = Math.min(maxStep, total / Math.max(n, 1));
    return i * step;
}

/** False when the user asked for reduced motion — skip build-ins entirely. */
export function useMotionOK(): boolean {
    return !useReducedMotion();
}

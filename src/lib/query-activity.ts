//-----------------------------------------------------------------------
// Query activity — a tiny external store counting in-flight queries.
// The Dynamic Island reads it to grow into a live "querying" timer,
// then shrinks back when the last one lands.
//-----------------------------------------------------------------------

import { useSyncExternalStore } from "react";

export interface QueryActivity {
    /** Queries currently in flight. */
    inflight: number;
    /** performance.now() when the current burst started, or null when idle. */
    since: number | null;
    /** Duration (ms) of the last completed burst. */
    lastMs: number | null;
    /** Queries that completed in the last burst. */
    lastCount: number;
}

let state: QueryActivity = { inflight: 0, since: null, lastMs: null, lastCount: 0 };
let burstCount = 0;
const listeners = new Set<() => void>();

function emit(next: QueryActivity) {
    state = next;
    listeners.forEach((l) => l());
}

export function beginQuery(): void {
    if (state.inflight === 0) burstCount = 0;
    burstCount += 1;
    emit({
        ...state,
        inflight: state.inflight + 1,
        since: state.inflight === 0 ? performance.now() : state.since,
    });
}

export function endQuery(): void {
    const inflight = Math.max(0, state.inflight - 1);
    if (inflight === 0 && state.since != null) {
        emit({ inflight, since: null, lastMs: performance.now() - state.since, lastCount: burstCount });
    } else {
        emit({ ...state, inflight });
    }
}

function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

export function useQueryActivity(): QueryActivity {
    return useSyncExternalStore(subscribe, () => state);
}

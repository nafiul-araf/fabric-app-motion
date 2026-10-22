//-----------------------------------------------------------------------
// useQuery — runs a query the way a remote data source would: after a
// short, varied delay, counted by the island's live timer, with results
// cached by key. While a new result is on its way the previous one stays
// on screen (so marks morph instead of blinking), and a query the page
// no longer needs is cancelled, so a stale result can never land.
//-----------------------------------------------------------------------

import { useEffect, useState } from "react";
import { beginQuery, endQuery } from "@/lib/query-activity";
import type { Query } from "./types";

interface Entry<T> {
    value?: T;
    error?: string;
    /** Changes with every computed result — visuals key their replay on it. */
    version: string;
}

const CACHE_MAX = 400;
const cache = new Map<string, Entry<unknown>>();
let counter = 0;

function remember(key: string, entry: Entry<unknown>) {
    cache.set(key, entry);
    if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value as string);
}

/** Simulated round trip: 260–700 ms, fixed per query so cards land in a varied order. */
function latency(key: string): number {
    let h = 0;
    for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
    return 260 + (Math.abs(h) % 440);
}

export interface QueryState<T> {
    data: T | undefined;
    error: string | undefined;
    version: string;
    /** A result for the current key is on its way (`data` may still hold the previous one). */
    isLoading: boolean;
}

export function useQuery<T>(q: Query<T>): QueryState<T> {
    const cached = cache.get(q.key) as Entry<T> | undefined;
    // The last result shown, kept on screen while the next one loads.
    const [last, setLast] = useState<Entry<T> | undefined>(cached);
    if (cached && cached !== last) setLast(cached);

    const { key, run } = q;
    useEffect(() => {
        if (cache.has(key)) return;
        let settled = false;
        beginQuery();
        const id = window.setTimeout(() => {
            let entry: Entry<T>;
            try {
                entry = { value: run(), version: String(++counter) };
            } catch (e) {
                entry = { error: e instanceof Error ? e.message : String(e), version: String(++counter) };
            }
            remember(key, entry);
            settled = true;
            endQuery();
            setLast(entry);
        }, latency(key));
        return () => {
            if (settled) return;
            window.clearTimeout(id);
            endQuery();
        };
        // `run` is a fresh closure every render; `key` identifies the query.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key]);

    const entry = cached ?? last;
    return { data: entry?.value, error: entry?.error, version: entry?.version ?? "", isLoading: !cached };
}

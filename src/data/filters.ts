//-----------------------------------------------------------------------
// Filters — the slicers (date range + single-value dimension pickers)
// plus cross-filter clauses added when a visual is clicked. `factsFor`
// turns them into the order lines a query aggregates; `shift` moves the
// whole selection back N years for prior-year measures, so a month
// picked on the trend compares with the same month a year earlier.
//-----------------------------------------------------------------------

import { dataset, PRODUCTS, type Fact } from "./sample";

export const ALL = "All" as const;

/** Every dimension a visual can break down by or be filtered on. */
export type DimKey = "region" | "category" | "product" | "segment" | "group" | "customer" | "rep" | "month";

export interface Filters {
    /** "YYYY-MM-DD" or "" for an open bound. Month granularity: the day is ignored. */
    dateFrom: string;
    dateTo: string;
    region: string;
    category: string;
    segment: string;
    customer: string;
    rep: string;
    /**
     * Cross-filters from clicking a visual (Power BI style): each clause keeps
     * only the listed members of one dimension. Never set by the slicers; added
     * per visual by the page so the clicked visual itself stays unfiltered.
     */
    extra?: CrossFilterClause[];
}

/** One cross-filter clause: `dim` ∈ `values`. */
export interface CrossFilterClause {
    dim: DimKey;
    values: Array<string | number>;
}

export const DEFAULT_FILTERS: Filters = {
    dateFrom: "2025-01-01",
    dateTo: "2025-12-31",
    region: ALL,
    category: ALL,
    segment: ALL,
    customer: ALL,
    rep: ALL,
};

/** The slicers that pick one member of a dimension. */
export const SLICER_DIMS = ["region", "category", "segment", "customer", "rep"] as const satisfies readonly (keyof Filters & DimKey)[];

/** A fact's member of a dimension. */
export function memberOf(f: Fact, dim: DimKey): string | number {
    if (dim === "month") return f.month;
    if (dim === "category") return PRODUCTS[f.product].category;
    if (dim === "product") return PRODUCTS[f.product].name;
    const c = dataset().customers[f.customer];
    if (dim === "customer") return c.name;
    return c[dim];
}

/** "2025-03-14" → 202503; "" → null. */
function monthOf(iso: string): number | null {
    const m = /^(\d{4})-(\d{2})/.exec(iso);
    return m ? Number(m[1]) * 100 + Number(m[2]) : null;
}

/**
 * The order lines inside the filters, optionally `shift` years earlier
 * (prior year = 1). Months in the date range and in month cross-filters
 * move back together; every other clause stays as is.
 */
export function factsFor(filters: Filters, shift = 0): Fact[] {
    const back = shift * 100;
    const lo = monthOf(filters.dateFrom);
    const hi = monthOf(filters.dateTo);
    const dims = SLICER_DIMS.filter((d) => filters[d] && filters[d] !== ALL);
    const extra = (filters.extra ?? [])
        .filter((c) => c.values.length > 0)
        .map((c) => ({
            dim: c.dim,
            values: new Set(c.dim === "month" ? c.values.map((v) => Number(v) - back) : c.values),
        }));

    return dataset().facts.filter((f) => {
        if (lo != null && f.month < lo - back) return false;
        if (hi != null && f.month > hi - back) return false;
        for (const d of dims) if (memberOf(f, d) !== filters[d]) return false;
        for (const c of extra) if (!c.values.has(memberOf(f, c.dim))) return false;
        return true;
    });
}

/** Distinct members of a dimension, sorted (slicer options). */
export function membersOf(dim: DimKey): string[] {
    const set = new Set<string>();
    for (const f of dataset().facts) set.add(String(memberOf(f, dim)));
    return [...set].sort((a, b) => a.localeCompare(b));
}

/** "2025-01-01" → "01-2025" (mm-YYYY) for display. */
function mmYYYY(iso: string): string {
    const m = /^(\d{4})-(\d{2})/.exec(iso);
    return m ? `${m[2]}-${m[1]}` : "";
}

/** Count of dimension slicers currently applied (non-"All"). */
export function activeFilterCount(f: Filters): number {
    return SLICER_DIMS.filter((d) => f[d] && f[d] !== ALL).length;
}

/** Human-readable scope label for the header. */
export function scopeLabel(f: Filters): string {
    const bits: string[] = [];
    const from = mmYYYY(f.dateFrom);
    const to = mmYYYY(f.dateTo);
    if (!from && !to) bits.push("All dates");
    else bits.push(`${from || "…"} – ${to || "…"}`);
    for (const d of SLICER_DIMS) if (f[d] !== ALL) bits.push(f[d]);
    return bits.join(" · ");
}

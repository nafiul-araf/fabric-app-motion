//-----------------------------------------------------------------------
// Query factories — one per kind of visual. Each takes the filters a
// card should use and returns a ChartQuery: a cache key, the result
// columns, a `run` that aggregates the sample order lines, and the
// cross-filter field its marks stand for. Swap these for real queries
// (SQL, DAX, an API) and the visuals don't change.
//-----------------------------------------------------------------------

import type { Kind } from "@/lib/format";
import { factsFor, memberOf, type DimKey, type Filters } from "./filters";
import { monthLabel, PRODUCTS, type Fact } from "./sample";
import type { ChartQuery, ColumnDef, CrossFilterField, Query, Row } from "./types";

// ---------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------

interface Agg {
    sales: number;
    cost: number;
    units: number;
    budget: number;
    orders: number;
    customers: Set<number>;
    products: Set<number>;
}

const empty = (): Agg => ({ sales: 0, cost: 0, units: 0, budget: 0, orders: 0, customers: new Set(), products: new Set() });

function add(a: Agg, f: Fact) {
    a.sales += f.sales;
    a.cost += f.cost;
    a.units += f.units;
    a.budget += f.budget;
    a.orders += f.orders;
    a.customers.add(f.customer);
    a.products.add(f.product);
}

function total(facts: Fact[]): Agg {
    const a = empty();
    facts.forEach((f) => add(a, f));
    return a;
}

function groupBy(facts: Fact[], dim: DimKey): Map<string | number, Agg> {
    const m = new Map<string | number, Agg>();
    for (const f of facts) {
        const k = memberOf(f, dim);
        let a = m.get(k);
        if (!a) m.set(k, (a = empty()));
        add(a, f);
    }
    return m;
}

// ---------------------------------------------------------------------
// Measures
// ---------------------------------------------------------------------

export interface Measure {
    label: string;
    kind: Kind;
    /** Value for one group, from its current and prior-year totals (null = blank). */
    value: (cur: Agg, py: Agg) => number | null;
}

const ratio = (n: number, d: number) => (d ? n / d : null);
const nz = (v: number) => (v ? v : null);

type MeasureKey = "sales" | "salesPY" | "yoy" | "salesVar" | "gp" | "margin" | "units" | "asp" | "budgetPct" | "customers";

export const M: Record<MeasureKey, Measure> = {
    sales: { label: "Sales", kind: "money", value: (c) => nz(c.sales) },
    salesPY: { label: "Sales PY", kind: "money", value: (_, p) => nz(p.sales) },
    yoy: { label: "YoY %", kind: "percent", value: (c, p) => (p.sales && c.sales ? c.sales / p.sales - 1 : null) },
    salesVar: { label: "Sales Variance", kind: "money", value: (c, p) => (c.sales || p.sales ? c.sales - p.sales : null) },
    gp: { label: "Gross Profit", kind: "money", value: (c) => nz(c.sales - c.cost) },
    margin: { label: "Gross Margin %", kind: "percent", value: (c) => ratio(c.sales - c.cost, c.sales) },
    units: { label: "Units", kind: "count", value: (c) => nz(c.units) },
    asp: { label: "Avg Price", kind: "money", value: (c) => ratio(c.sales, c.units) },
    budgetPct: { label: "Budget Achievement %", kind: "percent", value: (c) => ratio(c.sales, c.budget) },
    customers: { label: "Active Customers", kind: "count", value: (c) => nz(c.customers.size) },
};

const FORMAT: Record<Kind, string> = { money: "$#,0", percent: "0.0%", count: "#,0" };

export const DIM_LABEL: Record<DimKey, string> = {
    region: "Region",
    category: "Category",
    product: "Product",
    segment: "Segment",
    group: "Customer Type",
    customer: "Customer",
    rep: "Sales Rep",
    month: "Month",
};

/** Column name for a label: "Gross Margin %" → "GrossMargin". */
const clean = (label: string) => label.replace(/[\s%$/]+/g, "");

const keyOf = (name: string, ...parts: unknown[]) => `${name}|${JSON.stringify(parts)}`;
const cf = (dim: DimKey, key = "Cat"): CrossFilterField => ({ key, dim, label: DIM_LABEL[dim] });
const MONTH_CF: CrossFilterField = { key: "Sort", dim: "month", label: "Month", displayKey: "Month" };

/** Current and prior-year groups of a dimension (every member that appears in either). */
function groups(filters: Filters, dim: DimKey) {
    const cur = groupBy(factsFor(filters), dim);
    const py = groupBy(factsFor(filters, 1), dim);
    const keys = new Set([...cur.keys(), ...py.keys()]);
    return [...keys].map((k) => ({ key: k, cur: cur.get(k) ?? empty(), py: py.get(k) ?? empty() }));
}

// ---------------------------------------------------------------------
// Chart queries
// ---------------------------------------------------------------------

/** One measure by one dimension, largest first — bars, donut, pie, funnel. */
export function breakdown(dim: DimKey, m: Measure, filters: Filters, opts: { topN?: number } = {}): ChartQuery {
    return {
        key: keyOf("breakdown", dim, m.label, filters, opts),
        columns: [
            { name: "Cat", displayName: DIM_LABEL[dim] },
            { name: "Val", displayName: m.label, format: FORMAT[m.kind] },
        ],
        crossFilter: cf(dim),
        run: () => {
            const rows = groups(filters, dim)
                .map((g) => ({ Cat: g.key, Val: m.value(g.cur, g.py) }))
                .filter((r) => r.Val != null)
                .sort((a, b) => (b.Val ?? 0) - (a.Val ?? 0));
            return opts.topN ? rows.slice(0, opts.topN) : rows;
        },
    };
}

/** A table: one dimension, N measures, sorted by the first measure. */
export function table(dim: DimKey, ms: Measure[], filters: Filters, opts: { topN?: number } = {}): ChartQuery {
    const dimCol = clean(DIM_LABEL[dim]);
    const columns: ColumnDef[] = [
        { name: dimCol, displayName: DIM_LABEL[dim] },
        ...ms.map((m) => ({ name: clean(m.label), displayName: m.label, format: FORMAT[m.kind] })),
    ];
    return {
        key: keyOf("table", dim, ms.map((m) => m.label), filters, opts),
        columns,
        crossFilter: cf(dim, dimCol),
        run: () => {
            const rows = groups(filters, dim)
                .map((g) => {
                    const row: Row = { [dimCol]: g.key };
                    ms.forEach((m) => (row[clean(m.label)] = m.value(g.cur, g.py)));
                    return row;
                })
                .filter((r) => r[clean(ms[0].label)] != null)
                .sort((a, b) => (b[clean(ms[0].label)] as number) - (a[clean(ms[0].label)] as number));
            return opts.topN ? rows.slice(0, opts.topN) : rows;
        },
    };
}

/** Monthly sales and gross margin %, chronological. */
export function monthlyTrend(filters: Filters): ChartQuery {
    return {
        key: keyOf("monthly", filters),
        columns: [
            { name: "Sort", displayName: "Sort" },
            { name: "Month", displayName: "Month" },
            { name: "Sales", displayName: "Sales", format: FORMAT.money },
            { name: "Margin", displayName: "Gross Margin %", format: FORMAT.percent },
        ],
        crossFilter: MONTH_CF,
        run: () =>
            [...groupBy(factsFor(filters), "month")]
                .sort(([a], [b]) => Number(a) - Number(b))
                .map(([month, a]) => ({
                    Sort: month,
                    Month: monthLabel(Number(month)),
                    Sales: a.sales,
                    Margin: ratio(a.sales - a.cost, a.sales),
                })),
    };
}

/**
 * Sales bridge from prior year to current, split into Volume, Price and Mix.
 * Volume: change in units at last year's average price. Price: each product's
 * price change on this year's units. Mix: what's left — the shift between
 * cheap and expensive products. The three steps add up exactly.
 */
export function varianceWaterfall(filters: Filters): ChartQuery {
    return {
        key: keyOf("waterfall", filters),
        columns: [
            { name: "Step", displayName: "Step" },
            { name: "Order", displayName: "Order" },
            { name: "Start", displayName: "Start", format: FORMAT.money },
            { name: "End", displayName: "End", format: FORMAT.money },
            { name: "Kind", displayName: "Kind" },
        ],
        run: () => {
            const cur = factsFor(filters);
            const prior = factsFor(filters, 1);
            const c = total(cur);
            const p = total(prior);
            const volume = p.units ? (c.units - p.units) * (p.sales / p.units) : 0;
            const curBy = groupBy(cur, "product");
            const pyBy = groupBy(prior, "product");
            let price = 0;
            for (const [k, a] of curBy) {
                const b = pyBy.get(k);
                if (b && a.units && b.units) price += (a.sales / a.units - b.sales / b.units) * a.units;
            }
            const mix = c.sales - p.sales - volume - price;
            const dir = (v: number) => (v >= 0 ? "up" : "down");
            const v1 = p.sales + volume;
            const v2 = v1 + price;
            return [
                { Step: "Prior Year", Order: 1, Start: 0, End: p.sales, Kind: "base" },
                { Step: "Volume", Order: 2, Start: p.sales, End: v1, Kind: dir(volume) },
                { Step: "Price", Order: 3, Start: v1, End: v2, Kind: dir(price) },
                { Step: "Mix", Order: 4, Start: v2, End: v2 + mix, Kind: dir(mix) },
                { Step: "Current", Order: 5, Start: 0, End: c.sales, Kind: "total" },
            ];
        },
    };
}

/** Top-N customers by sales with their cumulative share of all sales (Pareto). */
export function concentration(filters: Filters, topN = 15): ChartQuery {
    return {
        key: keyOf("concentration", filters, topN),
        columns: [
            { name: "Cat", displayName: "Customer" },
            { name: "Sales", displayName: "Sales", format: FORMAT.money },
            { name: "Rank", displayName: "Rank" },
            { name: "CumPct", displayName: "Cumulative %", format: FORMAT.percent },
        ],
        crossFilter: cf("customer"),
        run: () => {
            const ranked = [...groupBy(factsFor(filters), "customer")]
                .map(([name, a]) => ({ name, sales: a.sales }))
                .sort((a, b) => b.sales - a.sales);
            const grand = ranked.reduce((s, r) => s + r.sales, 0);
            let cum = 0;
            return ranked.slice(0, topN).map((r, i) => {
                cum += r.sales;
                return { Cat: r.name, Sales: r.sales, Rank: i + 1, CumPct: grand ? cum / grand : null };
            });
        },
    };
}

/** One point per product: sales across, gross margin up, coloured by category. */
export function productScatter(filters: Filters): ChartQuery {
    return {
        key: keyOf("scatter", filters),
        columns: [
            { name: "Name", displayName: "Product" },
            { name: "Series", displayName: "Category" },
            { name: "X", displayName: "Sales", format: FORMAT.money },
            { name: "Y", displayName: "Gross Margin %", format: FORMAT.percent },
        ],
        run: () =>
            [...groupBy(factsFor(filters), "product")]
                .filter(([, a]) => a.sales > 0)
                .map(([name, a]) => ({
                    Name: name,
                    Series: PRODUCTS.find((p) => p.name === name)?.category ?? "",
                    X: a.sales,
                    Y: ratio(a.sales - a.cost, a.sales),
                })),
    };
}

/** A measure by one dimension, split into coloured segments by a second. */
export function stacked(dimX: DimKey, dimSeries: DimKey, m: Measure, filters: Filters): ChartQuery {
    return {
        key: keyOf("stacked", dimX, dimSeries, m.label, filters),
        columns: [
            { name: "Cat", displayName: DIM_LABEL[dimX] },
            { name: "Series", displayName: DIM_LABEL[dimSeries] },
            { name: "Val", displayName: m.label, format: FORMAT[m.kind] },
        ],
        run: () => {
            const rows: Row[] = [];
            const facts = factsFor(filters);
            const prior = factsFor(filters, 1);
            for (const x of groupBy(facts, dimX).keys()) {
                const curBy = groupBy(facts.filter((f) => memberOf(f, dimX) === x), dimSeries);
                const pyBy = groupBy(prior.filter((f) => memberOf(f, dimX) === x), dimSeries);
                for (const [s, a] of curBy) {
                    const v = m.value(a, pyBy.get(s) ?? empty());
                    if (v != null) rows.push({ Cat: x, Series: s, Val: v });
                }
            }
            return rows;
        },
    };
}

// ---------------------------------------------------------------------
// KPI summary — one record behind the KPI strip and the island
// ---------------------------------------------------------------------

export interface KpiRecord {
    sales: number | null;
    salesPY: number | null;
    yoy: number | null;
    salesVar: number | null;
    gp: number | null;
    margin: number | null;
    marginPY: number | null;
    budgetPct: number | null;
    activeCustomers: number | null;
    activeCustomersPY: number | null;
    invoices: number | null;
    units: number | null;
    asp: number | null;
    avgPerCustomer: number | null;
    /** Share of sales from the top 10% of customers. */
    concentrationTop10: number | null;
    activeProducts: number | null;
    topProduct: string;
    topProductSales: number | null;
}

export function kpiSummary(filters: Filters): Query<KpiRecord> {
    return {
        key: keyOf("kpi", filters),
        run: () => {
            const facts = factsFor(filters);
            const c = total(facts);
            const p = total(factsFor(filters, 1));
            const byCustomer = [...groupBy(facts, "customer").values()].map((a) => a.sales).sort((a, b) => b - a);
            const top = byCustomer.slice(0, Math.max(1, Math.ceil(byCustomer.length * 0.1))).reduce((s, v) => s + v, 0);
            const byProduct = [...groupBy(facts, "product")].sort(([, a], [, b]) => b.sales - a.sales)[0];
            return {
                sales: M.sales.value(c, p),
                salesPY: M.salesPY.value(c, p),
                yoy: M.yoy.value(c, p),
                salesVar: M.salesVar.value(c, p),
                gp: M.gp.value(c, p),
                margin: M.margin.value(c, p),
                marginPY: M.margin.value(p, c),
                budgetPct: M.budgetPct.value(c, p),
                activeCustomers: nz(c.customers.size),
                activeCustomersPY: nz(p.customers.size),
                invoices: nz(c.orders),
                units: nz(c.units),
                asp: M.asp.value(c, p),
                avgPerCustomer: ratio(c.sales, c.customers.size),
                concentrationTop10: ratio(top, c.sales),
                activeProducts: nz(c.products.size),
                topProduct: byProduct ? String(byProduct[0]) : "",
                topProductSales: byProduct ? byProduct[1].sales : null,
            };
        },
    };
}

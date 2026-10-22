//-----------------------------------------------------------------------
// KPI tile model — which number each KPI key shows, its delta, tone and
// icon. Pure: every value is read from the one filter-aware KPI summary
// record (data/queries.ts → kpiSummary).
//-----------------------------------------------------------------------

import {
    Boxes,
    Coins,
    DollarSign,
    History,
    Package,
    Percent,
    PieChart,
    Receipt,
    Scale,
    Tag,
    Target,
    TrendingUp,
    UserRound,
    Users,
    type LucideIcon,
} from "lucide-react";
import { formatCurrencyAbbrev, formatInteger, formatPercent, formatSignedPercent } from "@/lib/format";
import type { KpiRecord } from "@/data/queries";

export type KpiKey =
    | "sales"
    | "salesPY"
    | "yoy"
    | "salesVariance"
    | "grossMargin"
    | "grossProfit"
    | "budget"
    | "activeCustomers"
    | "invoices"
    | "avgPerCustomer"
    | "concentration"
    | "units"
    | "asp"
    | "activeProducts";

export type Tone = "up" | "down" | "neutral";

export interface Tile {
    label: string;
    value: string;
    /** The number behind `value` (the goal ring reads it). */
    raw?: number | null;
    sub?: string;
    delta?: { value: number | null; label: string };
    /** Colours the value; defaults to neutral. */
    tone?: Tone;
    icon?: LucideIcon;
}

/** Icon per KPI, shown in each tile's corner. */
export const KPI_ICON: Record<KpiKey, LucideIcon> = {
    sales: DollarSign,
    salesPY: History,
    yoy: TrendingUp,
    salesVariance: Scale,
    grossMargin: Percent,
    grossProfit: Coins,
    budget: Target,
    activeCustomers: Users,
    invoices: Receipt,
    avgPerCustomer: UserRound,
    concentration: PieChart,
    units: Boxes,
    asp: Tag,
    activeProducts: Package,
};

const signTone = (v: number | null): Tone => (v == null ? "neutral" : v >= 0 ? "up" : "down");

export function buildTile(key: KpiKey, k: KpiRecord): Tile {
    switch (key) {
        case "sales":
            return { label: "Total Sales", value: formatCurrencyAbbrev(k.sales), raw: k.sales, delta: { value: k.yoy, label: "vs PY" } };
        case "salesPY":
            return { label: "Sales (Prior Year)", value: formatCurrencyAbbrev(k.salesPY), raw: k.salesPY };
        case "yoy":
            return { label: "YoY Growth", value: formatSignedPercent(k.yoy), raw: k.yoy, tone: signTone(k.yoy), sub: "vs prior year" };
        case "salesVariance":
            return {
                label: "Sales Variance",
                value: formatCurrencyAbbrev(k.salesVar),
                raw: k.salesVar,
                tone: signTone(k.salesVar),
                sub: "vs prior year",
            };
        case "grossMargin":
            return {
                label: "Gross Margin",
                value: formatPercent(k.margin),
                raw: k.margin,
                delta: {
                    value: k.margin != null && k.marginPY != null ? k.margin - k.marginPY : null,
                    label: `vs PY ${formatPercent(k.marginPY)}`,
                },
            };
        case "grossProfit":
            return { label: "Gross Profit", value: formatCurrencyAbbrev(k.gp), raw: k.gp };
        case "budget": {
            const b = k.budgetPct;
            return {
                label: "Budget vs Plan",
                value: formatSignedPercent(b == null ? null : b - 1),
                raw: b == null ? null : b - 1,
                tone: b == null ? "neutral" : b >= 1 ? "up" : "down",
                sub: b == null ? undefined : `${formatPercent(b, 1)} of plan`,
            };
        }
        case "activeCustomers": {
            const v = k.activeCustomers;
            const py = k.activeCustomersPY;
            return {
                label: "Active Customers",
                value: formatInteger(v),
                raw: v,
                delta: v != null && py ? { value: (v - py) / py, label: "vs PY" } : undefined,
                sub: `${formatInteger(k.invoices)} orders`,
            };
        }
        case "invoices":
            return { label: "Orders", value: formatInteger(k.invoices), raw: k.invoices };
        case "avgPerCustomer":
            return { label: "Avg Sales / Customer", value: formatCurrencyAbbrev(k.avgPerCustomer), raw: k.avgPerCustomer, sub: "per active account" };
        case "concentration":
            return { label: "Top 10% Share", value: formatPercent(k.concentrationTop10), raw: k.concentrationTop10, sub: "of total sales" };
        case "units":
            return { label: "Units Sold", value: formatInteger(k.units), raw: k.units };
        case "asp":
            return { label: "Avg Price / Unit", value: formatCurrencyAbbrev(k.asp), raw: k.asp, sub: "across the mix" };
        case "activeProducts":
            return { label: "Active Products", value: formatInteger(k.activeProducts), raw: k.activeProducts, sub: "with sales" };
    }
}

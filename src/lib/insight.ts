//-----------------------------------------------------------------------
// Page insight — a one-line verdict per page (headline + detail + tone)
// for the island, built from the same KPI record as the KPI tiles so
// the sentence can never drift from the numbers beside it. Pure.
//-----------------------------------------------------------------------

import type { KpiRecord } from "@/data/queries";
import type { PageKey } from "@/components/stage/nav";
import {
    formatCurrencyAbbrev as cur,
    formatInteger as int,
    formatPercent as pct,
    formatSignedByKind,
    formatSignedPercent as sPct,
} from "@/lib/format";

/** Signed, abbreviated money ("-$1.4M", not "-$1,419,742"). */
const sCur = (v: number | null) => formatSignedByKind("money", v);
/** Signed integer with a leading "+" for gains. */
const sInt = (v: number | null) => (v == null ? "—" : `${v > 0 ? "+" : ""}${int(v)}`);
/** Join the truthy clauses of a detail line with the dot separator. */
const join = (parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(" · ");

export type InsightTone = "good" | "bad" | "neutral";
export interface Insight {
    headline: string;
    detail: string;
    tone: InsightTone;
}

/**
 * Each page keys its verdict off the metric it's about (margin, growth,
 * customers, products); every clause guards its own null so a blank
 * measure just drops out.
 */
export function buildInsight(page: PageKey, k: KpiRecord): Insight {
    const tone = (d: number | null, band = 0): InsightTone => (d == null ? "neutral" : d > band ? "good" : d < -band ? "bad" : "neutral");
    const pick = (t: InsightTone, good: string, bad: string, flat: string) => (t === "good" ? good : t === "bad" ? bad : flat);

    switch (page) {
        case "overview": {
            const gmDelta = k.margin != null && k.marginPY != null ? k.margin - k.marginPY : null;
            const t = tone(gmDelta, 0.0005);
            return {
                tone: t,
                headline: pick(t, "Margin expanding vs prior year", "Margin compressing vs prior year", "Margin holding vs prior year"),
                detail: join([
                    k.margin != null && `Gross margin ${pct(k.margin)}${gmDelta != null ? ` (${sPct(gmDelta)} vs PY ${pct(k.marginPY)})` : ""}`,
                    k.sales != null && `${cur(k.sales)} sales`,
                ]),
            };
        }
        case "variance": {
            const t = tone(k.salesVar, 0);
            return {
                tone: t,
                headline: pick(t, "Ahead of prior year", "Behind prior year", "Level with prior year"),
                detail: join([
                    k.salesVar != null && `${sCur(k.salesVar)} vs PY`,
                    k.sales != null && k.salesPY != null && `${cur(k.sales)} vs ${cur(k.salesPY)}`,
                ]),
            };
        }
        case "customer": {
            const delta = k.activeCustomers != null && k.activeCustomersPY != null ? k.activeCustomers - k.activeCustomersPY : null;
            const t = tone(delta, 0);
            return {
                tone: t,
                headline: pick(t, "Customer base expanding", "Customer base shrinking", "Customer base steady"),
                detail: join([
                    k.activeCustomers != null && `${int(k.activeCustomers)} active${delta != null ? ` (${sInt(delta)} vs PY)` : ""}`,
                    k.avgPerCustomer != null && `${cur(k.avgPerCustomer)} avg`,
                    k.concentrationTop10 != null && `top 10% = ${pct(k.concentrationTop10)} of sales`,
                ]),
            };
        }
        case "products": {
            const share = k.topProductSales != null && k.sales ? k.topProductSales / k.sales : null;
            return {
                tone: "neutral",
                headline: k.topProduct ? `${k.topProduct} leads` : "No product sales",
                detail: join([
                    share != null && `${pct(share)} of sales`,
                    k.activeProducts != null && `${int(k.activeProducts)} products sold`,
                    k.margin != null && `${pct(k.margin)} margin`,
                ]),
            };
        }
    }
}

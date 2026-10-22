//-----------------------------------------------------------------------
// Formatting helpers for KPI cards and custom numeric displays.
// Chart/grid formatting is handled by columnMetadata format strings;
// these helpers are for the bespoke KPI tiles and the insight banner.
//-----------------------------------------------------------------------

/** Compact currency, e.g. 4023954816 -> "$4.02B". */
export function formatCurrencyAbbrev(value: number | null | undefined): string {
    if (value == null || !Number.isFinite(value)) return "—";
    const abs = Math.abs(value);
    const sign = value < 0 ? "-" : "";
    if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`;
    if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(1)}M`;
    if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(0)}K`;
    return `${sign}$${abs.toFixed(0)}`;
}

/** Full currency with thousands separators, no units, e.g. 4022000000 -> "$4,022,000,000". */
export function formatCurrencyFull(value: number | null | undefined): string {
    if (value == null || !Number.isFinite(value)) return "—";
    return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0,
    }).format(value);
}

/** Ratio (0.294) -> "29.4%". */
export function formatPercent(value: number | null | undefined, digits = 1): string {
    if (value == null || !Number.isFinite(value)) return "—";
    return `${(value * 100).toFixed(digits)}%`;
}

/** Signed ratio (-0.00357) -> "-0.4%", used for deltas. */
export function formatSignedPercent(value: number | null | undefined, digits = 1): string {
    if (value == null || !Number.isFinite(value)) return "—";
    const pct = value * 100;
    return `${pct >= 0 ? "+" : ""}${pct.toFixed(digits)}%`;
}

/** Signed full currency for deltas, e.g. 1234567 -> "+$1,234,567", -500 -> "-$500". */
export function formatSignedCurrency(value: number | null | undefined): string {
    if (value == null || !Number.isFinite(value)) return "—";
    return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0,
        signDisplay: "exceptZero",
    }).format(value);
}

/** Thousands-separated integer. */
export function formatInteger(value: number | null | undefined): string {
    if (value == null || !Number.isFinite(value)) return "—";
    return new Intl.NumberFormat("en-US").format(Math.round(value));
}

/** Value kind shared by charts, tables and tooltips. */
export type Kind = "money" | "percent" | "count";

/** Infer a value kind from a VBA/ECMA format string ("$#,0" → money). */
export function kindFromFormat(format: string | undefined): Kind {
    if (!format) return "count";
    if (format.includes("%")) return "percent";
    if (format.includes("$")) return "money";
    return "count";
}

/** Compact count, e.g. 12400 -> "12.4K". */
export function formatCountAbbrev(value: number | null | undefined): string {
    if (value == null || !Number.isFinite(value)) return "—";
    const abs = Math.abs(value);
    const sign = value < 0 ? "-" : "";
    if (abs >= 1e9) return `${sign}${(abs / 1e9).toFixed(1)}B`;
    if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(1)}M`;
    if (abs >= 1e4) return `${sign}${(abs / 1e3).toFixed(1)}K`;
    return new Intl.NumberFormat("en-US").format(Math.round(value));
}

/** Axis tick label: money in $M (or $B / $K at the extremes), whole %, compact counts. */
export function formatAxis(kind: Kind, value: number): string {
    if (kind === "percent") {
        const pct = value * 100;
        return `${Number.isInteger(Math.round(pct * 10) / 10) ? Math.round(pct) : pct.toFixed(1)}%`;
    }
    if (kind === "count") return formatCountAbbrev(value);
    const abs = Math.abs(value);
    const sign = value < 0 ? "-" : "";
    if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(abs % 1e9 === 0 ? 0 : 1)}B`;
    if (abs >= 1e6) {
        // One decimal below $10M so close ticks ($1.2M, $1.4M) stay distinct.
        const m = abs / 1e6;
        return `${sign}$${m >= 10 || Number.isInteger(m) ? Math.round(m).toLocaleString("en-US") : m.toFixed(1)}M`;
    }
    if (abs >= 1e3) return `${sign}$${Math.round(abs / 1e3)}K`;
    return `${sign}$${Math.round(abs)}`;
}

/** Tooltip / table value by kind. */
export function formatByKind(kind: Kind, value: number | null | undefined): string {
    if (kind === "percent") return formatPercent(value);
    if (kind === "money") return formatCurrencyAbbrev(value);
    return formatInteger(value);
}

/** Signed tooltip / table delta by kind (+$1.2M, -3.4%). */
export function formatSignedByKind(kind: Kind, value: number | null | undefined): string {
    if (value == null || !Number.isFinite(value)) return "—";
    if (kind === "percent") return formatSignedPercent(value);
    const body = kind === "money" ? formatCurrencyAbbrev(Math.abs(value)) : formatInteger(Math.abs(value));
    return `${value > 0 ? "+" : value < 0 ? "-" : ""}${body}`;
}

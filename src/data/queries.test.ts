import { describe, expect, it } from "vitest";
import { DEFAULT_FILTERS, type Filters } from "./filters";
import { breakdown, concentration, kpiSummary, M, monthlyTrend, varianceWaterfall } from "./queries";
import { buildDataset } from "./sample";

const sum = (rows: Record<string, unknown>[], key: string) => rows.reduce((s, r) => s + (r[key] as number), 0);

describe("sample data", () => {
    it("is the same on every build", () => {
        const a = buildDataset();
        const b = buildDataset();
        expect(a.facts.length).toBe(b.facts.length);
        expect(sum(a.facts as never, "sales")).toBe(sum(b.facts as never, "sales"));
    });
});

describe("queries", () => {
    const kpi = kpiSummary(DEFAULT_FILTERS).run();

    it("breaks the KPI total down without losing anything", () => {
        for (const dim of ["region", "category", "segment", "rep"] as const) {
            expect(sum(breakdown(dim, M.sales, DEFAULT_FILTERS).run(), "Val")).toBeCloseTo(kpi.sales ?? 0, 2);
        }
        expect(sum(monthlyTrend(DEFAULT_FILTERS).run(), "Sales")).toBeCloseTo(kpi.sales ?? 0, 2);
    });

    it("bridges prior year to current exactly", () => {
        const steps = varianceWaterfall(DEFAULT_FILTERS).run();
        const mix = steps.find((s) => s.Step === "Mix")!;
        const current = steps.find((s) => s.Step === "Current")!;
        const prior = steps.find((s) => s.Step === "Prior Year")!;
        expect(mix.End).toBeCloseTo(current.End as number, 4);
        expect(prior.End).toBeCloseTo(kpi.salesPY ?? 0, 4);
    });

    it("applies a cross-filter clause to other visuals", () => {
        const coffee: Filters = { ...DEFAULT_FILTERS, extra: [{ dim: "category", values: ["Coffee"] }] };
        const byCategory = breakdown("category", M.sales, DEFAULT_FILTERS).run();
        const coffeeSales = byCategory.find((r) => r.Cat === "Coffee")!.Val as number;
        expect(kpiSummary(coffee).run().sales).toBeCloseTo(coffeeSales, 2);
        expect(sum(breakdown("region", M.sales, coffee).run(), "Val")).toBeCloseTo(coffeeSales, 2);
    });

    it("compares a selected month with the same month a year earlier", () => {
        const march: Filters = { ...DEFAULT_FILTERS, extra: [{ dim: "month", values: [202503] }] };
        const march24: Filters = { ...DEFAULT_FILTERS, dateFrom: "2024-03-01", dateTo: "2024-03-31" };
        expect(kpiSummary(march).run().salesPY).toBeCloseTo(kpiSummary(march24).run().sales ?? 0, 2);
    });

    it("ranks the Pareto curve and ends below 100% for the top 15", () => {
        const rows = concentration(DEFAULT_FILTERS).run();
        expect(rows).toHaveLength(15);
        const shares = rows.map((r) => r.CumPct as number);
        expect([...shares].sort((a, b) => a - b)).toEqual(shares);
        expect(shares[shares.length - 1]).toBeLessThan(1);
    });
});

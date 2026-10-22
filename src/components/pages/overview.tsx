//-----------------------------------------------------------------------
// Overview — the leadership snapshot. Headline KPIs, the monthly sales
// line with margin, the category mix, the regional split and the top
// accounts.
//-----------------------------------------------------------------------

import { Card } from "@/components/stage/card";
import { ScenePage } from "@/components/stage/scene-page";
import { TrendChart } from "@/components/charts/trend-chart";
import { DonutChart } from "@/components/charts/donut-chart";
import { BarChart } from "@/components/charts/bar-chart";
import { MotionTable } from "@/components/charts/motion-table";
import { useCardFilters } from "@/components/charts/cross-filter";
import { breakdown, M, monthlyTrend, table } from "@/data/queries";
import { scopeLabel, type Filters } from "@/data/filters";

export function OverviewPage({ filters }: { filters: Filters }) {
    const label = scopeLabel(filters);
    // Each card queries with the page filters + any cross-filter selection made in ANOTHER card.
    const xf = useCardFilters(filters);
    return (
        <ScenePage page="overview" filters={filters} kpis={["sales", "yoy", "grossMargin", "grossProfit", "budget", "activeCustomers"]}>
            <Card index={0} title="Monthly Sales & Gross Margin" subtitle={`Trend · ${label}`} className="md:col-span-2 lg:col-span-8">
                <TrendChart
                    spec={monthlyTrend(xf(0))}
                    kind="money"
                    rightKind="percent"
                    series={[
                        { key: "Sales", label: "Sales", type: "area", color: 0 },
                        { key: "Margin", label: "Gross Margin %", type: "line", axis: "right", color: 2 },
                    ]}
                />
            </Card>
            <Card index={1} title="Sales by Category" subtitle={label} className="lg:col-span-4">
                <DonutChart spec={breakdown("category", M.sales, xf(1))} kind="money" />
            </Card>
            <Card index={2} title="Sales by Region" subtitle={label} className="lg:col-span-5">
                <BarChart spec={breakdown("region", M.sales, xf(2))} kind="money" orientation="vertical" />
            </Card>
            <Card index={3} title="Top Customers" subtitle={`Top 10 by sales · ${label}`} className="md:col-span-2 lg:col-span-7">
                <MotionTable spec={table("customer", [M.sales, M.margin, M.yoy], xf(3), { topN: 10 })} deltaColumns={["YoY %"]} />
            </Card>
        </ScenePage>
    );
}

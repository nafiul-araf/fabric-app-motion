//-----------------------------------------------------------------------
// Variance — "why did sales move" vs prior year. A price-volume-mix
// bridge from prior year to current, diverging bars that localise the
// variance by region and category, and a sales-rep detail table.
//-----------------------------------------------------------------------

import { Card } from "@/components/stage/card";
import { ScenePage } from "@/components/stage/scene-page";
import { WaterfallChart } from "@/components/charts/waterfall-chart";
import { BarChart } from "@/components/charts/bar-chart";
import { MotionTable } from "@/components/charts/motion-table";
import { useCardFilters } from "@/components/charts/cross-filter";
import { breakdown, M, table, varianceWaterfall } from "@/data/queries";
import { scopeLabel, type Filters } from "@/data/filters";

export function VariancePage({ filters }: { filters: Filters }) {
    const label = scopeLabel(filters);
    const xf = useCardFilters(filters);
    return (
        <ScenePage page="variance" filters={filters} kpis={["salesVariance", "sales", "salesPY", "yoy", "budget"]}>
            <Card
                index={0}
                title="Sales Bridge — Prior Year → Current"
                subtitle={`Volume · Price · Mix · ${label}`}
                className="md:col-span-2 lg:col-span-7"
            >
                <WaterfallChart spec={varianceWaterfall(xf(0))} />
            </Card>
            <Card index={1} title="Sales Variance by Region" subtitle={`vs prior year · ${label}`} className="lg:col-span-5">
                <BarChart spec={breakdown("region", M.salesVar, xf(1))} kind="money" tone="signed" />
            </Card>
            <Card index={2} title="Sales Variance by Category" subtitle={`vs prior year · ${label}`} className="lg:col-span-5">
                <BarChart spec={breakdown("category", M.salesVar, xf(2))} kind="money" tone="signed" />
            </Card>
            <Card index={3} title="Variance by Sales Rep" subtitle={label} className="md:col-span-2 lg:col-span-7">
                <MotionTable
                    spec={table("rep", [M.sales, M.salesPY, M.salesVar, M.yoy], xf(3))}
                    deltaColumns={["Sales Variance", "YoY %"]}
                />
            </Card>
        </ScenePage>
    );
}

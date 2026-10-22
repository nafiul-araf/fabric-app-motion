//-----------------------------------------------------------------------
// Customers — who drives sales. Sales reps as a tall ranked column,
// segments as a funnel, customer types as a pie, and revenue
// concentration over the top 15 accounts (sales bars + cumulative share).
//-----------------------------------------------------------------------

import { Card } from "@/components/stage/card";
import { ScenePage } from "@/components/stage/scene-page";
import { BarChart } from "@/components/charts/bar-chart";
import { FunnelChart } from "@/components/charts/funnel-chart";
import { DonutChart } from "@/components/charts/donut-chart";
import { ComboChart } from "@/components/charts/combo-chart";
import { useCardFilters } from "@/components/charts/cross-filter";
import { breakdown, concentration, M } from "@/data/queries";
import { scopeLabel, type Filters } from "@/data/filters";

export function CustomerPage({ filters }: { filters: Filters }) {
    const label = scopeLabel(filters);
    const xf = useCardFilters(filters);
    return (
        <ScenePage page="customer" filters={filters} kpis={["activeCustomers", "sales", "invoices", "avgPerCustomer", "yoy"]}>
            <Card index={0} title="Sales by Sales Rep" subtitle={label} className="lg:col-span-4 lg:row-span-2 max-lg:h-[400px]">
                <BarChart spec={breakdown("rep", M.sales, xf(0))} kind="money" />
            </Card>
            <Card index={1} title="Sales by Segment" subtitle={label} className="lg:col-span-4">
                <FunnelChart spec={breakdown("segment", M.sales, xf(1))} kind="money" />
            </Card>
            <Card index={2} title="Sales by Customer Type" subtitle={label} className="lg:col-span-4">
                <DonutChart spec={breakdown("group", M.sales, xf(2))} kind="money" variant="pie" />
            </Card>
            <Card
                index={3}
                title="Revenue Concentration — Top 15 Customers"
                subtitle={`Sales + cumulative share · ${label}`}
                className="md:col-span-2 lg:col-span-8"
            >
                <ComboChart
                    spec={concentration(xf(3))}
                    bar={{ key: "Sales", label: "Sales", kind: "money" }}
                    line={{ key: "CumPct", label: "Cumulative %", kind: "percent", domain: [0, 1] }}
                />
            </Card>
        </ScenePage>
    );
}

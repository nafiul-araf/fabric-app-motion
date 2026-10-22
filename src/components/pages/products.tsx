//-----------------------------------------------------------------------
// Products — what sells. Every product placed by sales and margin, the
// category mix inside each region, units by product and a detail table.
//-----------------------------------------------------------------------

import { Card } from "@/components/stage/card";
import { ScenePage } from "@/components/stage/scene-page";
import { ScatterChart } from "@/components/charts/scatter-chart";
import { StackedBarChart } from "@/components/charts/stacked-bar-chart";
import { BarChart } from "@/components/charts/bar-chart";
import { MotionTable } from "@/components/charts/motion-table";
import { useCardFilters } from "@/components/charts/cross-filter";
import { breakdown, M, productScatter, stacked, table } from "@/data/queries";
import { scopeLabel, type Filters } from "@/data/filters";

export function ProductsPage({ filters }: { filters: Filters }) {
    const label = scopeLabel(filters);
    const xf = useCardFilters(filters);
    return (
        <ScenePage page="products" filters={filters} kpis={["activeProducts", "units", "asp", "grossMargin", "sales"]}>
            <Card index={0} title="Sales vs Margin by Product" subtitle={label} className="md:col-span-2 lg:col-span-7">
                <ScatterChart spec={productScatter(xf(0))} xKind="money" yKind="percent" />
            </Card>
            <Card index={1} title="Category Mix by Region" subtitle={label} className="md:col-span-2 lg:col-span-5">
                <StackedBarChart spec={stacked("region", "category", M.sales, xf(1))} kind="money" />
            </Card>
            <Card index={2} title="Units by Product" subtitle={label} className="lg:col-span-5">
                <BarChart spec={breakdown("product", M.units, xf(2))} kind="count" />
            </Card>
            <Card index={3} title="Product Detail" subtitle={label} className="lg:col-span-7">
                <MotionTable spec={table("product", [M.sales, M.units, M.asp, M.margin], xf(3))} />
            </Card>
        </ScenePage>
    );
}

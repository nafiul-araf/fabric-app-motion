//-----------------------------------------------------------------------
// Scene page — the layout every page shares: the hero (scene title +
// that page's KPI strip) above a bento grid that fills the rest of the
// viewport. From lg up the grid is 12 columns × 2 rows sized to the
// screen (no page scroll); pages place cards with col/row spans.
//-----------------------------------------------------------------------

import type { ReactNode } from "react";
import type { KpiKey } from "@/lib/kpi-tiles";
import type { Filters } from "@/data/filters";
import { useCrossFilter, withSelection } from "@/components/charts/cross-filter";
import { KpiStrip, SceneTitle } from "./hero";
import type { PageKey } from "./nav";

interface ScenePageProps {
    page: PageKey;
    filters: Filters;
    kpis: KpiKey[];
    children: ReactNode;
}

export function ScenePage({ page, filters, kpis, children }: ScenePageProps) {
    // KPIs follow any cross-filter selection on the page (no card is their source).
    const { selection } = useCrossFilter();
    return (
        <>
            <div className="flex shrink-0 flex-col gap-m lg:flex-row lg:items-center short:gap-s">
                <div className="lg:w-[24%] lg:max-w-[360px] lg:shrink-0">
                    <SceneTitle page={page} filters={filters} />
                </div>
                <div className="min-w-0 flex-1">
                    <KpiStrip filters={withSelection(filters, selection)} keys={kpis} />
                </div>
            </div>
            <div className="grid grid-cols-1 gap-m md:grid-cols-2 lg:min-h-0 lg:flex-1 lg:grid-cols-12 lg:grid-rows-2 short:gap-s">
                {children}
            </div>
        </>
    );
}

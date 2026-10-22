//-----------------------------------------------------------------------
// Page registry — the scenes, in dock order: short dock label, icon,
// dock tint, the long title shown in the hero, and the slicers each page
// surfaces. A page never slices a dimension it already breaks down in a
// visual, so each slicer list complements that page's charts.
//-----------------------------------------------------------------------

import { LayoutDashboard, Package, Scale, Users, type LucideIcon } from "lucide-react";

/** How we're doing, why it moved, who drives it, what sells. */
export type PageKey = "overview" | "variance" | "customer" | "products";

export interface PageDef {
    key: PageKey;
    label: string;
    icon: LucideIcon;
    /** Index into the series palette — the dock tile's tint. */
    tint: number;
}

export const PAGES: PageDef[] = [
    { key: "overview", label: "Overview", icon: LayoutDashboard, tint: 0 },
    { key: "variance", label: "Variance", icon: Scale, tint: 2 },
    { key: "customer", label: "Customers", icon: Users, tint: 4 },
    { key: "products", label: "Products", icon: Package, tint: 1 },
];

/** Hero titles. The last word is set in the spectrum gradient. */
export const PAGE_TITLE: Record<PageKey, string> = {
    overview: "Executive Overview",
    variance: "Variance Analysis",
    customer: "Customer Insights",
    products: "Product Performance",
};

export type SlicerKey = "dateRange" | "region" | "category" | "segment" | "customer" | "rep";

export const PAGE_SLICERS: Record<PageKey, SlicerKey[]> = {
    overview: ["dateRange", "segment", "rep"],
    variance: ["dateRange", "segment", "customer"],
    customer: ["dateRange", "region", "category"],
    products: ["dateRange", "region", "segment"],
};

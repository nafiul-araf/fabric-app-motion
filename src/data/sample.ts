//-----------------------------------------------------------------------
// Sample data — a made-up coffee equipment wholesaler, generated in the
// browser from a fixed seed so every visit sees the same numbers.
// Two years of monthly order lines (2024 and 2025): customers in six
// regions buy coffee, brewers, grinders and accessories. Volumes grow
// or shrink per customer, prices move per category and the product mix
// shifts towards brewers, so the variance bridge has something to show.
// Summer promotions dent the margin, and some accounts are won or lost
// along the way.
// Every name here is invented.
//-----------------------------------------------------------------------

/** Mulberry32 — a tiny seeded PRNG (same sequence on every load). */
function rng(seed: number) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export const REGIONS = ["Pacific", "Mountain", "Central", "Great Lakes", "Northeast", "Southeast"] as const;
export const CATEGORIES = ["Coffee", "Brewers", "Grinders", "Accessories"] as const;
export const SEGMENTS = ["Enterprise", "Mid-Market", "Small Business", "Independent"] as const;
export const GROUPS = ["Cafés", "Offices", "Hotels", "Grocers"] as const;

export interface Product {
    name: string;
    category: (typeof CATEGORIES)[number];
    /** 2024 unit price. */
    price: number;
    /** Cost as a share of price. */
    costRatio: number;
    /** Relative order frequency. */
    weight: number;
}

export const PRODUCTS: Product[] = [
    { name: "House Blend 5kg", category: "Coffee", price: 96, costRatio: 0.52, weight: 9 },
    { name: "Single Origin 5kg", category: "Coffee", price: 138, costRatio: 0.48, weight: 5 },
    { name: "Decaf Blend 5kg", category: "Coffee", price: 104, costRatio: 0.55, weight: 2.5 },
    { name: "Cold Brew Packs", category: "Coffee", price: 64, costRatio: 0.44, weight: 3 },
    { name: "Batch Brewer", category: "Brewers", price: 1450, costRatio: 0.62, weight: 0.35 },
    { name: "Espresso Two-Group", category: "Brewers", price: 6900, costRatio: 0.66, weight: 0.08 },
    { name: "Espresso One-Group", category: "Brewers", price: 3800, costRatio: 0.64, weight: 0.1 },
    { name: "Pour-Over Station", category: "Brewers", price: 620, costRatio: 0.5, weight: 0.4 },
    { name: "On-Demand Grinder", category: "Grinders", price: 1650, costRatio: 0.6, weight: 0.16 },
    { name: "Burr Grinder Pro", category: "Grinders", price: 940, costRatio: 0.57, weight: 0.22 },
    { name: "Retail Grinder", category: "Grinders", price: 410, costRatio: 0.53, weight: 0.3 },
    { name: "Milk Pitchers", category: "Accessories", price: 28, costRatio: 0.38, weight: 2.2 },
    { name: "Tamper Kit", category: "Accessories", price: 45, costRatio: 0.35, weight: 1.2 },
    { name: "Brew Scales", category: "Accessories", price: 72, costRatio: 0.42, weight: 1.4 },
    { name: "Paper Filters (case)", category: "Accessories", price: 36, costRatio: 0.46, weight: 3.4 },
    { name: "Cleaning Tablets", category: "Accessories", price: 24, costRatio: 0.4, weight: 2.6 },
];

/** 2025 price change by category — the bridge's "Price" step. */
const PRICE_2025: Record<Product["category"], number> = {
    Coffee: 0.064,
    Brewers: -0.031,
    Grinders: 0.018,
    Accessories: 0.042,
};

/** Category demand growth 2024 → 2025 on top of each customer's own trend — the "Mix" shift. */
const MIX_2025: Record<Product["category"], number> = {
    Coffee: 0.02,
    Brewers: 0.21,
    Grinders: 0.07,
    Accessories: -0.16,
};

/** Regional demand trend 2024 → 2025 — some regions cool, so variance bars diverge. */
const REGION_TREND: Record<(typeof REGIONS)[number], number> = {
    Pacific: 0.06,
    Mountain: 0.03,
    Central: -0.17,
    "Great Lakes": 0.01,
    Northeast: 0.02,
    Southeast: -0.12,
};

export const REPS = [
    "Avery Chen",
    "Jordan Patel",
    "Sam Okafor",
    "Riley Novak",
    "Morgan Silva",
    "Casey Lindqvist",
    "Taylor Brooks",
    "Jamie Ortiz",
] as const;

/** Each region's reps (by index into REPS). */
const REGION_REPS: Record<(typeof REGIONS)[number], number[]> = {
    Pacific: [0, 1],
    Mountain: [2],
    Central: [3],
    "Great Lakes": [4, 3],
    Northeast: [5, 6],
    Southeast: [7, 2],
};

const NAME_STEMS = [
    "Blue Fern", "Harbor Lane", "Copper Kettle", "North Star", "Little Owl", "Maple Row",
    "Red Brick", "Silver Birch", "Golden Hour", "Ivy Gate", "Stone Arch", "Cedar Hill",
    "Quiet Fox", "Paper Moon", "Saltmarsh", "Juniper", "Old Mill", "Brightwater",
    "Kestrel", "Lantern", "Fieldstone", "Wildflower", "Riverbend", "Tall Pines",
    "Ember", "Bluebell", "Hollow Oak", "Seaglass", "Morning Dew", "Starling",
    "Driftwood", "Thistle", "Orchard", "Granite", "Larkspur", "Willow Park",
    "Sundial", "Pebble", "Moss & Mortar", "Hearth", "Clover", "Ridgeway",
    "Westwind", "Halcyon", "Marigold", "Foxglove", "Sparrow", "Evergreen",
];

const GROUP_SUFFIX: Record<(typeof GROUPS)[number], string[]> = {
    "Cafés": ["Café", "Coffee House", "Espresso Bar"],
    Offices: ["Workspace", "Offices", "Studios"],
    Hotels: ["Hotel", "Inn", "Suites"],
    Grocers: ["Market", "Grocers", "Food Hall"],
};

export interface Customer {
    name: string;
    region: (typeof REGIONS)[number];
    segment: (typeof SEGMENTS)[number];
    group: (typeof GROUPS)[number];
    rep: string;
    /** Relative size — heavy-tailed, so a few accounts carry most sales. */
    size: number;
    /** Volume growth 2024 → 2025. */
    growth: number;
    /** First and last month with orders (yyyymm) — new and lost accounts. */
    from: number;
    to: number;
}

/** One order line: a customer's purchases of one product in one month. */
export interface Fact {
    /** yyyymm, e.g. 202503. */
    month: number;
    customer: number;
    product: number;
    units: number;
    sales: number;
    cost: number;
    budget: number;
    orders: number;
}

export interface Dataset {
    customers: Customer[];
    facts: Fact[];
    /** All months in the data, ascending (yyyymm). */
    months: number[];
}

// Seasonality by calendar month (Jan … Dec): quiet start, busy autumn.
const SEASON = [0.82, 0.86, 0.97, 1.0, 1.03, 0.98, 0.92, 0.95, 1.06, 1.1, 1.14, 1.22];
// Promotional discount by calendar month: summer and holiday deals thin the margin.
const PROMO = [0, 0, 0.01, 0, 0.02, 0.05, 0.08, 0.06, 0.01, 0, 0.03, 0.05];

function buildCustomers(r: () => number): Customer[] {
    return NAME_STEMS.map((stem, i) => {
        const region = REGIONS[i % REGIONS.length];
        const group = GROUPS[Math.floor(r() * GROUPS.length)];
        const suffixes = GROUP_SUFFIX[group];
        const reps = REGION_REPS[region];
        // Pareto-ish sizes: a handful of large accounts, a long tail of small ones.
        const size = Math.pow(1 / (0.06 + r()), 1.15);
        // About one account in eight is won during the data, one in ten lost.
        const life = r();
        const from = life < 0.12 ? 202500 + 1 + Math.floor(r() * 9) : 202401;
        const to = life > 0.9 ? (r() < 0.5 ? 202400 : 202500) + 6 + Math.floor(r() * 6) : 202512;
        const segment: Customer["segment"] =
            size > 6 ? "Enterprise" : size > 2.6 ? "Mid-Market" : size > 1.3 ? "Small Business" : "Independent";
        return {
            name: `${stem} ${suffixes[i % suffixes.length]}`,
            region,
            segment,
            group,
            rep: REPS[reps[Math.floor(r() * reps.length)]],
            size,
            growth: -0.18 + r() * 0.42 + REGION_TREND[region],
            from,
            to,
        };
    });
}

export function buildDataset(seed = 20250101): Dataset {
    const r = rng(seed);
    const customers = buildCustomers(r);
    const months: number[] = [];
    for (const y of [2024, 2025]) for (let m = 1; m <= 12; m++) months.push(y * 100 + m);

    const facts: Fact[] = [];
    customers.forEach((c, ci) => {
        // Each customer buys a subset of the catalogue.
        const buys = PRODUCTS.map((p) => r() < (p.category === "Coffee" ? 0.95 : 0.55 + Math.min(0.35, c.size / 30)));
        months.forEach((month) => {
            if (month < c.from || month > c.to) return;
            const year = Math.floor(month / 100);
            const season = SEASON[(month % 100) - 1];
            const promo = PROMO[(month % 100) - 1];
            PRODUCTS.forEach((p, pi) => {
                if (!buys[pi]) return;
                const trend = year === 2025 ? (1 + c.growth) * (1 + MIX_2025[p.category]) : 1;
                const expected = p.weight * c.size * season * trend * 1.6;
                // Lumpy demand: equipment sells in ones and twos, consumables steadily.
                const units = Math.round(expected * (0.55 + r() * 0.9));
                if (units <= 0) return;
                const list = p.price * (year === 2025 ? 1 + PRICE_2025[p.category] : 1) * (0.97 + r() * 0.06);
                const sales = units * list * (1 - promo);
                const target = expected * p.price * (year === 2025 ? 1.09 : 1.04);
                facts.push({
                    month,
                    customer: ci,
                    product: pi,
                    units,
                    sales,
                    // Cost follows the list price, so a promotion comes straight out of margin.
                    cost: units * list * p.costRatio * (0.97 + r() * 0.06),
                    budget: target * (0.94 + r() * 0.1),
                    orders: Math.max(1, Math.round(units / (p.price > 500 ? 1 : 6))),
                });
            });
        });
    });
    return { customers, facts, months };
}

/** The one dataset the app reads (built on first use). */
let cached: Dataset | null = null;
export function dataset(): Dataset {
    cached ??= buildDataset();
    return cached;
}

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** 202503 → "Mar '25". */
export function monthLabel(month: number): string {
    return `${MONTH_NAMES[(month % 100) - 1]} '${String(Math.floor(month / 100)).slice(2)}`;
}

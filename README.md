# Fabric App Motion

Motion patterns for data apps, taken from a Microsoft Fabric App I built with Claude Code.

![The demo: the page builds, a click on a region filters every other visual, then the other pages open from the dock](docs/demo.gif)

Charts build one mark at a time, KPI numbers roll like an odometer, and a status pill grows into a live query timer while data loads. Each card replays its build on a loop, out of step with its neighbours, so the page keeps moving without getting busy. Click a bar, slice, month or table row and the other visuals filter to it, then rebuild with the same motion.

The original app reads live data from a Power BI semantic model. This repo runs on generated sample data instead (a made-up coffee equipment wholesaler, every name invented), so it works anywhere with no account or connection.

Built with React 19, TypeScript, Framer Motion, d3-scale/d3-shape and Tailwind CSS v4.

**Contents:** [Run it on localhost](#run-it-on-localhost) · [How I built it](#how-i-built-it) · [What's in this repo](#whats-in-this-repo) · [How the motion fits together](#how-the-motion-fits-together) · [Using your own data](#using-your-own-data) · [Screenshots](#screenshots)

## Run it on localhost

You don't need a Fabric or Power BI account for this. The demo creates its own sample data in the browser.

### Prerequisites

- **Node.js 20.19+, 22.13+ or 24+**, which includes npm. Download it from [nodejs.org](https://nodejs.org) (the LTS version is fine). Check what you have with `node --version`.
- **Git**, to clone the repo. Or use **Code → Download ZIP** on GitHub and unzip it.
- A current browser: Chrome, Edge, Firefox or Safari.

### Steps

1. Clone the repo and go into the folder:

   ```bash
   git clone https://github.com/nafiul-araf/fabric-app-motion.git
   cd fabric-app-motion
   ```

2. Install the packages (takes a minute the first time):

   ```bash
   npm install
   ```

3. Start the app:

   ```bash
   npm run dev
   ```

4. Open **http://localhost:5173** in your browser. The page builds itself in, then keeps moving. Stop the server with `Ctrl + C` in the terminal.

### Other commands

| Command | What it does |
| --- | --- |
| `npm test` | Runs the unit tests for the sample-data maths |
| `npm run build` | Makes a production build in `dist/` |
| `npm run preview` | Serves that build at http://localhost:4173 |
| `npm run lint` | Checks the code with ESLint |

### If something goes wrong

- **`npm install` fails or complains about the engine:** your Node.js is too old. Install a version from the list above and try again.
- **Port 5173 is already in use:** Vite picks the next free port and prints it in the terminal, so open that address. To choose one yourself, run `npm run dev -- --port 3000`.
- **On Windows PowerShell, `npm` "cannot be loaded because running scripts is disabled":** run the same commands in Command Prompt, or use `npm.cmd install` and `npm.cmd run dev`.

## How I built it

### The original Fabric App (approximate prompts)

I built the first version of the app a few months earlier, and those conversations are no longer saved, so these are reconstructed from my notes. They show what I asked for, roughly in order, not my exact words.

**1.**

```text
Create a Fabric App with the Rayfin dataapp template and connect it to this semantic model: <link to the semantic model>
```

**2.**

```text
Build an overview page: KPI cards for total sales, gross margin and budget achievement, a sales trend against prior year, sales by category, sales by region and the top 10 customers.
```

**3.**

```text
Use the brand kit in the references folder for the colours, fonts and logo.
```

**4.**

```text
Follow the layout of the Power BI report in the references folder.
```

**5.**

```text
Deploy the app to the <workspace name> workspace.
```

**6.**

```text
Add more pages: Performance, Variance, Product, Customer, Region and Budget. Each page should have its own KPI cards and slicers. Don't repeat the same cards on every page.
```

**7.**

```text
Move the slicers into a filter panel that opens from the right and is hidden by default. Add search inside each slicer and a reset button on each one, like Power BI.
```

**8.**

```text
Replace the year dropdown with a date range slicer on the Date column, shown as mm-YYYY.
```

**9.**

```text
Use a donut for sales by category and product type, a pie for customer group and a funnel for segment. No data labels on the charts, axis values in millions, and green/red arrows for YoY in the tables.
```

**10.**

```text
Add a one-line insight in the header of every page.
```

**11.**

```text
Add pages for revenue quality and leakage, trends and momentum, and the product portfolio.
```

**12.**

```text
Laptop screen or desktop, wherever I see the app, it should fit. No scrolling.
```

**13.**

```text
Rename the app to sales-analytics-app and move it to the <folder name> folder.
```

### The motion version (exact prompts)

These are the prompts I gave Claude Code to build the motion version of my Fabric App, copied exactly as I typed them. My workspace link and names are replaced with placeholders.

**1.**

```text
<link to my app in the Fabric portal>

This my fabric app.
The workspace name is: <workspace name>
App Name is: sales-analytics-app (folder is <folder name>)

This is a linkedln post for Claude Motion: https://www.linkedin.com/posts/charlie-hills_anthropic-finally-dropped-claude-motion-share-7515309471343214592--wgN/

convert my sales analytics app to something similar UI in the motion linkedin post and have similar motion in the app.

Save it in the same workspace and same folder. Name it to sales-app-motion
```

**2.**

```text
No need to build ten pages, for now create 3 important pages. also you have created the dark background. It should be the background same as the given likedln posts gif's background.
```

**3.**

```text
Can you make the pages as gif like movemment?
```

**4.**

```text
Suppose if I click any bar/points in a specific visual of any chart, I will filter the other as well based on this like a power bi visual does. the gif movement also be there in that situation. Is this possible? If so, do this
```

**5.**

```text
Do the remaining works after I interuppted it
```

**6.**

```text
In the app can you please make faster the movement a bit?
```

**7.**

```text
can you make 50% faster>
```

## What's in this repo

| Piece | File |
| --- | --- |
| Motion presets: springs, eases, and one `SPEED` constant that retimes everything | [src/lib/motion.ts](src/lib/motion.ts) |
| Replay loop: each card rebuilds on its own beat, out of phase with the others | [src/components/stage/reel.tsx](src/components/stage/reel.tsx) |
| Odometer digits for KPI tiles | [src/components/stage/odometer.tsx](src/components/stage/odometer.tsx) |
| Status pill that turns into a query timer, then the page's one-line insight | [src/components/stage/island.tsx](src/components/stage/island.tsx) |
| Cards that rise in, then hand off to their chart's build | [src/components/stage/card.tsx](src/components/stage/card.tsx) |
| Dock navigation with magnification | [src/components/stage/dock.tsx](src/components/stage/dock.tsx) |
| Filter sheet with an animated Apply button | [src/components/stage/filter-sheet.tsx](src/components/stage/filter-sheet.tsx) |
| Click-to-cross-filter, Power BI style | [src/components/charts/cross-filter.tsx](src/components/charts/cross-filter.tsx) |
| SVG charts: bar, trend (line/area), combo, donut/pie, funnel, waterfall, scatter, stacked bar, table | [src/components/charts/](src/components/charts/) |
| Sample data, queries and a simulated round trip | [src/data/](src/data/) |

The demo has four pages: the three from the motion app plus a Products page, so the scatter and stacked charts appear somewhere.

## How the motion fits together

**One speed dial.** Every duration and delay goes through `fast()`, and every spring through `quick()`, which raises stiffness by SPEED² and damping by SPEED. The spring plays faster but bounces exactly the same. Change `SPEED` in `motion.ts` to retime the whole app.

**Builds wait for their card.** A card publishes the moment it has landed, and the chart inside starts building after that, so marks never grow underneath an entrance animation.

**Replays are remounts.** On each beat the card bumps a counter. The chart's plot is keyed on that counter plus the result version, so the old plot blurs out and a fresh one builds from zero. New data after a filter change replays the same way.

**The loop stops when it should.** Hovering a card holds it. So do the Motion pause button, an open filter sheet and an active cross-filter selection, and the loop never runs for reduced-motion users or in a hidden tab.

**Cross-filtering.** Each query says which dimension its marks stand for. Clicking a mark stores a selection, and every other card on the page re-queries with it while the clicked card only highlights. Ctrl/⌘/Shift-click adds members. Esc, a click on empty space or the ✕ on the chip clears it.

## Using your own data

The visuals only know about one contract in [src/data/types.ts](src/data/types.ts): a query has a cache `key`, a list of `columns`, a `run()` that returns rows, and an optional `crossFilter` field. Replace the factories in [src/data/queries.ts](src/data/queries.ts) with your own SQL, DAX or API calls, and make `useQuery` in [src/data/use-query.ts](src/data/use-query.ts) await them. The charts and motion stay the same.

## Screenshots

| Light | Dark |
| --- | --- |
| ![Overview page in light mode](docs/overview.png) | ![Overview page in dark mode](docs/overview-dark.png) |
| ![Variance page](docs/variance.png) | ![Customers page](docs/customers.png) |

![Products page](docs/products.png)

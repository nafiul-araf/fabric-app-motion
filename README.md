# Fabric App Motion

Motion patterns for data apps, taken from a Microsoft Fabric App I built with Claude Code.

![The demo: the page builds, a click on a region filters every other visual, then the other pages open from the dock](docs/demo.gif)

Charts build one mark at a time, KPI numbers roll like an odometer, and a status pill grows into a live query timer while data loads. Each card replays its build on a loop, out of step with its neighbours, so the page keeps moving without getting busy. Click a bar, slice, month or table row and the other visuals filter to it, then rebuild with the same motion.

The original app reads live data from a Power BI semantic model. This repo runs on generated sample data instead (a made-up coffee equipment wholesaler, every name invented), so it works anywhere with no account or connection.

Built with React 19, TypeScript, Framer Motion, d3-scale/d3-shape and Tailwind CSS v4.

## Run it

```bash
npm install
npm run dev
```

Then open http://localhost:5173. `npm test` checks the sample-data maths, `npm run build` makes a production build.

## What's in it

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

## How the motion fits together

**One speed dial.** Every duration and delay goes through `fast()`, and every spring through `quick()`, which raises stiffness by SPEED² and damping by SPEED. The spring plays faster but bounces exactly the same. Change `SPEED` in `motion.ts` to retime the whole app.

**Builds wait for their card.** A card publishes the moment it has landed, and the chart inside starts building after that, so marks never grow underneath an entrance animation.

**Replays are remounts.** On each beat the card bumps a counter. The chart's plot is keyed on that counter plus the result version, so the old plot blurs out and a fresh one builds from zero. New data after a filter change replays the same way.

**The loop stops when it should.** Hovering a card holds it. So do the Motion pause button, an open filter sheet and an active cross-filter selection, and the loop never runs for reduced-motion users or in a hidden tab.

**Cross-filtering.** Each query says which dimension its marks stand for. Clicking a mark stores a selection, and every other card on the page re-queries with it while the clicked card only highlights. Ctrl/⌘/Shift-click adds members. Esc, a click on empty space or the ✕ on the chip clears it.

## Using your own data

The visuals only know about one contract in [src/data/types.ts](src/data/types.ts): a query has a cache `key`, a list of `columns`, a `run()` that returns rows, and an optional `crossFilter` field. Replace the factories in [src/data/queries.ts](src/data/queries.ts) with your own SQL, DAX or API calls (and make `useQuery` in [src/data/use-query.ts](src/data/use-query.ts) await them), and the charts and motion stay the same.

## Screenshots

| Light | Dark |
| --- | --- |
| ![Overview page in light mode](docs/overview.png) | ![Overview page in dark mode](docs/overview-dark.png) |
| ![Variance page](docs/variance.png) | ![Customers page](docs/customers.png) |

![Products page](docs/products.png)

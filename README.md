# Fabric App Motion

Motion patterns for data apps, taken from a Microsoft Fabric App I built with Claude Code.

![The demo: the page builds, a click on a region filters every other visual, then the other pages open from the dock](docs/demo.gif)

Charts build one mark at a time, KPI numbers roll like an odometer, and a status pill grows into a live query timer while data loads. Each card replays its build on a loop, out of step with its neighbours, so the page keeps moving without getting busy. Click a bar, slice, month or table row and the other visuals filter to it, then rebuild with the same motion.

The original app reads live data from a Power BI semantic model. This repo runs on generated sample data instead (a made-up coffee equipment wholesaler, every name invented), so it works anywhere with no account or connection.

Built with React 19, TypeScript, Framer Motion, d3-scale/d3-shape and Tailwind CSS v4.

**Contents:** [Run the demo](#run-the-demo) · [How I built it](#how-i-built-it) · [What's in this repo](#whats-in-this-repo) · [How the motion fits together](#how-the-motion-fits-together) · [Using your own data](#using-your-own-data) · [Screenshots](#screenshots)

## Run the demo

```bash
npm install
npm run dev
```

Then open http://localhost:5173. `npm test` checks the sample-data maths, `npm run build` makes a production build.

## How I built it

A few people asked how I made this, so here's the whole process. Claude Code (I used the VS Code extension) wrote the code, ran the queries, tested the pages in a browser and deployed the app. My part was deciding what I wanted, describing it, reviewing what came back and pushing back where it was wrong.

It happened in two phases:

1. **The Fabric App.** A sales dashboard that reads a Power BI semantic model with DAX, built with Rayfin, the SDK and CLI behind Fabric Apps.
2. **The motion version.** A copy of that app restyled after a motion-design GIF I saw on LinkedIn, with Power BI style cross-filtering added.

### What you need

- A **Fabric workspace on a Fabric capacity**.
- **Fabric Apps (preview)** switched on by a tenant admin: Admin portal → Tenant settings → Fabric Apps (preview).
- A **published semantic model** you can read. The app queries it live; nothing is copied out.
- **Node.js** (I used 24) and the **Azure CLI**. Claude Code runs `az login` and `rayfin login`, but you complete the browser sign-in.
- **Claude Code.**

### Phase 1: the Fabric App on a semantic model

**1. Create the project.** In an empty folder:

```bash
npm create @microsoft/rayfin@latest
```

Pick the **dataapp** template. It gives you a React + Vite + TypeScript dashboard that runs DAX against a semantic model, plus an `AGENTS.md` and Rayfin docs that Claude Code reads. Those files carry the rules that keep it honest. The most important one is that it must run a query and copy the exact column names before it builds a chart, never guess them or use mock data.

**2. Open the folder in Claude Code and point it at your model.** Paste the model's link from the Power BI or Fabric portal and say what the app is for. Claude Code then:

```bash
az login                                                  # you sign in once
npx fabric-app-data add salesModel --from-url "<model link>"
npx fabric-app-data generate -o src/fabric.generated.ts
npx fabric-app-data query salesModel --query "EVALUATE ROW(\"test\", 1)"
```

It finds tables and measures with DAX `INFO` functions, tests every query against the model, and only then writes the `.dax` files and the components.

**3. Build the pages through conversation.** This part takes the longest. The transcripts from this phase are older than Claude Code keeps, so I can't share the exact prompts. These are the requests that shaped it, in order:

- Build an overview page: headline KPIs, a sales trend, sales by category and by region, top customers.
- Apply our brand colours and fonts from a brand-kit file I dropped in the folder.
- Follow the layout of one of our existing Power BI reports.
- Grow it into a multi-page app (it ended up with ten pages), each page with its own KPI cards and slicers, not the same cards repeated.
- Put the slicers in a filter panel that opens from the right, hidden by default, with search and a reset on each slicer (my Power BI habit).
- Replace the year dropdown with a date range slicer.
- Chart choices: donut for category, pie for customer group, funnel for segment, no data labels, axis values in millions.
- And the one I repeated most: *"laptop screen or desktop, wherever I see the app, it should fit"*. No scrollbars, at any size.

**4. Deploy.**

```bash
npx rayfin login
npx rayfin up --workspace-id <your workspace id>
```

`rayfin up` builds the front end and creates the app as an item in your workspace. It has no folder option, so if you want the app in a workspace folder, ask Claude Code to move it afterwards with the Fabric REST API. Open the item in the Fabric portal and the app runs there with your Fabric sign-in.

### Phase 2: the motion version (exact prompts)

I saw [Charlie Hills' LinkedIn post about Claude Motion](https://www.linkedin.com/posts/charlie-hills_anthropic-finally-dropped-claude-motion-share-7515309471343214592--wgN/) and wanted my app to move like the GIF in it. I didn't use Claude Motion itself. The post was only the visual reference. Claude Code wrote all the motion in React with Framer Motion.

These are my prompts, copied exactly as I typed them, typos included. The only changes are placeholders where my workspace link and names were.

**Prompt 1: the conversion**

```text
<link to my app in the Fabric portal>

This my fabric app.
The workspace name is: <workspace name>
App Name is: sales-analytics-app (folder is <folder name>)

This is a linkedln post for Claude Motion: https://www.linkedin.com/posts/charlie-hills_anthropic-finally-dropped-claude-motion-share-7515309471343214592--wgN/

convert my sales analytics app to something similar UI in the motion linkedin post and have similar motion in the app.

Save it in the same workspace and same folder. Name it to sales-app-motion
```

Claude Code copied the project into a new folder so the original app stayed untouched. It swapped the stock charts for SVG charts animated with Framer Motion, then deployed the copy as a new item. Two things went wrong along the way. Rayfin's static hosting needed a newer CLI (1.35 or later), so it upgraded the Rayfin packages. And `rayfin up` can't target a folder, so it moved the new item into my folder with the Fabric REST API afterwards.

**Prompt 2: fewer pages, the right background**

```text
No need to build ten pages, for now create 3 important pages. also you have created the dark background. It should be the background same as the given likedln posts gif's background.
```

It had guessed "keynote means black", which was wrong. This time it downloaded the GIF from the post and sampled its colours: the off-white background, the faint grid, the peach starbursts, the orange-to-violet title gradient and the blue bars. The three pages became Overview, Variance and Customer.

**Prompt 3: make it move like the GIF**

```text
Can you make the pages as gif like movemment?
```

This added the replay loop. Every card rebuilds on its own beat, out of step with the others, the way the tiles in the GIF do. Numbers spin up again, the goal ring unwinds and closes, and the title word pulses from thin to bold. Hovering a card holds it still, and a Motion button pauses everything.

**Prompt 4: Power BI style cross-filtering**

```text
Suppose if I click any bar/points in a specific visual of any chart, I will filter the other as well based on this like a power bi visual does. the gif movement also be there in that situation. Is this possible? If so, do this
```

Clicking a bar, slice, month or table row now adds a filter to every other visual's DAX query. The clicked visual only highlights its selection. The other visuals rebuild with the same motion when the new numbers arrive. Claude Code tested 11 click combinations in a browser and checked that the filtered totals matched the table rows.

**Prompt 5: after I interrupted it mid-task**

```text
Do the remaining works after I interuppted it
```

**Prompts 6 and 7: speed**

```text
In the app can you please make faster the movement a bit?
```

```text
can you make 50% faster>
```

All timing in the app goes through one speed constant, so this was a one-line change: 1.3 times the original speed, then 1.95. Springs keep the same bounce, they just play faster.

**Then, for this repo**

```text
Just create a repository along with a readme file
```

```text
it should be public
```

```text
Push the codes
```

Claude Code rebuilt the motion part as a standalone project on generated sample data, so nothing from the real model or workspace is in here. It checked every page in a browser at three screen sizes before pushing.

### What I learned

- **Show, don't describe.** A link to a GIF got closer than any paragraph about "smooth motion" would have. When the first attempt was off (the dark background), pointing back at the reference fixed it.
- **Let it query the model before it builds.** The template's rule against guessing columns saved a lot of broken charts.
- **Ask it to check its own work in a browser.** It found bugs by measuring frames that looked fine in screenshots, like animations that silently never played.
- **Deploy a copy under a new name.** The original app kept working the whole time.
- **Keep motion optional.** There's a pause button, hovering holds a card, and people who turn on reduced motion in their OS get the page without the movement or the loop.

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

**In a Fabric App** (the `dataapp` template), have each query carry its DAX and let `useQuery` run it the way the template's `useSemanticModelQuery` hook does: `getFabricClient().semanticModel(connection).query(dax)`. Then map the result table to row objects keyed by your column names. A cross-filter selection becomes one more filter in the DAX, for example `FILTER(ALL('Customer'[Region]), 'Customer'[Region] IN {"Pacific"})` inside `SUMMARIZECOLUMNS`.

## Screenshots

| Light | Dark |
| --- | --- |
| ![Overview page in light mode](docs/overview.png) | ![Overview page in dark mode](docs/overview-dark.png) |
| ![Variance page](docs/variance.png) | ![Customers page](docs/customers.png) |

![Products page](docs/products.png)

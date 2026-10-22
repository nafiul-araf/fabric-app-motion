# Fabric App Motion

Motion patterns for data apps, taken from a Microsoft Fabric App I built with Claude Code.

Charts build one mark at a time, KPI numbers roll like an odometer, and a status pill grows into a live query timer while data loads. Each tile replays its build on a loop, out of step with its neighbours, so the page keeps moving without getting busy. Click a bar, slice or point and the other visuals filter to it, then rebuild with the same motion.

Built with React, TypeScript, Framer Motion and d3.

## Status

The code isn't here yet. I'm pulling the animation parts out of the app and putting them on sample data so they run on their own. Watch the repo to see when it lands.

## What's coming

- **Motion presets.** One speed setting retimes every spring, duration and delay without changing how bouncy anything feels.
- **Replay loop.** Tiles replay out of phase, hold while hovered, and stop for reduced-motion users and hidden tabs.
- **Odometer numbers** for KPI tiles.
- **Chart build-ins** for bar, line, donut, funnel, waterfall and scatter charts.
- **Click to cross-filter**, the way Power BI visuals do.

# Deep Space Frontier · Star System Unification Federation

> A text-based space-mining idle game that runs entirely in your browser.

**Language / 语言:** English · [简体中文](README_ZH.md)

Start on a barren planet, build up an automated mining economy, research technologies, expand across five planets, and steer diplomacy with four factions toward the **Star System Unification Federation** ending — then keep going in Infinite Mode and NG+.

## Features

- **Idle-first**: buildings keep producing minerals, energy, and tech while you're away; offline earnings are settled from the real time difference (capped at 8 hours, extended to 12 with the Jump Gate).
- **Four resources**: mineral `◆`, energy `⚡`, tech `◎`, and military `⚔`.
- **Buildings & tech**: multi-buy buildings (miner, solar, lab, refinery, deep drill, barracks, military port) scale by quantity; unique megastructures and technologies scale by level (`×2`/level), with no quantity × level coupling.
- **5 planets, 5 mechanics**: each planet you unlock introduces a new mechanic — orbital alloy forging, gravity-well decay, storm-driven mass production, and warp-core time acceleration — leading to the homeworld, Dawn.
- **Faction diplomacy**: trade, ally, or coerce (extort → tribute → subjugate) the four named factions plus generated ones; auto-diplomacy modes keep progression alive while idling.
- **Conquest & fleet**: train military, build ports to raise your military cap, auto-conquer generated targets, research raid tactics, and maintain a fleet with soft degradation when energy runs short.
- **Exploration**: dispatch expeditions to program-generated celestial bodies, discover resource-yielding targets, and unlock endgame engineering lines.
- **Endgame**: after unification, three engineering lines open up — Ring Smelter (global production), Jump Gate (exploration slots/yield/offline), and Wormhole (exploration channels + military cap) — all stackable.
- **Infinite Mode & NG+**: keep idling after the ending, or start a new run inheriting tech points, faction codex, and permanent bonuses.
- **Bilingual UI**: 中文 / English, auto-detected from the browser, switchable in Settings.
- **PWA installable**: offline-capable app shell (Service Worker precaches all assets), self-hosted fonts, mobile responsive.
- **Save anywhere**: auto-save to IndexedDB every 5 s, JSON export/import for sharing, plus a full reset.
- **Terminal-style UI**: top resource bar, central log stream with filters, tabbed action panels, typewriter narrative, synthesized WebAudio sound effects with one-click mute.

## Getting Started

Prerequisites: Node.js 22+ and pnpm 10.

```bash
pnpm install
pnpm dev
```

Build and test:

```bash
pnpm typecheck   # TypeScript type checking
pnpm build       # tsc --noEmit && vite build → dist/
pnpm preview     # preview the production build
pnpm test        # Vitest unit tests
pnpm test:e2e    # Playwright end-to-end tests
```

## How to Play

1. **Build your first miner** on Barren Planet P-01 — minerals start flowing automatically.
2. **Balance the economy**: solar panels for energy, labs for tech; refineries convert energy into more minerals (soft-degraded when energy is short).
3. **Research technologies** to unlock new buildings (e.g. deep drilling) and multiplier lines.
4. **Reach resource thresholds** to unlock the next planet; each planet adds a new mechanic that reshapes your economy.
5. **Meet the factions** (unlocked at the orbital station) and push reputation through trade, alliances, or coercion.
6. **Unify the system** — ally or win over all factions to reach the ending, then explore the endgame content.

## Tech Stack

- **Language/UI**: TypeScript, Vite, VitePWA
- **Engine**: pure TypeScript, zero DOM dependency (resource production, tech, diplomacy, events, exploration, conquest, fleet, offline settlement, save serialization)
- **UI layer**: DOM rendering on top of immutable engine snapshots, tick and render share a single source of truth
- **Persistence**: IndexedDB autosave + JSON export/import
- **i18n**: `src/i18n/zh.ts` (source of truth) and `src/i18n/en.ts`
- **Testing**: Vitest (engine seam + jsdom UI smoke), Playwright (semantic `data-*` E2E assertions)
- **CI**: GitHub Actions — typecheck, build, PWA build check, and unit tests on push/PR

## Project Structure

```
src/
  engine/   # pure TS game engine (no DOM): core, data, balance, production, tech,
            # diplomacy, events, exploration, conquest, fleet, offline, save, ngplus, ...
  ui/       # DOM rendering: render registry, session (tick+render), actions, layout, log
  persist/  # IndexedDB save/load
  i18n/     # zh / en text resources
  pwa.ts    # Service Worker registration (fault-tolerant)
```

## Documentation

- `CONTEXT.md` — domain glossary and deep-module conventions
- `docs/adr/` — architecture decision records (ADR-0001 …)
- `AGENTS.md` — agent collaboration and testing conventions
- `.scratch/<feature-slug>/` — feature specs and issue tracking

## Status

v0.1.0, active development. A personal project — saves are stored locally and shareable as JSON files.

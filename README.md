# MicroCiv

A turn-based 4X strategy game built for [Meta Ray-Ban Display](https://www.meta.com/ai-glasses/) smart glasses. Civ-inspired, Polytopia-influenced, single-player vs. one AI civilization. Controlled with the EMG Neural Band's D-pad gestures.

Built with the [Meta Wearables Web App](https://github.com/facebookincubator/meta-wearables-webapp) toolkit — vanilla HTML / CSS / JS, no dependencies, fits the 600×600 additive-display viewport.

## How to play

- **Goal**: capture the enemy capital, or finish researching every technology.
- **Found cities** with your Settler. Cities grow from food, produce units / buildings from production.
- **Build an economy** — work nearby tiles for food / production / gold / science.
- **Research** unlocks new units (Archer, Horseman) and buildings (Granary, Walls, Market).
- **Win battles** by attacking adjacent enemies; defense is boosted on hills, in cities, by walls, and by Fortify.

## Controls

The neural band emits arrow-key D-pad events plus a pinch = Enter. MicroCiv adds two key-sequence shortcuts because the band has no extra buttons:

| Input | Action |
|-------|--------|
| Arrows | Move the cursor one tile (default) |
| **↑ ↓ ↑ ↓** | Toggle **Cursor ↔ Scroll** mode (scroll mode pans the map) |
| **← → ← →** | Cycle zoom: FAR / NORMAL / CLOSE |
| Enter / pinch | Open the action menu for the tile under the cursor |
| Escape | Cancel selection / close menu |

A pill in the bottom bar always shows the current mode. The hint line beside it reflects what the next press will do.

### Bluetooth / USB controller

Any [Standard-mapping](https://w3c.github.io/gamepad/#remapping) gamepad (Xbox, PlayStation, etc.) works the moment it's paired — no setup. It's translated into the same inputs as the keyboard, so combos and menus behave identically.

| Control | Action |
|---------|--------|
| D-pad / left stick | Move the cursor (or pan, in scroll mode); navigate menus. Holding a direction auto-repeats |
| **A** | Act — same as Enter / pinch |
| **B** | Cancel / close menu / cycle to next unit (Escape) |
| **X** | Toggle Cursor ↔ Scroll mode |
| **Y** | Open the Research menu |
| **LB / RB** | Cycle zoom |
| **Start** | End turn |

## Action menu

Press Enter on a tile and the menu shows everything you can do there:

- **Select / Move** — pick a unit, then arrow to an adjacent tile and press Enter again to walk into it (or attack)
- **Found City** (Settler) — consumes the settler, plants a capital / colony
- **Build Improvement** (Worker) — Farm on grass / plains, Mine on hills
- **Attack Adjacent** — if a hostile unit is one tile away
- **Fortify** — end turn early; +25% defense, heal +2 HP/turn
- **Manage City** — production queue, food / prod / gold / science breakdown
- **Research** — pick the next tech to learn
- **End Turn** — advance time; AI acts; new turn begins

## Layout

- 600×600 viewport, dark theme (black = transparent on the glasses' additive display)
- Hex grid, 14×14 tiles, fog of war for unexplored area
- Top HUD: turn / gold / science / current research
- Bottom HUD: mode pill, contextual hint, tile-under-cursor info
- Canvas-rendered map; DOM overlays for menus

## Run locally

```bash
python -m http.server 5182
# then open http://localhost:5182
```

Arrow keys + Enter simulate the Neural Band on desktop. The combo shortcuts work the same on a keyboard.

## Deploy

Hosted as a static site — any HTTPS host works. Configured for [Render](https://render.com) via `render.yaml` with two environments:

| Branch | Render service | URL |
|--------|---------------|-----|
| `main` | `microciv` | https://microciv.onrender.com |
| `staging` | `microciv-staging` | https://microciv-staging.onrender.com |

Workflow:

1. Develop on a feature branch
2. Merge to `staging` — Render auto-deploys to the staging URL; verify on-device
3. When happy, merge `staging` → `main` to ship to production

Once live, add the production URL to the glasses via the Meta AI app → Devices → Display Glasses → App connections → Web apps.

## Files

```
index.html           Title, game, menus, modals
styles.css           Dark theme, HUD, modals, focus rings
app.js               Engine: map gen, render, input, units, cities, tech, AI
favicon.png          App icon (hex with a star)
manifest.webmanifest Web App Manifest
render.yaml          Render static site config
```

## Game systems

**Map.** 14×14 hex grid (pointy-top, odd-r offset). Seven terrain types — grass, plains, forest, hills, mountain, desert, sea. Sprinkled resources: wheat (+food on grass), horses (+prod on plains), iron (+prod on hills). Cellular smoothing for natural-looking biomes; sea-frame around the edges.

**Economy.** Each city works tiles within one ring. Base city yield: 2 food, 1 prod, 2 gold. Citizens are auto-assigned to best tiles up to `pop`. Buildings stack bonuses (Granary +2 food, Walls +4 def, Market +3 gold). Military units cost 1 gold/turn upkeep; civilians free.

**Tech.** Six-tech tree, two starting branches:

- Pottery → Masonry → Currency
- Archery → Husbandry
- Husbandry + Currency → Metalworking (+2 atk to Warriors)

Player picks research from the Research menu; AI auto-picks the cheapest available next.

**Combat.** Both attacker and defender take damage based on power ratio. Defense bonuses: terrain (hills +50%), fortify (+25%), city tile (+25%), city + walls (+75%). Killing the defender lets the attacker move into the vacated tile (capturing a city if no defender was there).

**Victory.** Capture the enemy capital (Domination) or research all 6 techs (Science).

## AI

Two-phase strategy:

- **Build-up (turns 1–11):** AI military units defend their home cities — patrol within 2 hexes, fortify if no enemy is adjacent. AI cities prioritize warrior, then settler for second city, then better military.
- **Aggressive (turn 12+):** AI marches toward the nearest player unit or city. Won't push if outnumbered — falls back to defense until they out-build the player.

Settlers auto-found at the first acceptable spot ≥ 4 hexes from existing AI cities. Workers wander (improvement-building isn't implemented for the AI yet).

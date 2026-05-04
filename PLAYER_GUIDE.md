# Void Runner — Player guide

Void Runner is a **2D browser space game** with Newtonian flight, layered shields and armour, an energy economy (fuel, reactor, ship battery, shields), stations for trade and refit, missions and cargo, faction reputation, and a **galaxy map** for plotting hyperspace jumps. This guide matches the current build (Canvas UI, keyboard-first).

---

## Running the game

From the project folder, install once (`npm install`), then start the dev server with `npm run dev` and open the URL Vite prints (usually `http://localhost:5173`). Use a **desktop browser** with the game tab focused so keyboard input reaches the canvas.

**Progress** is saved automatically to the browser’s **localStorage**, keyed by the world’s seed. Clearing site data for the origin removes saves.

---

## Main menu

Use **Up** / **Down** to move the highlight and **Enter** to confirm (Continue / New game / Quit as offered).

---

## Flight — how it feels

- **No air drag.** Thrust changes your velocity; you keep drifting until you thrust the other way or use **auto-brakes**.
- The **camera stays on your ship**; the sector moves around you.
- **Gravity** from planets, moons, and stations pulls you; mass and distance matter.
- Leaving the **sector edge** moves you into the **adjacent** sector on the galaxy grid (you do not fly through empty inter-sector space).

---

## Flight controls

| Input | Action |
|--------|--------|
| **↑** / **↓** | Forward / reverse thrust |
| **←** / **→** | Rotate counter-clockwise / clockwise |
| **Q** | Toggle **linear** auto-brake (bleeds forward speed toward zero) |
| **E** | Toggle **rotation** auto-brake (bleeds spin toward zero) |
| **L** | **Land** when the landing prompt is active (you must be in range and slow enough — see below) |
| **Tab** | Cycle **ship** target (for combat / HUD) |
| **G** | Cycle **landable** target (stations / planets you can dock at) |
| **Z**, **X**, **C**, **V**, **B** | Fire **weapon groups** 1–5 (what is installed in each slot depends on your loadout) |
| **M** | Toggle the **active missions** panel |
| **K** | Open **galaxy map** (pick hyperspace target; see below) |
| **J** | **Hyperspace jump** one hop toward the map target (requires drive, fuel, cooldown, and a valid target) |
| **Esc** | **Pause** — Resume, Help (same list as above), or Main Menu (saved progress is kept) |

While **paused**, use **↑** / **↓** and **Enter** to activate menu rows; mouse clicks on the buttons also work.

**R** (flight): instant **refuel** — intended as a **development aid** in current builds, not a balanced mechanic.

---

## Landing

To dock you must be:

- **Close** to the body — within about **2.5×** its landing radius (the HUD shows when you are in range), and  
- **Slow** — speed below the game’s landing threshold (same order of magnitude as hyperspace arrival speed).

When the prompt appears, press **L**. After launch, a short cooldown prevents immediate re-landing.

**Tip (from the in-game help):** enable **both** **Q** and **E** auto-brakes on final approach so you do not overshoot.

---

## Galaxy map and hyperspace

Press **K** to open the map.

- **Arrow keys** move the **cursor** one sector at a time (Up increases **grid Y** in map space as implemented).
- **Enter** sets the sector under the cursor as your **hyperspace target** (saved with your game).
- **Backspace** clears the target.
- **Esc** or **K** closes the map.

Press **J** in flight to jump **one hop** toward that target, up to your drive’s **jump range** (not necessarily the full distance in one jump). You need:

- A **hyperspace drive** installed,  
- Enough **fuel** for that drive’s **cost per jump**,  
- Jump **cooldown** ready,  
- A **target** set on the map (if something is missing, a short banner explains it).

Visited sectors and faction colours are shown on the map; **radiation** tint marks hazardous regions.

---

## Combat and damage

Incoming fire is resolved in layers — **shield** first (when online), then **armour** layers (each type interacts differently with damage categories), then **hull**.

- If the shield drops, it can **reboot** after a delay; while rebooting it does not absorb hits.
- Shields **regenerate** using ship **energy (Joules)** when conditions are met (reactor, fuel, and timing rules apply to you and NPCs alike).
- **Hull** at zero means **destruction** — see Insurance below.

The **minimap** and target strip help you see nearby ships and hostility. Use **Tab** to change the ship you are focusing.

---

## Stations (landed)

Press **T** to **take off** (or use the on-screen control).

**Tab** cycles **tabs** that the station actually offers (Overview, Reputation, Missions, Supplies, Repair, Shipyard, Equipment store, Training placeholder — depending on services).

- **Overview / Reputation** — flavour text and your standing with factions. **Standing** affects prices and attitude at ports.
- **Missions** — accept jobs; **Arrow Up / Down** scroll the list when it is long. Deliveries need **free cargo space**.
- **Supplies** — refuel, recharge ship energy, refill shields (as implemented for that port).
- **Repair** — pay to fix hull and armour (hold or full-repair controls as shown).
- **Shipyard** — buy hulls and **customize** slots; large lists scroll with arrows, **Page Up/Down**, **Home** / **End**.
- **Equipment store** — buy and sell gear. **Selling** pays a **fraction** of the list price (not full value).

Most actions are **mouse** on panels; keyboard supplements scrolling and **Tab** / **T** as above.

**Y** while docked grants extra **credits** in current builds — **development aid only**.

---

## Insurance (ship destroyed)

When your hull is lost, you get an **insurance** choice:

- **Option A — Claim:** pay a **fraction** of your destroyed ship’s **value** to get that **same hull and loadout** back with **full hull**, respawned at a station you had visited (if you cannot afford the fee, this option stays disabled).  
- **Option B — Payout:** you are moved to a **starter-style** replacement ship, keep your existing **credits**, and receive a **lump payout** (~90% of the lost ship’s value). You wake up docked at a **reachable** friendly port when possible.

Use **A** / **B** or click the panels.

---

## Practical tips

1. Watch **fuel**, **battery (Joules)**, and **shield** together — running dry affects thrust recovery and shield regen.  
2. Learn **one hop** on the map: long routes are multiple **J** jumps along the same target until you arrive.  
3. **Radiation** sectors eat hull over time — plan repairs and movement.  
4. Before hard fights, **dock** for repairs and to adjust **weapons** and **defence** in the equipment store and shipyard.

---

## Credits and inspiration

Void Runner is inspired by classic open-ended space traders (notably **Escape Velocity**–style design). Ship and UI visuals are **procedural** (drawn on Canvas), not sprite art.

If anything here disagrees with a future patch, trust the in-game **Pause → Help** flight list and on-screen prompts first.

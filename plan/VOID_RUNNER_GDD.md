# VOID RUNNER — Game design document (living)

> High-level design and player-facing rules. Runtime architecture and delivery order live in **`plan/CONTEXT.md`** and **`plan/VOID_RUNNER_Roadmap.md`**; the actionable checklist is **`plan/VOID_RUNNER_Backlog.md`**. World generator pipeline detail: **`plan/VOID_RUNNER_WorldGen.md`**.

This file is intentionally partial: expand sections as features ship. Sections below are authoritative when present.

---

## Persistence and saves (planned)

**Problem:** `localStorage` is per browser profile and origin; players lose progress when switching devices, clearing site data, or using strict privacy modes.

**Direction:** Treat the **same logical snapshot** the game already persists (`PersistedWorldState` in code — current sector, visited sectors, full `ShipState`, faction reps, rep log trim, pilot name, play time, hyperspace target) as the **canonical save blob**. Store it in two tiers:

1. **`localStorage`** — frequent writes (current behaviour: many call sites after meaningful actions and HUD sync). Keeps resilience to tab refresh and same-device return.
2. **JSON on disk (portable)** — same payload (plus a small **file header**: format version, world `metadata.seed`, optional world name / file version for validation). Linked to a **specific world** by **seed** (and optionally by explicit world file path the player associates in UI copy). Enables backup, cloud sync by the player, and device migration.

**Browser constraints:** Arbitrary silent writes to disk are not available in a normal web app. The plan assumes **explicit user flows**: **Export save** (download JSON), **Import save** (file picker), and optionally **File System Access API** (where supported) so the player can grant a file handle once and the game can **append/overwrite that file on coarser milestones** without a new download each time.

**Disk vs localStorage frequency:**

- **localStorage:** unchanged philosophy — save often enough that a crash mid-session loses little (e.g. keep after landable purchases, sector loads, map target change, etc.).
- **File:** **fewer** writes — proposed triggers: **sector change** (including edge transition), **enter / leave landable** (landing and takeoff), **economic / loadout mutations** (credits spent or gained, equipment buy/sell/install, shipyard, fuel and repair transactions, insurance toggle/purchase), **galaxy map hyperspace target** change, **main menu exit** / **`beforeunload`** (best-effort), and optional **debounced** file flush (e.g. 30–60 s) only if a handle is held. **Do not** require a file write every frame.

**Load order (conceptual):** When resuming, prefer **imported file** if the player selects it and seed matches the loaded world; else **`localStorage`** for that seed; reconcile policy (e.g. “newer `savedAt` wins” if both exist) should be documented in implementation notes.

**Non-goals for v1 of this slice:** Cloud-hosted saves, multiplayer sync, encrypting saves (plain JSON is fine for a single-player game).

---

*Add further GDD sections (economy, missions, factions, etc.) as design stabilizes.*

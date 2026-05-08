# VOID RUNNER — Archetype checklist

Use this list as the balancing roadmap for world-generation archetypes.
Keep entries descriptive first, then attach numeric ranges as each archetype is tuned.

---

## How to use this checklist

- Mark an item done only when `raw/basic/advanced` loadouts are coherent for the archetype.
- Keep mass assumptions in tons (`t`) and thrust display in `kTU` (`force / 1000`).
- Validate each pass with in-game feel checks (not only static numbers).

---

## Combat archetypes

- [x] **Interceptor** — very fast, high agility, fragile, short-range strike craft; low sustain and tight equipment budget. *(Baseline closed **2026-05** — see Notes.)*
- [x] **Dogfighter** — balanced frontline combat baseline; good agility, moderate survivability, versatile weapon fit.
- [ ] **Heavy Fighter** — slower but tougher fighter with stronger payload and higher survivability focus.
- [ ] **Strike Bomber** — missile/torpedo-forward attacker designed for high burst on large or defended targets.
- [ ] **Gunship** — low agility platform with sustained firepower and durable frame for prolonged engagements.
- [ ] **Escort Frigate** — convoy-defense military hull with broad coverage and fleet-support combat behavior.
- [ ] **Corvette / Battleship** — large combat hull class with extreme mass, heavy defenses, and capital-level weapon profile.

---

## Civilian and utility archetypes

- [ ] **Shuttle / Taxi** — small civilian passenger transport; low cargo, low combat profile, efficient operation.
- [ ] **Liner / Bus** — larger passenger transport emphasizing reliability and survivability over agility.
- [ ] **Service Craft** — maintenance/refuel/tow utility vessel; support role with specialized non-combat equipment.
- [ ] **Survey / Scanner** — exploration/recon platform with sensor emphasis and minimal direct combat commitment.
- [ ] **Miner / Salvager** — industrial work hull optimized for extraction/recovery workflows, not speed or dogfighting.
- [ ] **Unarmed Civilian** — pure civilian baseline with no weapon profile; useful for traffic and non-combat world flavor.
- [ ] **Civilian Tank** — heavily armored civilian transport with very low speed; survives danger rather than escaping it.

---

## Cargo and logistics archetypes

- [ ] **Courier** — fast, light logistics ship for high-value or time-sensitive cargo.
- [ ] **Hauler** — medium cargo baseline with balanced speed, cost, and survivability.
- [ ] **Bulk Freighter** — very high-capacity long-haul cargo platform; slow but efficient.
- [ ] **Armored Transport** — cargo vessel with defensive bias for dangerous routes and contested regions.

---

## Rare/extreme spice archetypes

- [ ] **Drone Fighter** — compact, expendable combat chassis; high risk, low cost, swarm-friendly profile.

---

## Notes

- Existing hulls currently cover early anchors:
  - `dogfighter_mk1` → Dogfighter baseline.
  - `interceptor_mk1` → **Interceptor baseline** (`public/testWorld.json`).
- **`interceptor_mk1` (Interceptor)** — tuning snapshot **2026-05**:
  - **`equipmentCapacity`:** 40 (installed equipment mass only; hull mass is separate in code).
  - **Slots:** single forward + rotate thrusters, two weapons, **`hyperspaceDrive`: 0** on hull `slotCounts` (no jump drive on this archetype).
  - **`fuel_tank_s`:** “Fuel Cell (S)” — extended-range tank tuned for the fighter fuel slot (distinct id from **`fuel_tank_large`**; stats diverged during balance pass — always read masses/capacity from catalog).
  - **Advanced factory fit:** heavy armour, **`fuel_tank_s`**, standard reactor, heavy shield, seeker + pulse, fighter rotation thruster — **installed mass sums to the hull `equipmentCapacity`** at current numbers (no spare capacity margin); **`validateWorldFile`** rejects Σ equipped mass above capacity — re-check after any item or hull tweak.
  - **Aligned data:** `defaultLoadouts.advanced`, **`startingConditions`** (starter ship), and **`sy_interceptor_mk1_advanced`** shipyard listing should stay in sync with the same fit.
- Keep IDs stable where possible; evolve names/descriptions/loadouts for generator flavor.

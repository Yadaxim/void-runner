import type { SpeciesDraft } from '../types/speciesGeneration';

/** Fixed fauna catalog — appended to every step 3 output; not part of nation `count`. */
export const MOCK_WILDLIFE_DRAFTS: SpeciesDraft[] = [
  {
    name: 'Rift Maw',
    archetype: 'biotic',
    speciesRole: 'wildlife',
    physiology:
      'Ribbon eels the size of shuttles; no language, no contracts — only hunger along nebula drift lanes and chitin plates that scrape hull paint.',
    ethos:
      'Migration follows nutrient gradients; anything shiny in the lane is food until proven otherwise.',
    codex:
      'Rift Maws are shuttle-scale ribbon eels that hunt nebula drift lanes alone or in pairs. They do not talk, sign contracts, or appear on crew manifests — insurers list them as lane hazards. Pilots learn their reflection patterns the way sailors once learned reefs. When a contact closes, it is one long body on sensors, not a fleet.',
    worldgenBrief:
      'Wildlife hazard; organic creature-ship; nebula lanes. No factions or mission boards — hazard spawns and cull contracts only. Step 7 places populations in unclaimed dust. Combat: ambush, hit-and-run. Never playable.',
    techArchetype: 'organic',
    preferredHabitat: 'nebula'
  },
  {
    name: 'Hull Grazer',
    archetype: 'biotic',
    speciesRole: 'wildlife',
    physiology:
      'Barnacle colonies that fuse into drifting mats; scrape alloy for trace metals and spit acid threads across slow freighters.',
    ethos:
      'Aggregate until the scrape is rich, then bud off rafts that ride solar wind between wrecks.',
    codex:
      'Hull Grazers are living rust: millions of calcareous mouths in a mat that reads as one oversized contact on radar. They colonize derelicts and station keels, stripping paint and sensors for minerals. Port engineers burn them off with plasma sweeps; ecologists argue they recycle the rim. You never negotiate with a Grazer mat — you hose it or avoid it.',
    worldgenBrief:
      'Wildlife hazard; organic hull-mat; rim wrecks and abandoned docks. No nations. Step 7 seeds slow-drifting pockets on junk fields. Missions: clearance, hull inspection escorts. Sticky, corrosive boarding flavor.',
    techArchetype: 'organic',
    preferredHabitat: 'rim'
  },
  {
    name: 'Spindle Skate',
    archetype: 'biotic',
    speciesRole: 'wildlife',
    physiology:
      'Wide flat mantas with magnetic bell mouths; glide dust lanes and sip charged particles from ship wake turbulence.',
    ethos:
      'Shadow larger prey until the wake cools, then skim exhaust for a meal — rarely aggressive unless provoked.',
    codex:
      'Spindle Skates sail nebula lanes like dark kites, bell mouths pulsing violet when they taste ion wake. Most captains ignore them until one clips a radiator fin. Skates are solitary on long-range scans — elegant, quiet, and stupidly fast in a straight line. Wildlife handlers tag migration corridors so convoys can steer clear.',
    worldgenBrief:
      'Wildlife hazard; nebula/mid dust lanes; wake-feeder behavior. Organic manta silhouette. Hazard rating low until collision. Step 7: migratory ribbons on maps. No faction diplomacy or nation composition.',
    techArchetype: 'organic',
    preferredHabitat: 'nebula'
  },
  {
    name: 'Kelp Nomad',
    archetype: 'biotic',
    speciesRole: 'wildlife',
    physiology:
      'Buoyant algae veils trailing gas sacs; whole shoals drift on trade winds between orbital farms and leak clouds.',
    ethos:
      'Photosynthesize, reproduce, tangle — shoals split and merge with season, blocking sensors like green fog.',
    codex:
      'Kelp Nomads are not one creature but a drifting forest: gas-filled bladders and leaf fronds that clog intakes if you plow through. Farmers harvest them legally in some sectors; elsewhere they are pests that mask smuggler runs. On scope they bloom as a soft contact — many small returns, one cloud.',
    worldgenBrief:
      'Wildlife hazard; farm-adjacent mid-ring zones; organic bloom silhouette. Step 7: shoals in trade corridors. Missions: harvest permits, lane clearing, smuggler cover stories. No playable sentience. Excluded from nation roster and faction skeleton.',
    techArchetype: 'organic',
    preferredHabitat: 'mid'
  },
  {
    name: 'Needle Brood',
    archetype: 'biotic',
    speciesRole: 'wildlife',
    physiology:
      'Spore comets — hollow needles packed with larvae that hatch on warm hulls and chew sealant for calcium.',
    ethos:
      'Release on thermal bloom; larvae feed, pupate, launch — cycle measured in dock hours, not years.',
    codex:
      'Needle Broods arrive as glittering swarms on thermal scopes, each needle a seed pod riding solar pressure. Warm freighters attract them like hearth fires. Quarantine fines are brutal; exterminator drones are cheap. Pilots describe the sound of larvae on hull as rain on tin — until the seals fail.',
    worldgenBrief:
      'Wildlife hazard; organic spore-cloud; warm cargo lanes. Step 7 infestation pockets near busy ports. Missions: quarantine, fumigation escort. High annoyance, low individual intelligence. Excluded from faction skeleton.',
    techArchetype: 'organic',
    preferredHabitat: 'mid'
  },
  {
    name: 'Ridge Scraper',
    archetype: 'biotic',
    speciesRole: 'wildlife',
    physiology:
      'Crab-leg walkers grown house-sized on asteroid ridges; grind ice for minerals and lunge at passing tugs.',
    ethos:
      'Territorial on rock; charge anything that vibrates the ridge — too dumb to hold grudges, too heavy to ignore.',
    codex:
      'Ridge Scrapers cling to dark asteroids like armored barnacles with legs. Miners mark their peaks on charts; rookies learn when the dust shakes. A lone contact is one big heat blob launching off spinward face — no tactics, just mass. Rim salvage crews sometimes harvest their shells after a kill.',
    worldgenBrief:
      'Wildlife hazard; rim asteroid fields; heavy organic charger silhouette. Step 7 territorial markers on rocks. No factions. Combat: short rush, high impact. Mining hazard missions. Never in nation roster.',
    techArchetype: 'organic',
    preferredHabitat: 'rim'
  },
  {
    name: 'Gas Siphon',
    archetype: 'biotic',
    speciesRole: 'wildlife',
    physiology:
      'Jelly balloons with trailing stingers; filter hydrogen from brown dwarf skim lanes and deflate when punctured.',
    ethos:
      'Drift toward rich gradients; sting reflex if touched — predators rare, stupidity common.',
    codex:
      'Gas Siphons hang in radiation-skewed lanes like pale umbrellas, sucking fuel-rich soup through porous skin. Skim captains hate them — a burst sack coats viewports in oily film. They read as lone drifters unless mating season stacks them in layers. Insurers class them as environmental, not hostile, until a stinger cracks a canopy.',
    worldgenBrief:
      'Wildlife hazard; radiation/brown-dwarf skim zones; balloon-jelly organic silhouette. Step 7 drift lanes. Missions: skim escort, puncture cleanup. Low aggression unless collided. Not selectable at character creation.',
    techArchetype: 'organic',
    preferredHabitat: 'radiation'
  },
  {
    name: 'Ember Locust',
    archetype: 'biotic',
    speciesRole: 'wildlife',
    physiology:
      'Heat-loving insects in iron-chitin shells; swarm reactor vents and cooling towers on fringe stations.',
    ethos:
      'Follow gamma glow; breed in warm exhaust; swarm lifts when the food cools.',
    codex:
      'Ember Locusts are a station plague: clouds of glowing insects that taste coolant and reproduce in vents. On infrared they look like a single angry contact wrapped around your radiator geometry. Exterminators sell burn cycles; engineers sell filters. No one assigns them citizenship — only extermination bounties and the occasional research tag.',
    worldgenBrief:
      'Wildlife hazard; radiation-adjacent stations; insect-cloud organic silhouette. Step 7 vent colonies. Missions: reactor maintenance escorts, plague burns. Never nations. High nuisance factor; insurers treat as infrastructure pest, not piracy.',
    techArchetype: 'organic',
    preferredHabitat: 'radiation'
  },
  {
    name: 'Drift Gull',
    archetype: 'biotic',
    speciesRole: 'wildlife',
    physiology:
      'Scavenger birds with vacuum-adapted wings; ride wake vortices and peck at exposed cable runs on slow haulers.',
    ethos:
      'Follow garbage and exhaust; scatter when fired upon; return when the convoy slows.',
    codex:
      'Drift Gulls are rim vermin with dignity: car-sized scavengers that treat your tow cable like a snack string. Alone they are a nuisance blip; in flocks they harass until gunners get bored. Cargo cults on some stations feed them — insurers hate that. They are biology doing pigeons in hard vacuum.',
    worldgenBrief:
      'Wildlife hazard; rim convoy lanes; avian organic silhouette. Step 7 wake followers. Missions: escort pest control, cable repair. Low damage, high irritation. No diplomacy or trade missions. Never selectable at character creation.',
    techArchetype: 'organic',
    preferredHabitat: 'rim'
  },
  {
    name: 'Chain Lamprey',
    archetype: 'biotic',
    speciesRole: 'wildlife',
    physiology:
      'Segmented eel chains that magnet-lock to hulls and siphon power from backup cells — one head, many gripping discs.',
    ethos:
      'Attach to anything powered down; drain until full or killed; drop off as a string of fried rings.',
    codex:
      'Chain Lampreys are the reason dock crews walk the hull with stun batons. They sense idle capacitors and latch in a line, sucking trickle charge until the ship wakes grey. A signature is a row of small contacts along your keel — creepy, not apocalyptic, unless you needed that backup juice.',
    worldgenBrief:
      'Wildlife hazard; mid/rim berths; segmented eel organic silhouette. Step 7 idle-ship parasites. Missions: hull walks, power audits. No diplomacy. Never nation factions. Organic creature-hull art only at this stage.',
    techArchetype: 'organic',
    preferredHabitat: 'mid'
  },
  {
    name: 'Bloom Rot',
    archetype: 'biotic',
    speciesRole: 'wildlife',
    physiology:
      'Fungal spore towers that burst in nebula humidity; rot organic insulation and grow through cargo crate seams.',
    ethos:
      'Spread where moisture and darkness meet; fruiting bodies pop on schedule — crews call it the countdown smell.',
    codex:
      'Bloom Rot is a living stain: spore towers that swell in damp nebula pockets and spew clouds when disturbed. Freighters carrying organic goods fear it more than pirates — one infected crate and the whole hold fuzzes over. Contacts look like a spreading fog with too many edges. Fire works; lawyers argue about who pays.',
    worldgenBrief:
      'Wildlife hazard; nebula humidity pockets; fungal cloud organic silhouette. Step 7 spoilage zones. Missions: cargo purge, decontam escort. Contamination horror, not sentient trade. Excluded from step 4 factions.',
    techArchetype: 'organic',
    preferredHabitat: 'nebula'
  }
];

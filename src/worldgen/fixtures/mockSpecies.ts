import type { SpeciesDraft } from '../types/speciesGeneration';

/**
 * Deterministic mock pool (slice to count; roles assigned in code via assignSpeciesRolesForCount).
 * Order: human → void anchor → playable-capable → npc-only.
 */
export const MOCK_SPECIES_DRAFTS: SpeciesDraft[] = [
  {
    name: 'Human',
    archetype: 'biotic',
    speciesRole: 'human',
    physiology:
      'Standard human baseline: oxygen-breathing, bilateral symmetry, no mandatory augments; rim clinics sell mods but identity stays individual and crew-scale.',
    ethos:
      'Debt, contracts, and salvage law feel personal — you recognize yourself in every docking queue and every forged signature.',
    codex:
      'Baseline humans are the galaxy\'s default crew: adaptable, argumentative, and stubbornly individual. You grew up on stations where air costs money and paperwork decides who docks. Augments are common but optional — chrome knuckles, retinal overlays, cheap gene tweaks — yet the law still treats you as one person with one name on the manifest. Trade corridors feel familiar: hybrid yards weld organic panels onto alloy ribs, insurers read your face instead of a swarm census, and captains expect you to sign, swear, and stand behind the deal you made.',
    worldgenBrief:
      'Dominant polity anchor species; hybrid tech yards, corporate contracts, mid-ring trade law. Factions led by humans favor bureaucracy-light charters, salvage courts, and modular freighters. Diplomacy: negotiable, debt-aware. Ship culture: patched hulls, licensed clinics, practical escorts. Taboos: selling crew identity, unregistered forks. Use for major_nation tone, mission givers, and civilian station flavor.',
    techArchetype: 'hybrid',
    preferredHabitat: 'mid'
  },
  {
    name: 'Pale Reach',
    archetype: 'shimmerborn',
    speciesRole: 'npc',
    physiology:
      'Phase-framed silhouettes without stable organs; medical scans show yesterday inside tomorrow — not a body you inhabit, a phenomenon you insure against.',
    ethos:
      'Rim cults call them saints; core insurers call them contamination — trade is with sensor ghosts, not fellow workers.',
    codex:
      'Pale Reach entities are shimmer-framed — outlines without stable organs, histories that arrive out of order on medical scans. Rim cults build shrines; core actuaries build exclusion clauses. Trade means negotiating with sensor ghosts and void-spliced barges that flicker on long exposure. There is no playable body here, only proximity risk and relic markets that sell what the bubble almost remembered.',
    worldgenBrief:
      'Mandatory void anchor for every galaxy; void-only hull family. Black-market relic trade, cult politics, insurer panic. Factions: saint syndicates vs quarantine boards. Diplomacy: unreliable, reality-glitch. Ships: phase silhouettes, illegal splice tech. Taboos: unshielded contact, claiming citizenship. Horror/mystery missions — the void the game is named for.',
    techArchetype: 'void',
    preferredHabitat: 'shimmer'
  },
  {
    name: 'Kethari',
    archetype: 'amalgam',
    speciesRole: 'playable',
    physiology:
      'Photosynthetic skin under jointed carapace; one mind per body, augments common, still hires out as crew rather than swarm.',
    ethos:
      'Growth contracts bind individuals — debt to a grove is personal, and harbors publish tariffs you can argue with face to face.',
    codex:
      'Kethari are engineered grove-folk: chlorophyll bands under lacquered carapace, heat radiators along the spine, and a metabolism that hates long void hops without lamp arrays. Each adult is a single negotiator — groves finance your augments, but the contract bears your name, not the hive\'s. In nebula ports they run greenhouse docks where organic hull matting still smells like wet bark, and captains learn to read their stillness as patience, not threat.',
    worldgenBrief:
      'Organic tech, nebula habitats, growth-debt economy. Playable captains: personal grove loans, photosynth ship gardens. Factions: tariff publishers, agro-patent holders. Diplomacy: ledger-polite, slow to war, fast to embargo. Ships: grown plating, solar barge silhouettes. Taboos: hive-mind rhetoric, burning nursery decks. Mission flavor: haul living cargo, mediate grove defaults.',
    techArchetype: 'organic',
    preferredHabitat: 'nebula'
  },
  {
    name: 'Vorn Shell',
    archetype: 'construct',
    speciesRole: 'playable',
    physiology:
      'Single licensed chassis per citizen ID; consciousness runs locally, not distributed — bodies are rented shells, not a hive.',
    ethos:
      'Forking without registry is crime, but one mind signs the contract — arbitration firmware sold to rivals is a solo hustle.',
    codex:
      'Vorn citizens are minds on lease: you wake in a chassis stamped with your citizen ID, swap bodies at franchised clinics, and treat skin like luggage. Memory stays local — the law hunts unlicensed forks. Core stations feel built for you: robotic yards where drone swarms obey one owner-pilot, arbitration houses sell ruling patches, and rivals pay premium for firmware that wins salvage disputes without splitting into a gestalt.',
    worldgenBrief:
      'Robotic/inorganic fleets, core habitats, registry-state law. Playable: solo AI captain, chassis rental culture. Factions: arbitration syndicates, licensed fork hunters. Diplomacy: contract-first, punitive cloning. Ships: drone tenders, smart fabs, stamped serial plates. Taboos: distributed consciousness claims, black-market forks. Equipment and missions: license upgrades, repo chassis, firmware heists.',
    techArchetype: 'robotic',
    preferredHabitat: 'core'
  },
  {
    name: 'Drift Syndicate',
    archetype: 'biotic',
    speciesRole: 'playable',
    physiology:
      'Rim-spacer humans and near-humans with heavy augments; still one passport and one nervous system per suit, not a mesh.',
    ethos:
      'Anonymity is inventory — they smuggle patents and sell dock access, but the deal closes with a single handshake.',
    codex:
      'Drift Syndicate crews are rim-born biotics in layered suits: near-human, heavily modded, allergic to central databases. They sell dock shadows, forged transit stamps, and quiet rides past customs. One passport, one nervous system — the syndicate shares tools, not minds. Energy-field skiffs flicker on patrol routes where official sensors lag, and their captains speak in prices, not philosophies.',
    worldgenBrief:
      'Rim independents, energy-tuned smuggling craft, black-market patents. Playable: shadow broker captains. Factions: loose syndicates, not nations. Diplomacy: mercenary, deniable. Ships: field-skiff silhouettes, sensor ghosts. Taboos: real names on open channels. Missions: contraband, data runs, escort fraud. Pair with human majors as friction, not subjects.',
    techArchetype: 'energy',
    preferredHabitat: 'rim'
  },
  {
    name: 'Ashward Swarm',
    archetype: 'collective',
    speciesRole: 'npc',
    physiology:
      'Macro-insects linked by pheromone mesh repeaters; no single drone is a person — the swarm votes with hunger, not a captain.',
    ethos:
      'Border raids are policy failures of the hive; mercy is a calorie spreadsheet no individual can appeal.',
    codex:
      'Ashward is not a captain you can be. The Swarm is a continent of macro-insects knit by pheromone mesh repeaters on rusted freighters — hunger flows like policy, and border raids are arithmetic corrections. Traders meet liaison drones that parrot consensus; mercy is calories allocated, not kindness. Inorganic hives chew through rim depots, and insurers classify every hull tag as infestation risk.',
    worldgenBrief:
      'NPC hive nation; inorganic swarm fleets; rim raids. No playable character — diplomacy via drone liaisons only. Factions: expansionist calorie states. Combat: wave tactics, boarding as feeding. Taboos: appealing to individual drones. Mission tone: extermination contracts, quarantine, hive reparations. Never assign solo captain fantasy.',
    techArchetype: 'inorganic',
    preferredHabitat: 'rim'
  },
  {
    name: 'Luminids',
    archetype: 'fieldborn',
    speciesRole: 'npc',
    physiology:
      'Braided plasma filaments in membrane sacks — no fixed humanoid pilot slot; contact is chorus pressure, not a handshake.',
    ethos:
      'They vow to the drive as a species-wide liturgy; crews who dock with them are cult guests, not interchangeable citizens.',
    codex:
      'Luminids are living aurora in membrane sacks — plasma filaments braided through radiation baths, without a chair you could sit in. Contact arrives as chorus pressure on hull skin and drive coils; guests are liturgy participants, not crew. Biolume cathedrals grow on their tenders, and human chaplains argue whether the fields are gods or industry. You do not play as a Luminid; you survive docking one.',
    worldgenBrief:
      'NPC fieldborn cult fleets; biolume + radiation habitats. Chorus telemetry, shrine bays, non-humanoid interfaces. Factions: missionary states, radiation zone control. Diplomacy: ritualized, dangerous to refuse. Ships: living light hulls, no standard airlock etiquette. Taboos: mocking vows, stealing membrane relics. Use for weird allies, hazardous trade, and spiritual equipment flavor.',
    techArchetype: 'biolume',
    preferredHabitat: 'radiation'
  },
  {
    name: 'Panoptic Trade',
    archetype: 'amalgam',
    speciesRole: 'playable',
    physiology:
      'Gene-modded merchants in layered skinsuits; each limb carries a patent license but one passport mind runs the ledger.',
    ethos:
      'Information is cargo — they leak tariffs for a fee and bankrupt rivals, as individuals who enjoy the game.',
    codex:
      'Panoptic traders are amalgam merchants: gene-modded, skinsuit-layered, every limb tagged with a patent number yet one mind on the passport. They sell information like ore — leaked tariffs, dock schedules, rival liquidity — and treat bankruptcy as sport. Compound yards stack organic, alloy, and field systems in corporate showcases; mid-ring stations host their arbitration fairs where captains learn the price of knowing too much.',
    worldgenBrief:
      'Playable corporate spies; compound tech; mid-ring trade hubs. Factions: info cartels, patent courts. Diplomacy: manipulative, legalistic. Ships: pan-tech demonstrators, luxury haulers. Taboos: unpaid license fees, open-source limbs. Missions: industrial espionage, tariff wars, sponsored escorts. Contrast with human majors on law vs leverage.',
    techArchetype: 'compound',
    preferredHabitat: 'mid'
  }
];

# Void Runner — A pilot’s primer

You are a small ship in a wide galaxy: ports scattered across the map, factions that remember how you treat them, and work for anyone who posts it on a board. **Void Runner** is about momentum as much as money—thrust builds speed, speed carries you past your turn, and the void does not care if you meant to stop in time. Learn to love your brakes as much as your burners, and you will live long enough to spend the credits.

---

## Starting out

Install dependencies once, run the dev server, and open the game in your browser (`npm install`, then `npm run dev`). Your progress is kept in the browser between sessions—treat that save as part of the machine you play on.

From the main menu, pick up an existing run or start fresh. Once you are in space, **Esc** pauses; the pause menu also offers a compact reminder of flight keys if you need it.

---

## Flying

There is no invisible hand slowing you down. Your ship **coasts**: fire the mains to build velocity, flip and burn to kill it, or lean on **auto-brakes**—one mode eases your straight-line speed, another settles your spin—so you can line up a dock or a shot without wrestling the drift forever.

**Gravity** matters. Big bodies pull; skim too close and your orbit becomes someone else’s problem. The **edges of a sector** are doorways: cross the boundary and you slip into the next piece of the sky, still moving, still you.

**Land** when the station or world invites you in: get close, get gentle, then confirm. Rush the pad and you will circle while the computer waits for a sane approach.

---

## Ports and life between stars

When you touch down, you are inside that port’s world—tabs for what they actually offer. **Overview** and **reputation** tell you who runs the place and how they feel about you. **Supplies** and **repair** are where you patch holes and fill tanks when the last job went loud. **Equipment** and the **shipyard** are how you grow: new guns, tougher skin, a bigger hold, or an entirely new hull when your ambitions outgrow your frame.

Prices breathe with **standing**. Friends pay less friction; enemies may still take your money, but they will make you feel it. Keep an eye on the reputation tab when you are choosing sides.

---

## Missions — the freelance loop

Most of the honest work on the board is **hauling**: someone wants goods moved from here to there, and they will pay **credits** when the crate arrives. Read the blurb, note the **destination** name and sector, and decide if the **payoff** is worth the trip and the risk.

**Taking a job** needs **room in the hold**. The contract adds freight by weight; if you are already full from another run, or your hull is small, the board refuses with a blunt message until you deliver something or buy a bigger ship. Read each posting for **where** you are going and **what** you earn—payoff scales with distance and the size of the haul.

Once you accept, that cargo is **yours to protect**. It sits in your hold alongside any other runs you have stacked. Fly to the **correct port**—the one named on the contract—and **land** there. Handover happens when you are on the ground at the right place: pay and **reputation** with the right factions land in your account, and that cargo line leaves your manifest. You do not need to hunt a special “deliver” button; showing up docked at the destination is the finish line.

While you are in space, **M** opens your **active missions** strip so you can remind yourself where you are meant to go without opening the full station UI. Stack a few deliveries if you like, but remember every tonne is inertia and vulnerability until it is delivered.

If you change your mind, the same **missions** tab usually offers a way to **cancel** an active run—dropping the job clears that cargo from your hold so you are not dragging dead weight you no longer want paid for.

---

## Fights and the long way home

Space is not empty. **Pirates**, patrols, and grudges all show up as blips and laser traces. Your ship is built in **layers**: something absorbs the first hits, then plates, then the hull itself. When the outer layer fails, the inner ones need time or a dock to come back. Energy feeds your shields and your appetite for weapons—run your tanks dry in a furball and you will notice the ship going quiet in the wrong places.

**Tab** cycles who you are trying to kill or avoid; separate keys fire **different weapon banks** so you can mix ranges and timings. The little radar and target readout are your friends when the sky fills with intent.

Some sectors **glow wrong**—radiation chews at you if you linger. Treat those routes like weather: plan fuel, plan repair, or plan a faster path on the map.

---

## The map and hyperspace

The galaxy is a grid of sectors you learn like neighbourhoods. In flight, **K** opens the **galaxy map**; **Esc** or **K** closes it. Move the **cursor** with the arrow keys (or click a cell), press **Enter** to **save a hyperspace target** for your run, and **Backspace** to clear it. If your hull carries a **`hyperspaceDrive`**, the map also **tints** every sector within **one hop’s Euclidean range** of where you are now and draws a **dashed ring** at that range so you can read reach at a glance.

Back in space, with a target set, a **warning chevron** sits on the **edge of the screen** in the direction you need to point the ship—think of it as a runway beacon. To actually **jump** (**J**), you need a drive installed, enough **fuel** for that drive’s per-jump cost, the **cooldown** timer clear, speed **below the landing threshold**, and your **nose lined up** with the hop vector. When everything lines up, a pulsing **`[ J ] HYPER JUMP`** strip appears, similar to the landing prompt. The moment you commit, the game **snaps your heading** onto the jump line and **kills drift and spin** before the streak-and-flash animation runs.

Each jump moves you **at most one hop** along the straight line toward the target: if the destination is farther than your **`jumpRange`**, you land partway and can chain another hop after cooldown. If it is closer, you land on that sector. No drive fitted means no jump—fit one in **equipment** or pick a hull loadout that includes one.

Clear the map target with **Backspace** on the map when you want to wander without the beacon nagging you.

---

## When the hull stops being a suggestion

If your ship is destroyed, **insurance** catches you before the story ends. One path buys your old life back at a stiff fee—you wake in a familiar port, same ship idea, bills paid in blood and credits. The other path pays you out in cash and drops you into a **modest replacement hull** so you are still flying, just humbler, often dropped at a port that will still talk to you.

Neither choice is “free,” but both keep the campaign moving.

---

## Keys, for when memory fails

**Flight:** arrow keys thrust and turn; **Q** and **E** toggle the two auto-brake styles; **L** lands when the prompt allows; **Z X C V B** fire weapon groups; **Tab** cycles ship targets; **G** cycles ports you might dock at; **M** toggles the active mission reminder; **K** opens the galaxy map; **J** hyperspace-jumps only when the HUD shows you are slow enough, aligned to the beacon, and the orange **J** prompt is up; **Esc** pauses.

**Map:** move the cursor with arrows, set your hyperspace target with **Enter**, clear it with **Backspace**, leave with **Esc** or **K**.

**Docked:** **Tab** walks the station’s tabs; **T** launches back into space.

That is enough to fly, work, and grow. The rest—the first time you barely slide into a dock, the first payout that buys a real gun, the first faction that smiles when you land—is yours to discover.
 
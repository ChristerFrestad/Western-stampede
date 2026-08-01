# Western Stampede — Game Rules

Original western-themed ways slot. All mechanics, art direction, and branding are original to this project.

## How wins work (ways)

1. Symbols pay **left to right** on **adjacent** reels (starting from reel 1).
2. You need **3 or more** matching pay symbols in a row of reels.
3. Multiple matching symbols on the same reel create **multiple ways** (ways product).
4. Each pay-symbol type is evaluated separately; **all combination pays are added** for the spin total.
5. Only the highest count for a symbol path is used (3 / 4 / 5 of a kind table).

### Wilds

- Wild substitutes for all pay symbols **except** scatters / supercoin.
- When a wild helps a win it may apply a **×2 or ×3** multiplier (shown on the reels).
- Free-game wilds use the white “feature wild” art but the same rules.

### Reading a win on screen

After reels stop, each paying combination is animated with an explainer such as:

`LONGHORN ×5 · 12 ways L→R · +1,240 · wild ×2`

If several combinations hit, they play in sequence, then a **combo total** celebration.

## Grid

- Base: **5 reels**, heights **4-6-6-6-4** → **3,456 ways**
- Stampede: **4-10-10-10-4** → **16,000 ways**

## Symbols

| Symbol | Role |
| --- | --- |
| 9–A | Low pays |
| Eagle, Coyote, Wolf, Stag | High animals |
| Longhorn | Premium |
| Wild | Substitute + mult |
| Scatter | Free games |
| Supercoin | Scatter + free-game wheel |

## Free games

| Scatters (base) | Free games |
| --- | --- |
| 3 | 8 |
| 4 | 15 |
| 5 | 20 |

Retrigger during free games:

| Scatters | Extra |
| --- | --- |
| 2 | 5 |
| 3 | 8 |
| 4 | 15 |
| 5 | 20 |

### Supercoin → Longhorn herd

During free games, **Supercoin** can land on **reel 1** (leftmost). That spins a presentation wheel:

1. Wheel lands on a value (e.g. 8 / 12 / 20).
2. That many **extra LONGHORN** symbols are **injected into the free-game strips** for the rest of the feature (capped in math config).
3. The client shows a **Longhorn herd** meter (total injected) and how many Longhorns are **on the reels this spin**.

Injected Longhorns are not a one-spin bonus — they permanently enrich the free-game reels until free games end. Higher herd ⇒ more Longhorns appear on subsequent free spins.

Buy tiers **enhanced** / **premium** start with a Supercoin inject before the first free spin.

### Stampede

Random expand of middle reels to **16,000 ways** with a guaranteed **Longhorn on every reel** (five-of-a-kind path).

## Buy bonus

Same free-game math as natural scatters.

| Tier | Cost | Free games | Extras |
| --- | --- | --- | --- |
| standard | 22× bet | 8 | — |
| enhanced | 80× bet | 15 | Supercoin on entry |
| premium | 145× bet | 20 | Supercoin + stampede boost |

## Win celebrations (× total bet on that spin)

| Tier | Threshold | Presentation |
| --- | --- | --- |
| (count-up) | any win &gt; 0 | Every combo animates; meter races |
| **BIG WIN** | ≥ **15×** bet | Full banner |
| **MEGA WIN** | ≥ **40×** bet | Full banner |
| **SUPER WIN** | ≥ **80×** bet | Full banner |

**Skip:** Press **Space** or **click** the screen during a celebration to advance **one step**:

1. Finish reel combo cycle → count-up  
2. Finish count-up → first earned banner (if any)  
3. Each further press advances BIG → MEGA → SUPER (only tiers you earned)  
4. After the last tier banner (or after count-up if no tier) → **YOU WON** total for the spin  
5. Press again on the total → back to the game  

Outcomes are never changed by skip — only the animation phase.

## Demo only

Balances are demo credits. Not real-money gambling. All outcomes are decided on the server.

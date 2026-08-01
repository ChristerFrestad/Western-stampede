# Bonus buy & free games — E2E contract

Server is authoritative. Client only renders `SpinResult`.

## Natural free games

1. Base spin debits `bet`.
2. 3/4/5 scatters → award 8/15/20 free games (`enteredFreeGames`).
3. Trigger spin pays base wins; free spins start on the **next** request.
4. Free spins debit `0`, pay with locked `sessionBet`.
5. Retrigger: 2/3/4/5 scatters → +5/8/15/20.
6. Same paytable as base (`evaluateWays`).

## Buy bonus

| Tier | Cost | Free games | Extras |
| --- | --- | --- | --- |
| standard | 22× bet | 8 | — |
| enhanced | 80× | 15 | Supercoin on entry (before first free strip) |
| premium | 145× | 20 | Supercoin on entry + stampede boost |

1. Debit `floor(bet * costX)` once.
2. Create free session with `sessionBet = bet`.
3. Enhanced/premium: roll Supercoin **before** first free grid.
4. Immediately play first free spin in the same response (`buyEntered`).
5. Remaining free spins continue with debit 0 until session ends.

## Balance policy

- Buy uses the **same free-game strips and paytable** as natural.
- Higher tiers add EV via Supercoin / stampede boost → higher `costX`.
- Tune costs with `pnpm math:sim:buy [sessions]`.

## Client ceremony

1. Buy: intro splash → Supercoin wheel (if any) → reel spin → feature HUD.
2. Natural: trigger reels → free intro → free loop → free-end with feature total.
3. Feature win meter sums free/buy spin wins only (not natural trigger base spin).

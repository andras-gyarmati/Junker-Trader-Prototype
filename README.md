# Used-Car Trading Prototype

Very crude browser prototype for validating this loop:

browse junk car listings -> negotiate -> buy with incomplete info -> inspect hidden faults -> repair under budget -> sell -> repeat.

## Run

1. Open `/Users/andrasgyarmati/repos/used-car-trading-proto/index.html` in a browser.
2. Play 5-10 in-game days (default run length is 8 days).

No build tools, backend, or persistence.

## Tweak Values

Main balancing values are at the top of:

- `/Users/andrasgyarmati/repos/used-car-trading-proto/game.js`

Look at:

- `CONFIG` (money, day count, negotiation chances, sell behavior)
- `FAULTS` (repair cost, value hit, sale penalty)
- `BUYER_TYPES` (buyer personalities)
- `SELLER_PERSONALITIES`
- `CAR_NAMES`

## Simplifications

- One active car at a time.
- One sell simulation click, not a full market simulation over time.
- Hidden faults are revealed only via the single `Inspect` action.
- Daily events are lightweight random modifiers.
- No save/load, no backend, no advanced UI.

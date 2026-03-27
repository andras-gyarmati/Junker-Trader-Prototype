# Used-Car Trading Prototype

Crude browser prototype for validating this loop:

browse junk car listings -> negotiate -> buy with incomplete info -> inspect hidden faults -> repair under budget -> sell to targeted buyer -> repeat.

## Run

1. Open `/Users/andrasgyarmati/repos/used-car-trading-proto/index.html` in a browser.
2. Play 5-10 in-game days (default run length is 10 days).

No build tools, backend, or persistence.

## What Changed For Strategy

- No direct market value in listings.
- Listings show a `Notebook estimate` learned only from your own past sale outcomes.
- Buyer queue preview shows current + next buyers, so inventory planning matters.
- Daily buyer demand varies (1-4 buyers/day with event modifiers), so you can sell multiple cars in one day.
- You can buy and hold multiple cars in inventory.
- Selling has pricing modes (`quick`, `fair`, `premium`) with buyer-dependent outcomes.
- Daily event is shown clearly in top bar and buyer forecast card.
- Added run graphs for money, total spent, and total revenue.
- Added completed deal stats per car (buy day, sell day, invested, sale price, deal P/L, ROI).
- Cars now show internal work logs (inspection/repair/clean/sell attempts).
- Fault repair "value gain if fixed" is now learned from sold-car outcomes (blended with fallback defaults).
- Run data is continuously persisted after each user action.
- Data is written automatically to origin-private files (OPFS) with no picker:
  `junker-trader-log-<timestamp>.json` and `junker-trader-log-<timestamp>-actions.ndjson`.
- UI shows clickable "Log Files" links for the latest JSON and NDJSON snapshots.
- Fallback is `localStorage` key `junker_trader_latest_run`.

## Tweak Values

Main balancing values are at the top of:

- `/Users/andrasgyarmati/repos/used-car-trading-proto/game.js`

Look at:

- `CONFIG` (economy, day count, pricing multipliers, buyer preview, graph pacing)
- `FAULTS` (repair cost, value hit, sale penalty)
- `BUYER_TYPES` (buyer behavior and profile)
- `SELLER_PERSONALITIES`
- `CAR_NAMES`

## Simplifications

- One buyer interaction per day (sell attempt consumes that day's buyer).
- Sale chance is a simple probabilistic model, not a full listing simulation.
- Notebook estimate is a lightweight similarity range model from prior sales and narrows over time.
- Hidden faults are only revealed after inspection.
- `Mechanic Strike` blocks engine/transmission/tire repairs for that day.
- `Revenue` is sell income only; cash impact is visible via `Money` and `Balance Delta`.
- No persistence, no backend, no advanced UI.

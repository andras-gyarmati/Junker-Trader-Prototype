# Junker Road Trip Prototype

Crude browser prototype for validating this run loop:

arrive at city -> browse junkers -> negotiate/buy -> inspect/repair -> choose next city -> travel -> resolve wear/breakdown/event -> repeat.

## Run

1. Open `index.html` in a browser.
2. Start in a random city and try to reach as many cities as possible before the run collapses.

No build tools, backend, or external services.

## New Run Structure

- You now play a **road-trip run**, not a pure day-based flipping sim.
- Core tracked state:
  - current city
  - cities reached
  - current road car
  - cash/spent/revenue
  - route history
- Run ends when:
  - you hit the city cap (`CONFIG.maxCities`),
  - you collapse (no usable/affordable recovery path),
  - or you abandon.

## Travel System

- Use **Travel Planner** to pick 2-3 next-city options.
- You can only travel with **one** car. Before driving, choose a travel car and sell/abandon all other inventory cars.
- Each option has:
  - distance
  - road risk
  - local city modifiers (car prices, repair costs, buyer richness)
- Travel applies:
  - fuel cost
  - durability wear
  - chance of new/revealed faults
  - breakdown chance
  - random road events

## Breakdown / Road Events

Breakdown events give high-pressure decisions:

- emergency repair
- limp attempt
- roadside sale
- abandon + taxi

Other road events include flat tire, overheating, cheap mechanic, tow scam, fuel spike, and hidden fault reveal.

## Existing Systems Kept (Reframed)

- Car generation with visible + hidden faults
- Negotiation and seller personalities
- Inspection and repair
- Buyer-type selling loop
- Economy tracking and graphs
- Action logging and run export files

Repairs now also support **travel survival** (durability/reliability), not just sale outcomes.

## Tweak Values

Main balancing knobs are in:

- `js/config.js`

Focus on:

- `CONFIG.maxCities`
- `CONFIG.travel.*`
- `CITY_POOL` city modifiers
- `FAULTS`
- `CONFIG.negotiation`
- `CONFIG.selling`

## Simplifications

- City graph is lightweight random choices, not a real map.
- Travel/breakdown is intentionally gamey (not realistic vehicle simulation).
- Buyers are still queue-based and local.
- No save/load UI, no backend, no polish pass.

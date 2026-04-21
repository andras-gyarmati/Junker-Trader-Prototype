# Junker Prototype Hub

This repository now hosts multiple browser prototypes under one GitHub Pages entrypoint.

## Live Structure

- `index.html`: prototype hub page
- `prototypes/roadtrip-trader/`: current used-car + Europe road trip prototype
- `prototypes/classic-trader/`: pre-travel used-car trader prototype (legacy loop)
- `prototypes/backpack-hitchhike/`: new simple backpack/public transport concept

## Run Locally

1. Open [index.html](/Users/andrasgyarmati/repos/used-car-trading-proto/index.html) in a browser.
2. Pick a prototype from the hub.

No build tooling, backend, or persistence service is required.

## GitHub Pages

Set Pages source to branch `main`, folder `/(root)`.
The root page acts as a hub and links to each prototype subpage.

## Why this structure

- Keeps each prototype isolated so changes don’t break others.
- Makes it fast to spin up new prototype folders without touching unrelated systems.
- Reduces context/token waste for agents by narrowing work to one subfolder.

## Unity branch policy

Unity prototype work stays on a separate branch and is ignored on `main`.

`unity/` is gitignored in this branch to avoid committing generated Unity assets and caches.

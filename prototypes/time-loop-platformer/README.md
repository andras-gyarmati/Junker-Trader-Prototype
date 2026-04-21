# Time-Loop Echo Platformer Prototype

Tiny one-room prototype for validating a **shared two-character timeline** with hold-to-rewind and branching overwrite.

## Run

Open [index.html](/Users/andrasgyarmati/repos/used-car-trading-proto/prototypes/time-loop-platformer/index.html) in a browser.

## Core Model Implemented

- Two characters are always in the world:
  - Thrower
  - Rope
- You control one character at a time and can switch anytime (`Q`/`Tab`).
- Both characters continuously record/replay on a shared frame timeline.
- Hold `R`: world rewinds backward frame-by-frame (no new interactions triggered).
- Release `R`: active character track is truncated at that frame and rewrites from there.
- Non-active character keeps prior recording and replays until it runs out, then records idle frames.

## Abilities

- Thrower: `E` opens a short throw window. If overlapping rope character, rope character gets launch velocity.
- Rope: `E` near anchor places rope; `E` while overlapping rope instantly climbs to rope top.

## Win Rule

Both characters must be in the exit zone at the same timeline state.

## Data Layout

- Fixed-step simulation (`60 Hz`).
- Per-character input tracks in `Uint8Array` bitmasks (`left/right/jump/use`).
- Dynamic capacity doubling for tracks and frame snapshots.
- Frame snapshots stored in typed arrays for rewind playback and instant state load on branch points.

## Tweak Points

Edit [app.js](/Users/andrasgyarmati/repos/used-car-trading-proto/prototypes/time-loop-platformer/app.js):

- `LEVEL` layout, anchors, exit.
- `PHYS` jump/gravity feel.
- `THROW` boost timings and force.

# Time-Loop Echo Platformer Prototype

Tiny one-room prototype for validating a **shared two-character timeline** with one-tap 1-second rewind and branching overwrite.

## Run

Open [index.html](/Users/andrasgyarmati/repos/used-car-trading-proto/prototypes/time-loop-platformer/index.html) in a browser.

## Core Model Implemented

- Two characters are always in the world:
  - Thrower
  - Rope
- You control one character at a time and can switch anytime (`Q`/`Tab`).
- Both characters continuously record/replay on a shared frame timeline.
- Tap `R`: instant rewind 1 second (60 frames), then immediate branch.
- Hold `R`: visual rewind playback frame-by-frame.
- Release `R`: active character track is truncated at that frame and rewrites from there.
- Non-active character keeps prior recording and replays until it runs out, then records idle frames.

## Abilities

- Thrower: `E` starts a short charge-up, then triggers a brief throw pulse. If overlapping rope character at pulse time, rope character gets pure upward launch velocity (no horizontal boost).
- Rope: `E` near anchor places rope; touching rope instantly climbs to rope top.

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

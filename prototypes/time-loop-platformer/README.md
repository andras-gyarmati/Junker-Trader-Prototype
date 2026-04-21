# Time-Loop Echo Platformer Prototype

Tiny one-room browser prototype for validating the rewind + echo stack mechanic.

## Run

Open [index.html](/Users/andrasgyarmati/repos/used-car-trading-proto/prototypes/time-loop-platformer/index.html) in a browser.

## Core Loop

1. Play a run as one character.
2. Press `R` to rewind and commit that run.
3. Previous run replays as an echo.
4. Play next character while echoes replay.
5. Stack runs and solve the traversal puzzle.

## Data / Replay Model

- Fixed timestep simulation (`60 Hz`).
- Each run stores compact per-frame input bitmasks in a `Uint8Array` (grown by doubling when needed).
- On rewind, world resets to canonical state and replay runs start from frame 0.
- Echoes are deterministic because they are driven by recorded inputs through the same simulation code as the active run.

## Tweak Points

Edit [app.js](/Users/andrasgyarmati/repos/used-car-trading-proto/prototypes/time-loop-platformer/app.js):

- `LEVEL`: room layout, rope anchor, exit.
- `CHARACTERS`: movement/jump tuning.
- `PHYSICS`: gravity and jump buffering.
- `THROW_*` constants.

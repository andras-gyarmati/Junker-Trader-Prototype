# Junker Trader 3D Unity Prototype

Crude Unity port of the browser prototype for fast gameplay-loop validation.

## Target Unity
- Unity 6.4 line (project version file set to `6000.4.1f1`)

## How to run
1. Open Unity Hub.
2. Add project folder: `unity/JunkerTrader3D`.
3. Open in Unity 6000.4.x.
4. Open `Assets/Scenes/Main.unity`.
5. Press Play.

## What is implemented
- 3D zones (market lot, garage bay, sales desk) built from primitives
- Clickable market cars in-world (raycast interaction)
- Market generation (3-5 cars/day)
- Visible + hidden fault system
- Negotiation (lowball/fair/asking/custom slider)
- Inspection + repair + one-time cleaning
- Sale simulation with buyer types
- Accept/reject + counteroffer flow
- Junkyard fallback sale
- Day/event/economy loop (10-day run)
- Full event log and recent deal list

## Controls
- Left click: select market cars
- `WASD`: move camera
- Hold right mouse: orbit camera
- Mouse wheel: zoom

## Intentionally simplified
- Uses compact IMGUI side HUD for actions
- No save/load
- Scene is authored but still primitive-only (no polished prefabs)
- No animation polish / no production architecture

## Script Structure
- `Assets/Scripts/JunkerTraderGame.cs`: core state + economy/negotiation/repair/sale logic
- `Assets/Scripts/JunkerTraderGame.Presentation.cs`: world interaction, camera, compact HUD
- `Assets/Editor/SceneBuilder.cs`: editor utility to regenerate `Main.unity` if needed (`Tools/Junker Trader/Create Main Scene`)

## Fast balancing knobs
Top constants in `Assets/Scripts/JunkerTraderGame.cs`:
- `StartMoney`, `MaxDays`
- `InspectCost`, `CosmeticCleanCost`, `SellAttemptFee`
- `LowballRatio`, `FairRatio`
- `QuickSellMult`, `FairSellMult`, `PremiumSellMult`

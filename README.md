# Dungeon Run

A browser-based 3D dungeon crawler built with Three.js.

## Features
- Room-and-corridor dungeon with a key, sealed gate, chests, pickups, minimap, and boss clear condition.
- Reliable wall collision and top-down mouse aiming.
- Sword and gun combat with visible weapon models, swing effects, muzzle flashes, bullet traces, enemy melee/ranged behavior, projectiles, knockback, and health bars.
- Player leveling, stamina, dodge, potions, gold, ammo, and restartable win/loss flow.

## Controls
- WASD: move
- Mouse: aim
- Left mouse: attack
- Shift: sprint
- Space: dodge
- 1 / 2 or mouse wheel: switch sword/gun
- R: reload gun
- Q: use potion
- Right mouse drag, Z/X, or arrow left/right: rotate the camera 360 degrees

## Run
Because this uses ES module imports from a CDN, run via a local web server:

```bash
python -m http.server 8000
```

Then open:

- http://127.0.0.1:8000/

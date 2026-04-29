# Dungeon Browser 3D Prototype

A simple 3D dungeon game prototype that runs in the browser using Three.js.

## Features
- Third-person 3D movement with keyboard + mouse.
- Sword and gun weapons with damage and gun ammo/reload.
- Goblin enemies with line-of-sight based chase and attack AI.
- HP bars for player and enemies.
- Small explorable dungeon map with multiple rooms/corridors.
- RNG loot drops on enemy death (gold, ammo, upgrades).
- XP/level progression and boss-based win condition.
- Checkpoint respawn system.

## Run
Because this uses ES module imports from a CDN, run via a local web server:

```bash
python3 -m http.server 8000
```

Then open:

- http://localhost:8000

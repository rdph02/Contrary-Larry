# Contrary Larry vs Nikita the Russian Spy — 6.0

Larry refuses to cooperate. Nikita, a Russian spy-master, has sent his agents.

A top-down wave-survival arena shooter. Endless waves, one life, a leaderboard.

## Play

Serve the folder and open it in a browser:

```
python3 -m http.server 8000
# → http://localhost:8000
```

(Opening `index.html` directly also works.)

## Controls

| Input | Action |
|---|---|
| WASD / arrows | Move |
| Mouse | Aim |
| Hold click | Fire (staff: hold to charge, release to blast; sword: swing) |
| Space | Dash / Focus / Virus zone (depends on your build) |
| P / Escape | Pause |
| M | Mute |

## The run

- **Waves** spawn from the arena edges; clear them to pick 1 of 4 upgrades.
- **7 upgrade trees** (STUBBORNNESS, DEFIANCE, CHAOS, CONTRARIAN, REANIMATION, SABOTAGE, BERSERKER), each with two mutually exclusive branches. 4 picks in one tree **specializes** you — locking the others and triggering that tree's **awakening**: a signature mechanic like the Necromancer's Staff, the Berserker's blade, Deadeye bullet-time, or the Phantom's decoys.
- **Wave 10**: choose a weapon. **Wave 20**: evolve it. Nikita drops **weapon caches** for mid-run swaps.
- **Bosses** every 5 waves (Vlad the Wall, the Twins, Handler Prime) and **Nikita** himself every 10 — multi-phase, and he mutates each time he returns.
- **Elites**, mid-wave **events** (supply drops, blackouts, assassins) and rotating **stages** with hazards (freight trains, gas vents, searchlights, wind) keep the later waves honest. Past wave 15 the scaling compounds — survival is not expected.

## Code layout

```
index.html        markup + menus
styles.css
js/data.js        content tables: weapons, evolutions, upgrades, enemies, elites, stages, awakenings
js/audio.js       WebAudio-synthesized SFX + procedural music (no asset files)
js/engine.js      fixed-timestep loop, game state, input, spawn director, reset
js/systems.js     player/bullets/enemies/bosses/minions/sword/staff/hazards
js/render.js      canvas drawing, sprite preloader with procedural fallbacks
js/ui.js          HUD, upgrade/weapon/evolution menus, leaderboard
spritesheets/     pixel art (LibreSprite sources alongside PNGs)
```

Debug mode: open with `?debug=1` — `G` god mode, `K` kill all, `N` skip wave, `U` upgrade menu, `1`–`7` grant next pick in that tree.

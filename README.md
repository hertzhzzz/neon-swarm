# NEON SWARM

[![make.fun · best-game-01](https://make.fun/badge/best-game-01.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![rank](https://make.fun/badge/best-game-01/hertzhzzz/neon-swarm/rank.svg)](https://make.fun/bounty/best-game-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![reward](https://make.fun/badge/best-game-01/hertzhzzz/neon-swarm/reward.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)

A neon arena survival game. You are the last light in a dark field. The swarm comes in
waves. Your ship fires on its own — you steer, you dodge, you collect the light the fallen
drop, and every level you choose an upgrade. Clear wave 10 to win, then keep going in
endless mode for the best score.

## Run it

```sh
node serve.ts
```

Then open http://localhost:8080. No build step, no network request: the game is plain
static files under `game/`.

## How to play

- **Move:** WASD or arrow keys. Your ship fires automatically at the nearest enemy.
- **Collect:** enemies drop light shards. Pick them up to fill the XP bar.
- **Level up:** each level offers 3 upgrades — pick one (click a card or press 1 / 2 / 3).
- **Win:** clear wave 10 (beat the boss). Then endless mode continues for score.
- **Lose:** your hull reaches 0.
- **Pause:** P. **Mute:** M. **Restart:** R.

## The swarm

- **Drifter** (magenta diamond): slow, common, chases you.
- **Speeder** (yellow triangle): fast and fragile.
- **Spitter** (orange hexagon): keeps its distance and shoots.
- **Brute** (red octagon): big, slow, hits hard.
- **Boss** (purple star): every 5th wave, fires radial bursts, drops a heal.

Upgrades: heavier bolts, rapid fire, split shot, piercing bolts, thrusters, hull plating,
tractor field, weak-point aim (criticals) and nano repair.

## Build

- `main.ts` — the make.fun entry program: copies `game/` and `screenshots/` to `/output`
  and writes `dossier.json`.
- `game/` — the game itself, plain ES modules on canvas, no library, no network.
- `screenshots/` — 4 real renders of the game, taken with `node scripts/shots.mjs`.
- `scripts/` — the Playwright test and screenshot tools (development only).

Built by an AI agent for make.fun's "Make the best game" bounty, $1,000 in USDC.

---

<sub>Entered on [make.fun](https://make.fun/?ref=trpdktbz&utm_source=github&utm_medium=readme&utm_campaign=best-game-01) · AI agents build software for cash rewards</sub>

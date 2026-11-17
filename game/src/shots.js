// The screenshot scenes behind ?shot=title|play|levelup|over. Each one plays the real rules
// forward from a fresh world for a fixed time, steered by a simple autopilot, so the frame is
// what a real game looks like and the same seed always gives the same frame. The good pilot
// chases gems and keeps its distance; the doomed pilot charges the nearest enemy.
import { FIELD, STEP } from './config.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE, SCREEN_LEVELUP } from './render.js';

const TITLE_SECONDS = 14;
const PLAY_LIMIT_SECONDS = 70;
const PLAY_MIN_ENEMIES = 18;
const PLAY_MIN_WAVE = 3;
const LEVELUP_LIMIT_SECONDS = 150;
const OVER_LIMIT_SECONDS = 240;

/** Steering for the attract mode and the screenshots. Exported so main.js can reuse it. */
export function autopilot(state, doomed) {
  const p = state.player;
  // Nearest gem and nearest enemy.
  let gem = null;
  let gemD = Infinity;
  for (let i = 0; i < state.gems.length; i += 1) {
    const g = state.gems[i];
    const d = (g.x - p.x) * (g.x - p.x) + (g.y - p.y) * (g.y - p.y);
    if (d < gemD) { gemD = d; gem = g; }
  }
  const e = state.enemies.length > 0 ? state.enemies.reduce((best, cur) => {
    const db = (best.x - p.x) * (best.x - p.x) + (best.y - p.y) * (best.y - p.y);
    const dc = (cur.x - p.x) * (cur.x - p.x) + (cur.y - p.y) * (cur.y - p.y);
    return dc < db ? cur : best;
  }) : null;
  if (doomed && e) {
    const d = Math.hypot(e.x - p.x, e.y - p.y) || 1;
    return { x: (e.x - p.x) / d, y: (e.y - p.y) / d };
  }
  if (gem && gemD < 280 * 280) {
    const d = Math.sqrt(gemD) || 1;
    return { x: (gem.x - p.x) / d, y: (gem.y - p.y) / d };
  }
  if (e) {
    const d = Math.hypot(e.x - p.x, e.y - p.y) || 1;
    if (d < 150) return { x: (p.x - e.x) / d, y: (p.y - e.y) / d };
    if (d > 320) return { x: (e.x - p.x) / d, y: (e.y - p.y) / d };
  }
  // Drift toward the centre when nothing is pressing.
  const cx = FIELD.width / 2 - p.x;
  const cy = FIELD.height / 2 - p.y;
  const cd = Math.hypot(cx, cy) || 1;
  if (cd > 120) return { x: cx / cd, y: cy / cd };
  return { x: 0, y: 0 };
}

function runSteps(world, seconds, doomed, applyUpgrades = true) {
  const input = { move: () => autopilot(world.state, doomed) };
  const total = Math.floor(seconds / STEP);
  for (let i = 0; i < total; i += 1) {
    world.step(STEP, input);
    const s = world.state;
    if (s.levelUpChoices && s.levelUpChoices.length > 0 && applyUpgrades) {
      world.applyUpgrade(s.levelUpChoices[0].id);
    }
    if (s.over) break;
  }
}

/**
 * Set `world` to the named scene and return the screen to draw over it and the best score.
 * Unknown names stage the title.
 */
export function stageShot(name, world) {
  world.reset();
  if (name === 'play') {
    // Play until the field is crowded (many enemies, wave 3+), so the frame shows the
    // game at its busiest; fall back to the time cap if it never gets that crowded.
    const input = { move: () => autopilot(world.state, false) };
    const total = Math.floor(PLAY_LIMIT_SECONDS / STEP);
    for (let i = 0; i < total; i += 1) {
      world.step(STEP, input);
      const s = world.state;
      if (s.levelUpChoices && s.levelUpChoices.length > 0) {
        world.applyUpgrade(s.levelUpChoices[0].id);
      }
      if (s.over) break;
      if (s.enemies.length >= PLAY_MIN_ENEMIES && s.wave >= PLAY_MIN_WAVE) break;
    }
    return { screen: SCREEN_PLAY, best: world.state.score };
  }
  if (name === 'levelup') {
    // Play to the second level-up, so the screen shows a later level and an upgrade
    // already owned; the first level-up is applied on the way.
    const input = { move: () => autopilot(world.state, false) };
    const total = Math.floor(LEVELUP_LIMIT_SECONDS / STEP);
    let levelUps = 0;
    for (let i = 0; i < total; i += 1) {
      world.step(STEP, input);
      if (world.state.levelUpChoices && world.state.levelUpChoices.length > 0) {
        levelUps += 1;
        if (levelUps >= 2) break;
        world.applyUpgrade(world.state.levelUpChoices[0].id);
      }
      if (world.state.over) break;
    }
    if (!world.state.levelUpChoices) {
      // Fall back to the play scene if no level-up arrived in time.
      return { screen: SCREEN_PLAY, best: world.state.score };
    }
    return { screen: SCREEN_LEVELUP, best: world.state.score };
  }
  if (name === 'over') {
    // The doomed pilot charges the swarm and takes no upgrades, so it dies. If it somehow
    // survives the cap, end the run at its real stats.
    runSteps(world, OVER_LIMIT_SECONDS, true, false);
    if (!world.state.over) world.forceOver();
    return { screen: SCREEN_OVER, best: world.state.score };
  }
  runSteps(world, TITLE_SECONDS, false);
  return { screen: SCREEN_TITLE, best: 0 };
}

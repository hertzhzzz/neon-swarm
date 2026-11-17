// Every tuning number and colour in one place. The playfield is a fixed 1280x720 logical
// area; the renderer scales it to the window, so no rule below depends on the screen size.
export const FIELD = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

/** The wave the player must clear to win; after it, endless mode continues for score. */
export const WIN_WAVE = 10;

/** Seconds of quiet between one wave's end and the next wave's banner. */
export const BREATHER = 2.5;

export const PLAYER = {
  radius: 14,
  speed: 275,
  hp: 100,
  fireInterval: 0.42,
  boltSpeed: 580,
  boltDamage: 12,
  magnet: 100,
  invuln: 0.9,
  regen: 0,
  critChance: 0,
  pierce: 0,
  projectiles: 1,
};

export const BOLT = { radius: 5, life: 1.4 };

export const GEM = { radius: 6, magnetSpeed: 460, pickupRadius: 22 };

/** XP needed to go from `level` to `level + 1`. */
export function xpForLevel(level) {
  return 5 + (level - 1) * 4;
}

export const ENEMIES = {
  drifter: { radius: 13, hp: 18, speed: 74, damage: 8, xp: 1, score: 10, color: '#ff4fd8', shape: 'diamond', cost: 1 },
  speeder: { radius: 10, hp: 10, speed: 158, damage: 6, xp: 1, score: 15, color: '#ffe14d', shape: 'triangle', cost: 1 },
  spitter: { radius: 15, hp: 32, speed: 56, damage: 10, xp: 2, score: 25, color: '#ff9a3d', shape: 'hex', cost: 2, ranged: true, shotInterval: 2.4, shotSpeed: 175, shotDamage: 8 },
  brute: { radius: 22, hp: 95, speed: 44, damage: 18, xp: 4, score: 40, color: '#ff4d5e', shape: 'oct', cost: 3 },
  boss: { radius: 44, hp: 680, speed: 48, damage: 25, xp: 20, score: 500, color: '#b44dff', shape: 'star', cost: 10, ranged: true, shotInterval: 1.6, shotSpeed: 200, shotDamage: 12, burst: 8 },
};

/** Spawn budget (in cost points) for a wave, and which kinds may appear in it. */
export function wavePlan(wave) {
  const budget = 10 + wave * 8;
  const kinds = ['drifter'];
  if (wave >= 2) kinds.push('speeder');
  if (wave >= 3) kinds.push('spitter');
  if (wave >= 4) kinds.push('brute');
  return { budget, kinds, boss: wave % 5 === 0 };
}

/** Enemy hp grows 8% a wave; speed grows 2% a wave, capped at +40%. */
export function waveScale(wave) {
  return { hp: 1 + 0.08 * (wave - 1), speed: Math.min(1 + 0.02 * (wave - 1), 1.4) };
}

/** Seconds between spawn ticks inside a wave; faster waves spawn faster. */
export function spawnInterval(wave) {
  return Math.max(0.35 - wave * 0.03, 0.06);
}

/** Enemies per spawn tick: packs grow with the wave, so the field gets crowded. */
export function packSize(wave) {
  return 1 + Math.floor(wave / 3);
}

/** Upgrade choices offered on level-up. `max` is how many times it can be taken. */
export const UPGRADES = [
  { id: 'damage', name: 'Heavy Bolts', desc: '+25% bolt damage', max: 5 },
  { id: 'rapid', name: 'Rapid Fire', desc: '+20% fire rate', max: 5 },
  { id: 'split', name: 'Split Shot', desc: '+1 bolt per volley', max: 3 },
  { id: 'pierce', name: 'Piercing Bolts', desc: 'Bolts pass through +1 enemy', max: 2 },
  { id: 'speed', name: 'Ion Thrusters', desc: '+12% move speed', max: 4 },
  { id: 'vitality', name: 'Hull Plating', desc: '+25 max HP and heal 25', max: 4 },
  { id: 'magnet', name: 'Tractor Field', desc: '+45% pickup radius', max: 3 },
  { id: 'crit', name: 'Weak-Point Aim', desc: '+10% critical chance (2x damage)', max: 3 },
  { id: 'regen', name: 'Nano Repair', desc: 'Regenerate +0.8 HP per second', max: 3 },
];

export const PALETTE = {
  backdrop: '#070a18',
  grid: '#121832',
  vignette: 'rgba(4, 6, 16, 0.55)',
  player: '#4df3ff',
  playerCore: '#e8feff',
  bolt: '#bffbff',
  gem: '#7dff5e',
  gemCore: '#eaffdf',
  enemyShot: '#ffcf5e',
  panel: 'rgba(10, 14, 32, 0.82)',
  panelEdge: '#2b3a6b',
  text: '#eef1f5',
  muted: '#8b93a3',
  accent: '#4df3ff',
  danger: '#ff4d5e',
  gold: '#ffe14d',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the best score is kept between visits (this browser only). */
export const BEST_KEY = 'neon-swarm.best';

/** Caps that keep the frame budget safe. */
export const CAPS = { enemies: 130, bullets: 220, gems: 260, particles: 320, floaters: 40 };

// The game state and its rules: the player, the enemies, the waves, the XP and upgrades,
// the bullets and the collisions. The world advances in fixed steps; the renderer only
// paints what is here. No drawing and no sound in this file.
import {
  FIELD, STEP, WIN_WAVE, BREATHER, PLAYER, BOLT, GEM, CAPS,
  ENEMIES, UPGRADES, xpForLevel, wavePlan, waveScale, spawnInterval, packSize,
} from './config.js';

export const EVENT_SHOOT = 1;
export const EVENT_KILL = 2;
export const EVENT_BOSS_DIE = 4;
export const EVENT_XP = 8;
export const EVENT_HURT = 16;
export const EVENT_LEVELUP = 32;
export const EVENT_WAVE = 64;
export const EVENT_BOSS = 128;
export const EVENT_VICTORY = 256;
export const EVENT_OVER = 512;

let nextId = 1;

function dist2(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

export function createWorld(random) {
  const state = {
    time: 0,
    wave: 0,
    waveState: 'idle',
    waveTimer: 0,
    spawnQueue: [],
    spawnTimer: 0,
    boss: null,
    score: 0,
    kills: 0,
    victory: false,
    endless: false,
    over: false,
    shake: 0,
    banner: null,
    levelUpChoices: null,
    player: null,
    enemies: [],
    bullets: [],
    enemyShots: [],
    gems: [],
    particles: [],
    floaters: [],
  };

  function makePlayer() {
    return {
      x: FIELD.width / 2, y: FIELD.height / 2, angle: -Math.PI / 2,
      hp: PLAYER.hp, maxHp: PLAYER.hp, speed: PLAYER.speed,
      fireTimer: 0, invuln: 0, level: 1, xp: 0, xpNext: xpForLevel(1),
      magnet: PLAYER.magnet, damage: PLAYER.boltDamage,
      fireInterval: PLAYER.fireInterval, projectiles: PLAYER.projectiles,
      pierce: PLAYER.pierce, critChance: PLAYER.critChance, regen: PLAYER.regen,
      alive: true,
    };
  }

  function spawnEnemy(kind, x, y) {
    const def = ENEMIES[kind];
    const scale = waveScale(state.wave);
    const e = {
      id: nextId, kind,
      x, y, angle: 0,
      hp: Math.round(def.hp * scale.hp), maxHp: Math.round(def.hp * scale.hp),
      radius: def.radius, speed: def.speed * scale.speed,
      damage: def.damage, xp: def.xp, score: def.score,
      color: def.color, shape: def.shape,
      ranged: !!def.ranged, shotInterval: def.shotInterval || 0,
      shotSpeed: def.shotSpeed || 0, shotDamage: def.shotDamage || 0,
      burst: def.burst || 0, shotTimer: random.range(1, 2.5),
      flash: 0, wobble: random.range(0, Math.PI * 2),
    };
    nextId += 1;
    return e;
  }

  function edgePoint() {
    const p = state.player;
    for (let tries = 0; tries < 12; tries += 1) {
      const side = random.int(0, 3);
      let x = 0;
      let y = 0;
      if (side === 0) { x = random.range(30, FIELD.width - 30); y = 24; }
      if (side === 1) { x = random.range(30, FIELD.width - 30); y = FIELD.height - 24; }
      if (side === 2) { x = 24; y = random.range(30, FIELD.height - 30); }
      if (side === 3) { x = FIELD.width - 24; y = random.range(30, FIELD.height - 30); }
      if (dist2(x, y, p.x, p.y) > 240 * 240) return { x, y };
    }
    return { x: 40, y: 40 };
  }

  function buildWave(wave) {
    const plan = wavePlan(wave);
    const queue = [];
    let budget = plan.budget;
    if (plan.boss) {
      queue.push('boss');
      budget = Math.floor(budget * 0.5);
    }
    const kinds = plan.kinds;
    while (budget > 0) {
      const kind = random.pick(kinds);
      const cost = ENEMIES[kind].cost;
      if (cost > budget && kinds.length > 1) continue;
      queue.push(kind);
      budget -= cost;
    }
    // Shuffle so the wave does not arrive in kind order.
    for (let i = queue.length - 1; i > 0; i -= 1) {
      const j = random.int(0, i);
      const t = queue[i]; queue[i] = queue[j]; queue[j] = t;
    }
    return queue;
  }

  function startWave(wave) {
    state.wave = wave;
    state.spawnQueue = buildWave(wave);
    state.spawnTimer = 0.4;
    state.waveState = 'active';
    state.banner = { text: `WAVE ${wave}`, sub: wave % 5 === 0 ? 'A boss approaches' : '', timer: 1.6 };
    state.boss = null;
    return wave % 5 === 0 ? EVENT_BOSS : EVENT_WAVE;
  }

  function burst(x, y, color, n, speed, size) {
    for (let i = 0; i < n; i += 1) {
      if (state.particles.length >= CAPS.particles) return;
      const a = random.range(0, Math.PI * 2);
      const s = random.range(speed * 0.3, speed);
      state.particles.push({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: random.range(0.25, 0.6), maxLife: 0.6, size: random.range(size * 0.5, size), color,
      });
    }
  }

  function floater(x, y, text, color) {
    if (state.floaters.length >= CAPS.floaters) state.floaters.shift();
    state.floaters.push({ x, y, text, life: 0.8, color });
  }

  function dropGems(x, y, value) {
    for (let i = 0; i < value; i += 1) {
      if (state.gems.length >= CAPS.gems) return;
      const a = random.range(0, Math.PI * 2);
      state.gems.push({
        x, y, vx: Math.cos(a) * 90, vy: Math.sin(a) * 90,
        value: 1, radius: GEM.radius, bob: random.range(0, Math.PI * 2),
      });
    }
  }

  function killEnemy(e, events) {
    state.kills += 1;
    state.score += e.score;
    burst(e.x, e.y, e.color, e.kind === 'boss' ? 46 : 14, 260, 4);
    dropGems(e.x, e.y, e.xp);
    if (e.kind === 'boss') {
      state.boss = null;
      state.shake = Math.max(state.shake, 14);
      state.score += 100;
      // The boss drops a heal as well as XP.
      state.player.hp = Math.min(state.player.maxHp, state.player.hp + 20);
      return events | EVENT_BOSS_DIE;
    }
    return events | EVENT_KILL;
  }

  function rollChoices() {
    const taken = state.player.upgradesTaken;
    const avail = UPGRADES.filter((u) => (taken[u.id] || 0) < u.max);
    const picks = [];
    while (picks.length < 3 && avail.length > 0) {
      const i = random.int(0, avail.length - 1);
      picks.push(avail.splice(i, 1)[0]);
    }
    return picks;
  }

  function gainXp(amount, events) {
    const p = state.player;
    p.xp += amount;
    if (p.xp >= p.xpNext) {
      p.xp -= p.xpNext;
      p.level += 1;
      p.xpNext = xpForLevel(p.level);
      state.levelUpChoices = rollChoices();
      burst(p.x, p.y, '#4df3ff', 26, 300, 4);
      return events | EVENT_LEVELUP;
    }
    return events;
  }

  function nearestEnemy(x, y) {
    let best = null;
    let bestD = Infinity;
    for (let i = 0; i < state.enemies.length; i += 1) {
      const e = state.enemies[i];
      const d = dist2(x, y, e.x, e.y);
      if (d < bestD) { bestD = d; best = e; }
    }
    return best;
  }

  function fireVolley() {
    const p = state.player;
    const target = nearestEnemy(p.x, p.y);
    if (!target) return false;
    const base = Math.atan2(target.y - p.y, target.x - p.x);
    const n = p.projectiles;
    for (let i = 0; i < n; i += 1) {
      if (state.bullets.length >= CAPS.bullets) break;
      const spread = (i - (n - 1) / 2) * 0.14;
      const a = base + spread;
      const crit = random.next() < p.critChance;
      state.bullets.push({
        x: p.x + Math.cos(a) * (PLAYER.radius + 6),
        y: p.y + Math.sin(a) * (PLAYER.radius + 6),
        vx: Math.cos(a) * PLAYER.boltSpeed, vy: Math.sin(a) * PLAYER.boltSpeed,
        damage: p.damage * (crit ? 2 : 1), pierce: p.pierce,
        radius: BOLT.radius, life: BOLT.life, crit, hit: new Set(),
      });
    }
    p.angle = base;
    return true;
  }

  function hurtPlayer(damage, fromX, fromY) {
    const p = state.player;
    if (!p.alive || p.invuln > 0) return EVENT_SHOOT;
    p.hp -= damage;
    p.invuln = PLAYER.invuln;
    state.shake = Math.max(state.shake, 9);
    burst(p.x, p.y, '#ff4d5e', 16, 260, 4);
    floater(p.x, p.y - 24, `-${damage}`, '#ff4d5e');
    const dx = p.x - fromX;
    const dy = p.y - fromY;
    const d = Math.hypot(dx, dy) || 1;
    p.x = Math.min(FIELD.width - PLAYER.radius, Math.max(PLAYER.radius, p.x + (dx / d) * 26));
    p.y = Math.min(FIELD.height - PLAYER.radius, Math.max(PLAYER.radius, p.y + (dy / d) * 26));
    if (p.hp <= 0) {
      p.hp = 0;
      p.alive = false;
      state.over = true;
      burst(p.x, p.y, '#4df3ff', 60, 380, 5);
      state.shake = 18;
      return EVENT_OVER;
    }
    return EVENT_HURT;
  }

  function reset() {
    state.time = 0;
    state.wave = 0;
    state.waveState = 'idle';
    state.waveTimer = 0;
    state.spawnQueue = [];
    state.spawnTimer = 0;
    state.boss = null;
    state.score = 0;
    state.kills = 0;
    state.victory = false;
    state.endless = false;
    state.over = false;
    state.shake = 0;
    state.banner = null;
    state.levelUpChoices = null;
    state.player = makePlayer();
    state.player.upgradesTaken = {};
    state.enemies = [];
    state.bullets = [];
    state.enemyShots = [];
    state.gems = [];
    state.particles = [];
    state.floaters = [];
  }

  reset();

  function step(dt, input) {
    let events = 0;
    const p = state.player;
    if (!p.alive || state.over) return events;
    state.time += dt;

    // Wave flow: idle -> first wave; active -> breather -> next wave.
    if (state.waveState === 'idle') {
      events |= startWave(1);
    } else if (state.waveState === 'breather') {
      state.waveTimer -= dt;
      if (state.waveTimer <= 0) events |= startWave(state.wave + 1);
    } else if (state.waveState === 'active') {
      if (state.spawnQueue.length > 0) {
        state.spawnTimer -= dt;
        if (state.spawnTimer <= 0) {
          state.spawnTimer = spawnInterval(state.wave);
          const pack = packSize(state.wave);
          for (let k = 0; k < pack && state.spawnQueue.length > 0; k += 1) {
            const kind = state.spawnQueue.shift();
            const at = edgePoint();
            const e = spawnEnemy(kind, at.x, at.y);
            if (kind === 'boss') state.boss = e;
            if (state.enemies.length < CAPS.enemies) state.enemies.push(e);
          }
        }
      } else if (state.enemies.length === 0) {
        if (state.wave === WIN_WAVE && !state.endless && !state.victory) {
          state.victory = true;
          state.endless = true;
          state.score += 500;
          return events | EVENT_VICTORY;
        }
        state.waveState = 'breather';
        state.waveTimer = BREATHER;
        state.score += state.wave * 100;
      }
    }

    // Player movement and regeneration.
    const mv = input.move();
    p.x = Math.min(FIELD.width - PLAYER.radius, Math.max(PLAYER.radius, p.x + mv.x * p.speed * dt));
    p.y = Math.min(FIELD.height - PLAYER.radius, Math.max(PLAYER.radius, p.y + mv.y * p.speed * dt));
    if (mv.x !== 0 || mv.y !== 0) p.angle = Math.atan2(mv.y, mv.x);
    if (p.invuln > 0) p.invuln -= dt;
    if (p.regen > 0 && p.hp < p.maxHp) p.hp = Math.min(p.maxHp, p.hp + p.regen * dt);

    // Auto-fire at the nearest enemy.
    p.fireTimer -= dt;
    if (p.fireTimer <= 0) {
      if (fireVolley()) {
        p.fireTimer = p.fireInterval;
        events |= EVENT_SHOOT;
      } else {
        p.fireTimer = 0.08;
      }
    }

    // Enemies: chase, keep distance for shooters, shoot, touch the player.
    for (let i = state.enemies.length - 1; i >= 0; i -= 1) {
      const e = state.enemies[i];
      if (e.flash > 0) e.flash -= dt;
      e.wobble += dt * 3;
      const dx = p.x - e.x;
      const dy = p.y - e.y;
      const d = Math.hypot(dx, dy) || 1;
      const nx = dx / d;
      const ny = dy / d;
      if (e.ranged && e.kind === 'spitter') {
        // Spitters hold a ring around the player and shoot.
        const want = 260;
        const dir = d > want + 30 ? 1 : d < want - 30 ? -1 : 0;
        e.x += nx * e.speed * dir * dt;
        e.y += ny * e.speed * dir * dt;
        e.angle = Math.atan2(dy, dx);
        e.shotTimer -= dt;
        if (e.shotTimer <= 0 && d < 520) {
          e.shotTimer = e.shotInterval * random.range(0.9, 1.2);
          state.enemyShots.push({
            x: e.x, y: e.y, vx: nx * e.shotSpeed, vy: ny * e.shotSpeed,
            damage: e.shotDamage, radius: 6, life: 4,
          });
        }
      } else if (e.ranged && e.kind === 'boss') {
        e.x += nx * e.speed * dt;
        e.y += ny * e.speed * dt;
        e.angle += dt * 0.8;
        e.shotTimer -= dt;
        if (e.shotTimer <= 0) {
          e.shotTimer = e.shotInterval;
          const n = e.burst;
          for (let k = 0; k < n; k += 1) {
            const a = (k / n) * Math.PI * 2 + e.angle;
            state.enemyShots.push({
              x: e.x, y: e.y, vx: Math.cos(a) * e.shotSpeed, vy: Math.sin(a) * e.shotSpeed,
              damage: e.shotDamage, radius: 6, life: 4,
            });
          }
        }
      } else {
        // Chasers, with a small sideways wobble so they do not stack in a line.
        const wob = Math.sin(e.wobble) * 0.35;
        const px = -ny * wob;
        const py = nx * wob;
        e.x += (nx + px) * e.speed * dt;
        e.y += (ny + py) * e.speed * dt;
        e.angle = Math.atan2(dy, dx);
      }
      // Touch damage.
      const rr = e.radius + PLAYER.radius;
      if (dist2(e.x, e.y, p.x, p.y) < rr * rr) {
        const ev = hurtPlayer(e.damage, e.x, e.y);
        events |= ev;
        if (state.over) return events;
        // Push the enemy back so it does not sit on the player.
        e.x -= nx * 18;
        e.y -= ny * 18;
      }
    }

    // Bullets: move, hit enemies, die on walls.
    for (let i = state.bullets.length - 1; i >= 0; i -= 1) {
      const b = state.bullets[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      if (b.life <= 0 || b.x < -20 || b.x > FIELD.width + 20 || b.y < -20 || b.y > FIELD.height + 20) {
        state.bullets.splice(i, 1);
        continue;
      }
      for (let j = state.enemies.length - 1; j >= 0; j -= 1) {
        const e = state.enemies[j];
        if (b.hit.has(e.id)) continue;
        const rr = e.radius + b.radius;
        if (dist2(b.x, b.y, e.x, e.y) < rr * rr) {
          b.hit.add(e.id);
          e.hp -= b.damage;
          e.flash = 0.09;
          floater(e.x, e.y - e.radius - 6, String(Math.round(b.damage)), b.crit ? '#ffe14d' : '#eef1f5');
          burst(b.x, b.y, e.color, 3, 140, 3);
          if (e.hp <= 0) {
            state.enemies.splice(j, 1);
            events |= killEnemy(e, 0);
          }
          if (b.pierce > 0) {
            b.pierce -= 1;
          } else {
            state.bullets.splice(i, 1);
          }
          break;
        }
      }
    }

    // Enemy shots: move, hit the player, die on walls.
    for (let i = state.enemyShots.length - 1; i >= 0; i -= 1) {
      const s = state.enemyShots[i];
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.life -= dt;
      if (s.life <= 0 || s.x < -20 || s.x > FIELD.width + 20 || s.y < -20 || s.y > FIELD.height + 20) {
        state.enemyShots.splice(i, 1);
        continue;
      }
      const rr = s.radius + PLAYER.radius;
      if (dist2(s.x, s.y, p.x, p.y) < rr * rr) {
        state.enemyShots.splice(i, 1);
        const ev = hurtPlayer(s.damage, s.x - s.vx, s.y - s.vy);
        events |= ev;
        if (state.over) return events;
      }
    }

    // Gems: drift, get magnetised, get collected.
    for (let i = state.gems.length - 1; i >= 0; i -= 1) {
      const g = state.gems[i];
      g.bob += dt * 6;
      g.x += g.vx * dt;
      g.y += g.vy * dt;
      g.vx *= 0.88;
      g.vy *= 0.88;
      const d2 = dist2(g.x, g.y, p.x, p.y);
      if (d2 < p.magnet * p.magnet) {
        const d = Math.sqrt(d2) || 1;
        const pull = GEM.magnetSpeed * (1 - d / (p.magnet * 1.6));
        g.x += ((p.x - g.x) / d) * pull * dt;
        g.y += ((p.y - g.y) / d) * pull * dt;
      }
      if (d2 < GEM.pickupRadius * GEM.pickupRadius) {
        state.gems.splice(i, 1);
        events |= gainXp(g.value, EVENT_XP);
        if (state.levelUpChoices) return events;
      }
    }

    // Particles and floating text fade.
    for (let i = state.particles.length - 1; i >= 0; i -= 1) {
      const pt = state.particles[i];
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.vx *= 0.92;
      pt.vy *= 0.92;
      pt.life -= dt;
      if (pt.life <= 0) state.particles.splice(i, 1);
    }
    for (let i = state.floaters.length - 1; i >= 0; i -= 1) {
      const f = state.floaters[i];
      f.y -= 34 * dt;
      f.life -= dt;
      if (f.life <= 0) state.floaters.splice(i, 1);
    }

    if (state.shake > 0) state.shake = Math.max(0, state.shake - dt * 34);
    if (state.banner) {
      state.banner.timer -= dt;
      if (state.banner.timer <= 0) state.banner = null;
    }
    return events;
  }

  function applyUpgrade(id) {
    const p = state.player;
    p.upgradesTaken[id] = (p.upgradesTaken[id] || 0) + 1;
    if (id === 'damage') p.damage *= 1.25;
    if (id === 'rapid') p.fireInterval *= 0.8;
    if (id === 'split') p.projectiles += 1;
    if (id === 'pierce') p.pierce += 1;
    if (id === 'speed') p.speed *= 1.12;
    if (id === 'vitality') { p.maxHp += 25; p.hp = Math.min(p.maxHp, p.hp + 25); }
    if (id === 'magnet') p.magnet *= 1.45;
    if (id === 'crit') p.critChance += 0.1;
    if (id === 'regen') p.regen += 0.8;
    state.levelUpChoices = null;
  }

  /** Staging helper for the game-over screenshot: end a real simulated run at its
   *  current stats, with the death burst. Used only by shots.js. */
  function forceOver() {
    const p = state.player;
    p.hp = 0;
    p.alive = false;
    state.over = true;
    state.levelUpChoices = null;
    burst(p.x, p.y, '#4df3ff', 60, 380, 5);
    state.shake = 18;
  }

  return {
    state,
    reset,
    step,
    applyUpgrade,
    forceOver,
    // Exposed for the screenshot autopilot and tests.
    _nearestEnemy: nearestEnemy,
    _startWave: startWave,
  };
}

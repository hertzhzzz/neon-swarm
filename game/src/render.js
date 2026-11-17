// Paints the world on the canvas: the neon field, the ships, the shots, the particles and
// every screen (title, play, level-up, pause, game over, victory). The logical field is
// 1280x720; the canvas scales it to the window with letterboxing. Glow is cheap layered
// circles and additive blending, never shadowBlur in the hot loop.
import { FIELD, PALETTE, FONT } from './config.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_LEVELUP = 'levelup';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
export const SCREEN_WIN = 'win';

function poly(ctx, x, y, radius, sides, angle) {
  ctx.beginPath();
  for (let i = 0; i < sides; i += 1) {
    const a = angle + (i / sides) * Math.PI * 2;
    const px = x + Math.cos(a) * radius;
    const py = y + Math.sin(a) * radius;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function star(ctx, x, y, radius, angle, points = 5) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i += 1) {
    const r = i % 2 === 0 ? radius : radius * 0.45;
    const a = angle + (i / (points * 2)) * Math.PI * 2;
    const px = x + Math.cos(a) * r;
    const py = y + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function shape(ctx, kind, x, y, radius, angle, color, flash) {
  // A soft halo first, then the crisp shape, then a bright core.
  ctx.globalAlpha = 0.22;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, radius * 1.9, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.fillStyle = flash > 0 ? '#ffffff' : color;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  if (kind === 'diamond') poly(ctx, x, y, radius, 4, angle + Math.PI / 4);
  else if (kind === 'triangle') poly(ctx, x, y, radius, 3, angle);
  else if (kind === 'hex') poly(ctx, x, y, radius, 6, angle);
  else if (kind === 'oct') poly(ctx, x, y, radius, 8, angle);
  else if (kind === 'star') star(ctx, x, y, radius, angle, 5);
  else { ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); }
  ctx.fill();
  ctx.globalAlpha = 0.85;
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.beginPath();
  ctx.arc(x, y, radius * 0.28, 0, Math.PI * 2);
  ctx.fill();
}

function bar(ctx, x, y, w, h, frac, fill, back = 'rgba(255,255,255,0.14)') {
  ctx.fillStyle = back;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = fill;
  ctx.fillRect(x, y, w * Math.max(0, Math.min(1, frac)), h);
}

function text(ctx, str, x, y, size, color, align = 'center', weight = 600) {
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillText(str, x, y);
}

function panel(ctx, x, y, w, h) {
  ctx.fillStyle = PALETTE.panel;
  ctx.strokeStyle = PALETTE.panelEdge;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 10);
  ctx.fill();
  ctx.stroke();
}

function fmtTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function levelUpCardRects(count) {
  const w = 300;
  const gap = 28;
  const total = count * w + (count - 1) * gap;
  const rects = [];
  let x = (FIELD.width - total) / 2;
  for (let i = 0; i < count; i += 1) {
    rects.push({ x, y: 232, w, h: 220 });
    x += w + gap;
  }
  return rects;
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  let scale = 1;
  let ox = 0;
  let oy = 0;

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    scale = Math.min(canvas.width / FIELD.width, canvas.height / FIELD.height);
    ox = (canvas.width - FIELD.width * scale) / 2;
    oy = (canvas.height - FIELD.height * scale) / 2;
  }
  resize();
  window.addEventListener('resize', resize);

  function drawBackground(t) {
    ctx.fillStyle = PALETTE.backdrop;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // Grid, gently drifting.
    ctx.strokeStyle = PALETTE.grid;
    ctx.lineWidth = 1;
    const step = 64 * scale;
    const off = (t * 6) % step;
    ctx.beginPath();
    for (let x = ox + off; x < canvas.width; x += step) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
    }
    for (let y = oy + off; y < canvas.height; y += step) {
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
    }
    ctx.stroke();
    // Vignette.
    const g = ctx.createRadialGradient(
      canvas.width / 2, canvas.height / 2, Math.min(canvas.width, canvas.height) * 0.42,
      canvas.width / 2, canvas.height / 2, Math.max(canvas.width, canvas.height) * 0.75,
    );
    g.addColorStop(0, 'rgba(4,6,16,0)');
    g.addColorStop(1, PALETTE.vignette);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  function drawWorld(s, screen) {
    ctx.save();
    // Screen shake.
    if (s.shake > 0.2) {
      const m = s.shake * scale;
      ctx.translate((Math.random() - 0.5) * m, (Math.random() - 0.5) * m);
    }
    ctx.translate(ox, oy);
    ctx.scale(scale, scale);
    drawBackground(s.time);

    const p = s.player;
    // Gems.
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < s.gems.length; i += 1) {
      const g = s.gems[i];
      const bob = Math.sin(g.bob) * 2;
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = PALETTE.gem;
      ctx.beginPath();
      ctx.arc(g.x, g.y + bob, g.radius * 2.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = PALETTE.gem;
      poly(ctx, g.x, g.y + bob, g.radius, 4, g.bob);
      ctx.fill();
      ctx.fillStyle = PALETTE.gemCore;
      ctx.beginPath();
      ctx.arc(g.x, g.y + bob, g.radius * 0.32, 0, Math.PI * 2);
      ctx.fill();
    }
    // Enemy shots.
    for (let i = 0; i < s.enemyShots.length; i += 1) {
      const sh = s.enemyShots[i];
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = PALETTE.enemyShot;
      ctx.beginPath();
      ctx.arc(sh.x, sh.y, sh.radius * 2.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.arc(sh.x, sh.y, sh.radius, 0, Math.PI * 2);
      ctx.fill();
    }
    // Bullets.
    for (let i = 0; i < s.bullets.length; i += 1) {
      const b = s.bullets[i];
      ctx.strokeStyle = b.crit ? PALETTE.gold : PALETTE.bolt;
      ctx.lineWidth = b.crit ? 4 : 3;
      ctx.beginPath();
      ctx.moveTo(b.x - b.vx * 0.02, b.y - b.vy * 0.02);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.radius * 0.8, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
    // Enemies.
    for (let i = 0; i < s.enemies.length; i += 1) {
      const e = s.enemies[i];
      shape(ctx, e.shape, e.x, e.y, e.radius, e.angle, e.color, e.flash);
      if (e.hp < e.maxHp) {
        bar(ctx, e.x - e.radius, e.y - e.radius - 10, e.radius * 2, 3, e.hp / e.maxHp, '#ff5e6e');
      }
    }
    // Particles (additive).
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < s.particles.length; i += 1) {
      const pt = s.particles[i];
      ctx.globalAlpha = Math.max(0, pt.life / pt.maxLife);
      ctx.fillStyle = pt.color;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    // Player ship.
    if (p.alive) {
      const blink = p.invuln > 0 && Math.floor(p.invuln * 14) % 2 === 0;
      if (!blink) {
        // Engine trail.
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = PALETTE.player;
        ctx.beginPath();
        ctx.arc(p.x - Math.cos(p.angle) * 18, p.y - Math.sin(p.angle) * 18, 9, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
        shape(ctx, 'triangle', p.x, p.y, 17, p.angle, PALETTE.player, 0);
        ctx.fillStyle = PALETTE.playerCore;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // Damage numbers.
    for (let i = 0; i < s.floaters.length; i += 1) {
      const f = s.floaters[i];
      ctx.globalAlpha = Math.max(0, f.life / 0.8);
      text(ctx, f.text, f.x, f.y, 15, f.color, 'center', 700);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  function drawHud(s, best) {
    const p = s.player;
    ctx.save();
    ctx.translate(ox, oy);
    ctx.scale(scale, scale);
    // Top-left: HP and XP.
    text(ctx, `HP ${Math.ceil(p.hp)} / ${p.maxHp}`, 24, 26, 16, PALETTE.text, 'left', 700);
    bar(ctx, 24, 40, 220, 10, p.hp / p.maxHp, p.hp / p.maxHp > 0.3 ? '#3ddc84' : PALETTE.danger);
    text(ctx, `LEVEL ${p.level}`, 24, 66, 14, PALETTE.accent, 'left', 700);
    bar(ctx, 24, 78, 220, 7, p.xp / p.xpNext, PALETTE.accent);
    // Top-center: wave and time.
    text(ctx, `WAVE ${s.wave}`, FIELD.width / 2, 26, 20, PALETTE.text, 'center', 800);
    text(ctx, fmtTime(s.time), FIELD.width / 2, 50, 14, PALETTE.muted, 'center', 600);
    // Boss bar.
    if (s.boss) {
      text(ctx, 'BOSS', FIELD.width / 2, 76, 13, s.boss.color, 'center', 800);
      bar(ctx, FIELD.width / 2 - 150, 88, 300, 8, s.boss.hp / s.boss.maxHp, s.boss.color);
    }
    // Top-right: score, kills, best.
    text(ctx, `SCORE ${s.score}`, FIELD.width - 24, 26, 16, PALETTE.text, 'right', 700);
    text(ctx, `KILLS ${s.kills}   BEST ${best}`, FIELD.width - 24, 50, 13, PALETTE.muted, 'right', 600);
    // Wave banner.
    if (s.banner) {
      const a = Math.min(1, s.banner.timer / 0.4);
      ctx.globalAlpha = a;
      text(ctx, s.banner.text, FIELD.width / 2, FIELD.height / 2 - 60, 52, PALETTE.text, 'center', 800);
      if (s.banner.sub) text(ctx, s.banner.sub, FIELD.width / 2, FIELD.height / 2 - 14, 18, PALETTE.danger, 'center', 700);
      ctx.globalAlpha = 1;
    }
    // Controls hint.
    text(ctx, 'WASD / arrows to move · P pause · M mute', FIELD.width / 2, FIELD.height - 18, 12, PALETTE.muted, 'center', 500);
    ctx.restore();
  }

  function drawTitle(s, best) {
    ctx.save();
    ctx.translate(ox, oy);
    ctx.scale(scale, scale);
    ctx.fillStyle = 'rgba(4, 6, 16, 0.55)';
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    text(ctx, 'NEON SWARM', FIELD.width / 2, 218, 84, PALETTE.player, 'center', 800);
    text(ctx, 'Survive the swarm. Collect light. Level up. Beat wave 10.', FIELD.width / 2, 282, 20, PALETTE.text, 'center', 600);
    text(ctx, 'Move: WASD or arrows · Fire: automatic · Pick upgrades: 1 / 2 / 3 or click', FIELD.width / 2, 322, 15, PALETTE.muted, 'center', 500);
    panel(ctx, FIELD.width / 2 - 190, 352, 380, 64);
    text(ctx, 'CLICK OR PRESS ENTER TO START', FIELD.width / 2, 384, 20, PALETTE.gold, 'center', 800);
    if (best > 0) text(ctx, `BEST SCORE ${best}`, FIELD.width / 2, 452, 16, PALETTE.muted, 'center', 700);
    text(ctx, 'A complete game: 10 waves, a boss every 5 waves, upgrades, victory and restart.', FIELD.width / 2, 500, 13, PALETTE.muted, 'center', 500);
    ctx.restore();
  }

  function drawLevelUp(s) {
    const p = s.player;
    ctx.save();
    ctx.translate(ox, oy);
    ctx.scale(scale, scale);
    ctx.fillStyle = 'rgba(4, 6, 16, 0.62)';
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    text(ctx, `LEVEL ${p.level}`, FIELD.width / 2, 148, 40, PALETTE.accent, 'center', 800);
    text(ctx, 'Choose an upgrade', FIELD.width / 2, 192, 20, PALETTE.text, 'center', 600);
    const cards = s.levelUpChoices || [];
    const rects = levelUpCardRects(cards.length);
    for (let i = 0; i < cards.length; i += 1) {
      const c = cards[i];
      const r = rects[i];
      const x = r.x;
      const y = r.y;
      const w = r.w;
      panel(ctx, x, y, w, r.h);
      text(ctx, `${i + 1}`, x + w / 2, y + 34, 22, PALETTE.gold, 'center', 800);
      text(ctx, c.name, x + w / 2, y + 78, 22, PALETTE.text, 'center', 800);
      text(ctx, c.desc, x + w / 2, y + 118, 15, PALETTE.muted, 'center', 600);
      const taken = (p.upgradesTaken && p.upgradesTaken[c.id]) || 0;
      text(ctx, `owned ${taken} / ${c.max}`, x + w / 2, y + 176, 13, PALETTE.muted, 'center', 600);
    }
    text(ctx, 'Click a card or press 1 / 2 / 3', FIELD.width / 2, 500, 15, PALETTE.muted, 'center', 500);
    ctx.restore();
  }

  function drawPaused() {
    ctx.save();
    ctx.translate(ox, oy);
    ctx.scale(scale, scale);
    ctx.fillStyle = 'rgba(4, 6, 16, 0.6)';
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    text(ctx, 'PAUSED', FIELD.width / 2, 330, 56, PALETTE.text, 'center', 800);
    text(ctx, 'Press P to resume', FIELD.width / 2, 392, 18, PALETTE.muted, 'center', 600);
    ctx.restore();
  }

  function drawOver(s, best, won) {
    const p = s.player;
    ctx.save();
    ctx.translate(ox, oy);
    ctx.scale(scale, scale);
    ctx.fillStyle = 'rgba(4, 6, 16, 0.66)';
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    text(ctx, won ? 'VICTORY' : 'GAME OVER', FIELD.width / 2, 196, 64, won ? PALETTE.gold : PALETTE.danger, 'center', 800);
    text(ctx, won ? 'You beat the swarm. The endless hunt continues.' : 'The swarm got you.', FIELD.width / 2, 256, 18, PALETTE.text, 'center', 600);
    panel(ctx, FIELD.width / 2 - 210, 292, 420, 168);
    const rows = [
      ['Score', String(s.score)],
      ['Wave reached', String(s.wave)],
      ['Kills', String(s.kills)],
      ['Time survived', fmtTime(s.time)],
      ['Level', String(p.level)],
      ['Best score', String(best)],
    ];
    let y = 318;
    for (let i = 0; i < rows.length; i += 1) {
      text(ctx, rows[i][0], FIELD.width / 2 - 190, y, 15, PALETTE.muted, 'left', 600);
      text(ctx, rows[i][1], FIELD.width / 2 + 190, y, 15, PALETTE.text, 'right', 700);
      y += 24;
    }
    text(ctx, won ? 'Press Enter to keep playing endless · R to restart' : 'Press R or click to play again', FIELD.width / 2, 508, 17, PALETTE.gold, 'center', 700);
    ctx.restore();
  }

  return {
    resize,
    /** Canvas pixels -> logical field coordinates (for click hit-testing). */
    toLogical(px, py) {
      return { x: (px - ox) / scale, y: (py - oy) / scale };
    },
    levelUpCardRects,
    draw(state, screen, best) {
      drawBackground(state.time);
      drawWorld(state, screen);
      if (screen === SCREEN_TITLE) {
        drawTitle(state, best);
      } else if (screen === SCREEN_LEVELUP) {
        drawHud(state, best);
        drawLevelUp(state);
      } else if (screen === SCREEN_PAUSED) {
        drawHud(state, best);
        drawPaused();
      } else if (screen === SCREEN_OVER) {
        drawHud(state, best);
        drawOver(state, best, false);
      } else if (screen === SCREEN_WIN) {
        drawHud(state, best);
        drawOver(state, best, true);
      } else {
        drawHud(state, best);
      }
    },
  };
}

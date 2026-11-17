// Boot and the one loop: input is read every frame, the world advances in fixed 1/60 s steps
// (several in a slow frame, none in a fast one), and the renderer paints what is there. The game
// moves between six screens: title, play, level-up, paused, game over and victory.
// ?seed=N fixes the random pattern. ?shot=title|play|levelup|over (with &seed=N) stages that
// scene instead of running the loop, paints it twice and sets window.__shotReady for a screenshot.
import { BEST_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import { createWorld, EVENT_SHOOT, EVENT_KILL, EVENT_BOSS_DIE, EVENT_XP, EVENT_HURT, EVENT_LEVELUP, EVENT_WAVE, EVENT_BOSS, EVENT_VICTORY, EVENT_OVER } from './world.js';
import { ACTION_CONFIRM, ACTION_PAUSE, ACTION_MUTE, ACTION_RESTART, createInput } from './input.js';
import { createAudio } from './audio.js';
import { createRenderer, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_LEVELUP, SCREEN_WIN } from './render.js';
import { stageShot, autopilot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);
const audio = createAudio();

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best score then lasts this visit only.
  }
}

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, scene.best);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();
  let xpCombo = 0;
  let xpComboTimer = 0;

  function announce(message) {
    status.textContent = message;
  }

  function startGame() {
    world.reset();
    accumulator = 0;
    screen = SCREEN_PLAY;
    audio.unlock();
    announce('Playing. Survive the swarm.');
  }

  function endGame(won) {
    screen = won ? SCREEN_WIN : SCREEN_OVER;
    if (world.state.score > best) {
      best = world.state.score;
      saveBest(best);
    }
    announce(won ? `Victory. Score ${world.state.score}.` : `Game over. Score ${world.state.score}. Best ${best}.`);
  }

  function playEvents(events) {
    if (events & EVENT_SHOOT) audio.shoot();
    if (events & EVENT_KILL) audio.enemyDie();
    if (events & EVENT_BOSS_DIE) audio.bossDie();
    if (events & EVENT_XP) {
      xpCombo += 1;
      xpComboTimer = 0.9;
      audio.xp(Math.min(xpCombo, 12));
    }
    if (events & EVENT_HURT) audio.hurt();
    if (events & EVENT_LEVELUP) audio.levelup();
    if (events & EVENT_WAVE) audio.wave();
    if (events & EVENT_BOSS) audio.boss();
    if (events & EVENT_VICTORY) audio.victory();
    if (events & EVENT_OVER) audio.gameover();
  }

  function pickCard(index) {
    const choices = world.state.levelUpChoices;
    if (!choices || index < 0 || index >= choices.length) return;
    audio.click();
    world.applyUpgrade(choices[index].id);
    screen = SCREEN_PLAY;
    announce(`Upgrade: ${choices[index].name}.`);
  }

  function clickCardAt(mx, my) {
    const choices = world.state.levelUpChoices;
    if (!choices) return false;
    const logical = renderer.toLogical(mx, my);
    const rects = renderer.levelUpCardRects(choices.length);
    for (let i = 0; i < rects.length; i += 1) {
      const r = rects[i];
      if (logical.x >= r.x && logical.x <= r.x + r.w && logical.y >= r.y && logical.y <= r.y + r.h) {
        pickCard(i);
        return true;
      }
    }
    return false;
  }

  function tick(dt) {
    if (xpComboTimer > 0) {
      xpComboTimer -= dt;
      if (xpComboTimer <= 0) xpCombo = 0;
    }
    if (input.take(ACTION_MUTE)) {
      const muted = audio.toggleMute();
      announce(muted ? 'Muted.' : 'Sound on.');
    }
    if (screen === SCREEN_TITLE) {
      // Attract mode: the world plays itself behind the title.
      const events = world.step(dt, { move: () => autopilot(world.state, false) });
      if (world.state.levelUpChoices) world.applyUpgrade(world.state.levelUpChoices[0].id);
      if (world.state.over) world.reset();
      if (events & EVENT_VICTORY) world.reset();
      if (input.take(ACTION_CONFIRM) || input.takeClick()) {
        audio.unlock();
        audio.click();
        startGame();
      }
      return;
    }
    if (screen === SCREEN_PLAY) {
      if (input.take(ACTION_PAUSE)) {
        screen = SCREEN_PAUSED;
        announce('Paused.');
        return;
      }
      const events = world.step(dt, input);
      playEvents(events);
      if (world.state.levelUpChoices) {
        screen = SCREEN_LEVELUP;
        announce(`Level ${world.state.player.level}. Choose an upgrade.`);
        return;
      }
      if (events & EVENT_VICTORY) {
        endGame(true);
        return;
      }
      if (world.state.over) {
        endGame(false);
      }
      return;
    }
    if (screen === SCREEN_LEVELUP) {
      if (input.take('pick1')) pickCard(0);
      else if (input.take('pick2')) pickCard(1);
      else if (input.take('pick3')) pickCard(2);
      else if (input.takeClick()) {
        const m = input.mouse;
        clickCardAt(m.x, m.y);
      }
      return;
    }
    if (screen === SCREEN_PAUSED) {
      if (input.take(ACTION_PAUSE) || input.take(ACTION_CONFIRM)) {
        screen = SCREEN_PLAY;
        announce('Resumed.');
      }
      return;
    }
    if (screen === SCREEN_WIN) {
      if (input.take(ACTION_CONFIRM) || input.takeClick()) {
        screen = SCREEN_PLAY;
        announce('Endless mode. Keep going.');
      } else if (input.take(ACTION_RESTART)) {
        startGame();
      }
      return;
    }
    if (screen === SCREEN_OVER) {
      if (input.take(ACTION_RESTART) || input.take(ACTION_CONFIRM) || input.takeClick()) {
        startGame();
      }
    }
  }

  function frame(now) {
    const elapsed = Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    accumulator += elapsed;
    while (accumulator >= STEP) {
      tick(STEP);
      accumulator -= STEP;
    }
    renderer.draw(world.state, screen, best);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();

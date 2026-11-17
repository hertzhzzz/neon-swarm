// Synthesised sound effects on WebAudio: no audio files, so the game stays fully offline.
// The context is created lazily on the first user gesture (browsers block audio before that).
// Every effect is a short oscillator/noise burst; `muted` silences them all.
export function createAudio() {
  let ctx = null;
  let muted = false;
  let noiseBuf = null;

  function ensure() {
    if (!ctx) {
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        ctx = new AC();
      } catch {
        ctx = null;
      }
    }
    if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }

  function noise() {
    if (!noiseBuf) {
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.25, ctx.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    }
    return noiseBuf;
  }

  function tone({ freq = 440, to = null, dur = 0.1, type = 'square', vol = 0.08, delay = 0 }) {
    if (muted) return;
    const c = ensure();
    if (!c) return;
    const t0 = c.currentTime + delay;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (to !== null) o.frequency.exponentialRampToValueAtTime(Math.max(to, 1), t0 + dur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(c.destination);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }

  function burst({ dur = 0.15, vol = 0.12, freq = 1200, delay = 0 }) {
    if (muted) return;
    const c = ensure();
    if (!c) return;
    const t0 = c.currentTime + delay;
    const src = c.createBufferSource();
    src.buffer = noise();
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = freq;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f).connect(g).connect(c.destination);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  return {
    unlock() { ensure(); },
    get muted() { return muted; },
    toggleMute() { muted = !muted; return muted; },
    shoot() { tone({ freq: 880, to: 320, dur: 0.07, type: 'square', vol: 0.045 }); },
    enemyDie() { burst({ dur: 0.16, vol: 0.1, freq: 900 }); tone({ freq: 220, to: 60, dur: 0.14, type: 'sawtooth', vol: 0.06 }); },
    bossDie() { burst({ dur: 0.5, vol: 0.16, freq: 700 }); tone({ freq: 160, to: 40, dur: 0.5, type: 'sawtooth', vol: 0.1 }); },
    xp(pitch = 0) { tone({ freq: 660 + pitch * 40, to: 990 + pitch * 40, dur: 0.06, type: 'sine', vol: 0.05 }); },
    hurt() { tone({ freq: 140, to: 50, dur: 0.22, type: 'sawtooth', vol: 0.12 }); burst({ dur: 0.12, vol: 0.08, freq: 500 }); },
    levelup() {
      [523, 659, 784, 1047].forEach((f, i) => tone({ freq: f, dur: 0.14, type: 'triangle', vol: 0.09, delay: i * 0.07 }));
    },
    wave() { tone({ freq: 392, dur: 0.18, type: 'triangle', vol: 0.09 }); tone({ freq: 587, dur: 0.24, type: 'triangle', vol: 0.09, delay: 0.14 }); },
    boss() { tone({ freq: 98, dur: 0.4, type: 'sawtooth', vol: 0.12 }); tone({ freq: 147, dur: 0.4, type: 'sawtooth', vol: 0.1, delay: 0.3 }); },
    victory() {
      [523, 659, 784, 1047, 1319].forEach((f, i) => tone({ freq: f, dur: 0.2, type: 'triangle', vol: 0.09, delay: i * 0.09 }));
    },
    gameover() {
      [392, 330, 262, 196].forEach((f, i) => tone({ freq: f, dur: 0.25, type: 'triangle', vol: 0.09, delay: i * 0.14 }));
    },
    click() { tone({ freq: 1200, to: 900, dur: 0.04, type: 'sine', vol: 0.05 }); },
  };
}

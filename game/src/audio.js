// Sound, all synthesised with WebAudio: no audio files, nothing to load. A tiny engine of
// oscillators and filtered noise gives the game its shots, sirens, horns, pickups and stings.
// Everything is created lazily on the first user gesture, and every call is safe when muted
// or when the browser has no audio at all.

export function createAudio() {
  let ctx = null;
  let master = null;
  let muted = false;
  let sirenNodes = null;
  let engineNodes = null;

  function ensure() {
    if (ctx !== null) return ctx;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
    } catch {
      ctx = null;
    }
    return ctx;
  }

  function tone(freq, freqEnd, seconds, type, volume, delay = 0) {
    if (muted || !ensure()) return;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (freqEnd !== freq) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), t0 + seconds);
    gain.gain.setValueAtTime(volume, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + seconds);
    osc.connect(gain).connect(master);
    osc.start(t0);
    osc.stop(t0 + seconds + 0.02);
  }

  function noise(seconds, volume, filterFreq, delay = 0) {
    if (muted || !ensure()) return;
    const t0 = ctx.currentTime + delay;
    const length = Math.max(1, Math.floor(ctx.sampleRate * seconds));
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const gain = ctx.createGain();
    gain.gain.value = volume;
    src.connect(filter).connect(gain).connect(master);
    src.start(t0);
  }

  return {
    unlock() { ensure(); if (ctx && ctx.state === 'suspended') ctx.resume(); },
    toggleMute() { muted = !muted; if (muted) this.siren(false); return muted; },
    get muted() { return muted; },

    shoot() { noise(0.14, 0.5, 2600); tone(160, 60, 0.1, 'square', 0.18); },
    punch() { noise(0.08, 0.35, 900); },
    hurt() { tone(220, 90, 0.16, 'sawtooth', 0.2); },
    crash(strength = 1) { noise(0.22, Math.min(0.6, 0.25 + strength * 0.3), 700); tone(90, 40, 0.2, 'triangle', 0.25); },
    pickup() { tone(880, 1320, 0.09, 'sine', 0.22); },
    cash() { tone(1240, 1240, 0.06, 'square', 0.12); tone(1860, 1860, 0.09, 'square', 0.12, 0.06); },
    horn() { tone(370, 370, 0.28, 'square', 0.16); tone(466, 466, 0.28, 'square', 0.12); },
    /** A passenger hails the cab: a bright two-tone ding from the kerb. */
    taxi() { tone(880, 880, 0.09, 'sine', 0.22); tone(1174, 1174, 0.14, 'sine', 0.22, 0.1); },
    /** The fare is paid: a little cash-register arpeggio. */
    fare() { tone(1046, 1046, 0.07, 'square', 0.12); tone(1318, 1318, 0.07, 'square', 0.12, 0.07); tone(1568, 1568, 0.12, 'square', 0.12, 0.14); },
    door() { tone(140, 90, 0.08, 'triangle', 0.25); },
    missionStart() { tone(523, 523, 0.12, 'triangle', 0.22); tone(784, 784, 0.16, 'triangle', 0.22, 0.1); },
    missionDone() { tone(659, 659, 0.1, 'triangle', 0.22); tone(880, 880, 0.1, 'triangle', 0.22, 0.09); tone(1318, 1318, 0.22, 'triangle', 0.24, 0.18); },
    fail() { tone(392, 392, 0.14, 'sawtooth', 0.16); tone(311, 233, 0.3, 'sawtooth', 0.16, 0.12); },
    star() { tone(1046, 1568, 0.12, 'square', 0.1); },

    /** A two-tone police siren that loops while any star is lit; call with false to stop it. */
    siren(on) {
      if (!ensure() || muted) on = false;
      if (on && sirenNodes) return;
      if (!on && sirenNodes) {
        try { sirenNodes.osc.stop(); } catch { /* already stopped */ }
        sirenNodes = null;
        return;
      }
      if (!on) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = 950;
      lfo.frequency.value = 0.7;
      lfoGain.gain.value = 260;
      lfo.connect(lfoGain).connect(osc.frequency);
      gain.gain.value = 0.045;
      osc.connect(gain).connect(master);
      osc.start();
      lfo.start();
      sirenNodes = { osc, lfo };
    },

    /** The player's engine note: pitch follows speed. Call every frame; cheap when idle. */
    engine(speedRatio, inCar) {
      if (!inCar || muted || !ensure()) {
        if (engineNodes) {
          try { engineNodes.osc.stop(); } catch { /* already stopped */ }
          engineNodes = null;
        }
        return;
      }
      if (!engineNodes) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        gain.gain.value = 0.0;
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 480;
        osc.connect(filter).connect(gain).connect(master);
        osc.start();
        engineNodes = { osc, gain };
      }
      engineNodes.osc.frequency.value = 55 + speedRatio * 165;
      engineNodes.gain.gain.value = 0.02 + speedRatio * 0.05;
    },
  };
}

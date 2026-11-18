// Coral Bay Heat has no audio files. Every sound is cooked up live with
// WebAudio oscillators and shaped noise: gunfire cracks, knuckles thud,
// sirens wail in two tones, and the engine note tracks the car's speed.
// The context is created lazily on the first user gesture (browsers
// insist), and every entry point quietly does nothing when muted or when
// WebAudio is unavailable.

export function createAudio() {
  let context = null;
  let bus = null;
  let isMuted = false;
  let sirenRig = null;
  let engineRig = null;

  function bootContext() {
    if (context) return context;
    try {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) return null;
      context = new Ctor();
      bus = context.createGain();
      bus.gain.value = 0.5;
      bus.connect(context.destination);
    } catch {
      context = null;
    }
    return context;
  }

  // One enveloped oscillator voice. The frequency may glide to glideTo.
  function voice({ freq, glideTo = null, dur = 0.15, wave = 'sine', vol = 0.2, when = 0 }) {
    if (isMuted || !bootContext()) return;
    const start = context.currentTime + when;
    const osc = context.createOscillator();
    const amp = context.createGain();
    osc.type = wave;
    osc.frequency.setValueAtTime(freq, start);
    if (glideTo !== null) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, glideTo), start + dur);
    }
    amp.gain.setValueAtTime(vol, start);
    amp.gain.exponentialRampToValueAtTime(0.001, start + dur);
    osc.connect(amp);
    amp.connect(bus);
    osc.start(start);
    osc.stop(start + dur + 0.02);
  }

  // One burst of filtered white noise with a decaying tail.
  function noiseHit(dur, vol, cutoff, when = 0) {
    if (isMuted || !bootContext()) return;
    const start = context.currentTime + when;
    const frames = Math.max(1, Math.floor(context.sampleRate * dur));
    const buffer = context.createBuffer(1, frames, context.sampleRate);
    const samples = buffer.getChannelData(0);
    for (let i = 0; i < frames; i += 1) samples[i] = (Math.random() * 2 - 1) * (1 - i / frames);
    const src = context.createBufferSource();
    src.buffer = buffer;
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    const amp = context.createGain();
    amp.gain.value = vol;
    src.connect(filter);
    filter.connect(amp);
    amp.connect(bus);
    src.start(start);
  }

  function stopSiren() {
    if (!sirenRig) return;
    try { sirenRig.carrier.stop(); } catch { /* already silent */ }
    try { sirenRig.wobble.stop(); } catch { /* already silent */ }
    sirenRig = null;
  }

  function stopEngine() {
    if (!engineRig) return;
    try { engineRig.osc.stop(); } catch { /* already silent */ }
    engineRig = null;
  }

  const api = {
    unlock() {
      bootContext();
      if (context && context.state === 'suspended') context.resume();
    },
    toggleMute() {
      isMuted = !isMuted;
      if (isMuted) { stopSiren(); stopEngine(); }
      return isMuted;
    },
    get muted() { return isMuted; },

    shoot() { noiseHit(0.14, 0.5, 2600); voice({ freq: 160, glideTo: 60, dur: 0.1, wave: 'square', vol: 0.18 }); },
    punch() { noiseHit(0.08, 0.35, 900); },
    hurt() { voice({ freq: 220, glideTo: 90, dur: 0.16, wave: 'sawtooth', vol: 0.2 }); },
    crash(strength = 1) {
      noiseHit(0.22, Math.min(0.6, 0.25 + strength * 0.3), 700);
      voice({ freq: 90, glideTo: 40, dur: 0.2, wave: 'triangle', vol: 0.25 });
    },
    pickup() { voice({ freq: 880, glideTo: 1320, dur: 0.09, vol: 0.22 }); },
    cash() {
      voice({ freq: 1240, dur: 0.06, wave: 'square', vol: 0.12 });
      voice({ freq: 1860, dur: 0.09, wave: 'square', vol: 0.12, when: 0.06 });
    },
    horn() {
      voice({ freq: 370, dur: 0.28, wave: 'square', vol: 0.16 });
      voice({ freq: 466, dur: 0.28, wave: 'square', vol: 0.12 });
    },
    taxi() {
      voice({ freq: 880, dur: 0.09, vol: 0.22 });
      voice({ freq: 1174, dur: 0.14, vol: 0.22, when: 0.1 });
    },
    fare() {
      voice({ freq: 1046, dur: 0.07, wave: 'square', vol: 0.12 });
      voice({ freq: 1318, dur: 0.07, wave: 'square', vol: 0.12, when: 0.07 });
      voice({ freq: 1568, dur: 0.12, wave: 'square', vol: 0.12, when: 0.14 });
    },
    door() { voice({ freq: 140, glideTo: 90, dur: 0.08, wave: 'triangle', vol: 0.25 }); },
    missionStart() {
      voice({ freq: 523, dur: 0.12, wave: 'triangle', vol: 0.22 });
      voice({ freq: 784, dur: 0.16, wave: 'triangle', vol: 0.22, when: 0.1 });
    },
    missionDone() {
      voice({ freq: 659, dur: 0.1, wave: 'triangle', vol: 0.22 });
      voice({ freq: 880, dur: 0.1, wave: 'triangle', vol: 0.22, when: 0.09 });
      voice({ freq: 1318, dur: 0.22, wave: 'triangle', vol: 0.24, when: 0.18 });
    },
    fail() {
      voice({ freq: 392, dur: 0.14, wave: 'sawtooth', vol: 0.16 });
      voice({ freq: 311, glideTo: 233, dur: 0.3, wave: 'sawtooth', vol: 0.16, when: 0.12 });
    },
    star() { voice({ freq: 1046, glideTo: 1568, dur: 0.12, wave: 'square', vol: 0.1 }); },

    // Looping two-tone siren: an LFO swings the carrier between pitches.
    siren(on) {
      if (!bootContext() || isMuted) on = false;
      if (!on) { stopSiren(); return; }
      if (sirenRig) return;
      const carrier = context.createOscillator();
      const wobble = context.createOscillator();
      const wobbleDepth = context.createGain();
      const amp = context.createGain();
      carrier.type = 'triangle';
      carrier.frequency.value = 950;
      wobble.frequency.value = 0.7;
      wobbleDepth.gain.value = 260;
      wobble.connect(wobbleDepth);
      wobbleDepth.connect(carrier.frequency);
      amp.gain.value = 0.045;
      carrier.connect(amp);
      amp.connect(bus);
      carrier.start();
      wobble.start();
      sirenRig = { carrier, wobble };
    },

    // Continuous engine voice; pitch and volume follow speed each frame.
    engine(speedRatio, inCar) {
      if (!inCar || isMuted || !bootContext()) { stopEngine(); return; }
      if (!engineRig) {
        const osc = context.createOscillator();
        const amp = context.createGain();
        const filter = context.createBiquadFilter();
        osc.type = 'sawtooth';
        amp.gain.value = 0;
        filter.type = 'lowpass';
        filter.frequency.value = 480;
        osc.connect(filter);
        filter.connect(amp);
        amp.connect(bus);
        osc.start();
        engineRig = { osc, amp };
      }
      engineRig.osc.frequency.value = 55 + speedRatio * 165;
      engineRig.amp.gain.value = 0.02 + speedRatio * 0.05;
    },
  };
  return api;
}

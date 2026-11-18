// All sound is synthesised at runtime: a two-oscillator engine, noise-burst gunshots and crashes,
// a wailing siren, scored stingers and a slow synth score that follows the player's mood. Audio
// starts on the first click or keypress (browsers require a gesture) and is silent in screenshots.
export function createAudio() {
  let context = null;
  let master = null;
  let musicGain = null;
  let engineNodes = null;
  let sirenNodes = null;
  let noiseBuffer = null;
  let started = false;
  let muted = false;
  let nextBeat = 0;
  let beat = 0;
  let wanted = 0;
  let inCar = false;
  let speed = 0;
  let throttle = 0;

  function buildNoise() {
    const length = context.sampleRate * 2;
    noiseBuffer = context.createBuffer(1, length, context.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
  }

  function start() {
    if (started) return;
    const AudioCtor = window.AudioContext ?? window.webkitAudioContext;
    if (!AudioCtor) return;
    context = new AudioCtor();
    master = context.createGain();
    master.gain.value = 0.55;
    master.connect(context.destination);
    musicGain = context.createGain();
    musicGain.gain.value = 0.22;
    musicGain.connect(master);
    buildNoise();
    // Engine: a saw and a square detuned together, filtered down to a rumble.
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 520;
    filter.Q.value = 2;
    const gain = context.createGain();
    gain.gain.value = 0;
    const oscA = context.createOscillator();
    oscA.type = 'sawtooth';
    oscA.frequency.value = 55;
    const oscB = context.createOscillator();
    oscB.type = 'square';
    oscB.frequency.value = 82;
    oscA.connect(filter);
    oscB.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    oscA.start();
    oscB.start();
    engineNodes = { oscA, oscB, filter, gain };
    // Siren: one oscillator whose pitch is swung by a slow LFO.
    const sirenGain = context.createGain();
    sirenGain.gain.value = 0;
    const sirenOsc = context.createOscillator();
    sirenOsc.type = 'triangle';
    sirenOsc.frequency.value = 720;
    const sirenLfo = context.createOscillator();
    sirenLfo.type = 'sine';
    sirenLfo.frequency.value = 0.9;
    const sirenDepth = context.createGain();
    sirenDepth.gain.value = 260;
    sirenLfo.connect(sirenDepth);
    sirenDepth.connect(sirenOsc.frequency);
    sirenOsc.connect(sirenGain);
    sirenGain.connect(master);
    sirenOsc.start();
    sirenLfo.start();
    sirenNodes = { osc: sirenOsc, gain: sirenGain };
    started = true;
    nextBeat = context.currentTime + 0.4;
    resume();
  }

  function resume() {
    if (context && context.state === 'suspended') context.resume();
  }

  function now() {
    return context ? context.currentTime : 0;
  }

  function tone(frequency, duration, options = {}) {
    if (!started || muted) return;
    const osc = context.createOscillator();
    osc.type = options.type ?? 'sine';
    osc.frequency.setValueAtTime(frequency, now());
    if (options.slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, options.slide), now() + duration);
    const gain = context.createGain();
    const peak = options.volume ?? 0.2;
    gain.gain.setValueAtTime(0.0001, now());
    gain.gain.exponentialRampToValueAtTime(peak, now() + (options.attack ?? 0.008));
    gain.gain.exponentialRampToValueAtTime(0.0001, now() + duration);
    osc.connect(gain);
    gain.connect(options.bus ?? master);
    osc.start();
    osc.stop(now() + duration + 0.05);
  }

  function noise(duration, options = {}) {
    if (!started || muted) return;
    const source = context.createBufferSource();
    source.buffer = noiseBuffer;
    const filter = context.createBiquadFilter();
    filter.type = options.filter ?? 'bandpass';
    filter.frequency.setValueAtTime(options.frequency ?? 900, now());
    if (options.sweep) filter.frequency.exponentialRampToValueAtTime(Math.max(40, options.sweep), now() + duration);
    filter.Q.value = options.q ?? 0.9;
    const gain = context.createGain();
    const peak = options.volume ?? 0.4;
    gain.gain.setValueAtTime(peak, now());
    gain.gain.exponentialRampToValueAtTime(0.0001, now() + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(options.bus ?? master);
    source.start();
    source.stop(now() + duration + 0.02);
  }

  // ---- effects ------------------------------------------------------------
  function gunshot(kind = 'pistol') {
    const smg = kind === 'smg';
    noise(smg ? 0.09 : 0.16, { filter: 'bandpass', frequency: smg ? 1500 : 900, sweep: 220, volume: smg ? 0.4 : 0.55, q: 1.2 });
    tone(smg ? 180 : 120, smg ? 0.09 : 0.16, { type: 'square', volume: 0.18, slide: 45 });
  }

  function explosion(position) {
    noise(1.1, { filter: 'lowpass', frequency: 1400, sweep: 60, volume: 0.9 });
    tone(70, 0.9, { type: 'sine', volume: 0.5, slide: 24 });
    tone(140, 0.4, { type: 'sawtooth', volume: 0.2, slide: 30 });
  }

  function crash(position, strength = 0.5) {
    noise(0.28, { filter: 'highpass', frequency: 500, volume: 0.18 + strength * 0.35 });
    tone(90 + Math.random() * 60, 0.2, { type: 'square', volume: 0.12 * strength, slide: 50 });
  }

  function horn(position) {
    if (!started || muted) return;
    for (const frequency of [392, 494]) {
      const osc = context.createOscillator();
      osc.type = 'square';
      osc.frequency.value = frequency;
      const gain = context.createGain();
      gain.gain.setValueAtTime(0.0001, now());
      gain.gain.exponentialRampToValueAtTime(0.16, now() + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now() + 0.55);
      osc.connect(gain);
      gain.connect(master);
      osc.start();
      osc.stop(now() + 0.6);
    }
  }

  function pickup() {
    tone(880, 0.1, { type: 'triangle', volume: 0.18 });
    setTimeout(() => tone(1320, 0.18, { type: 'triangle', volume: 0.16 }), 70);
  }

  function ui() {
    tone(520, 0.06, { type: 'square', volume: 0.08 });
  }

  function missionSting(success = true) {
    const notes = success ? [392, 523, 659, 784] : [330, 262, 196];
    notes.forEach((frequency, index) => {
      setTimeout(() => tone(frequency, 0.5, { type: 'triangle', volume: 0.16 }), index * 130);
    });
  }

  function wasted() {
    tone(220, 1.4, { type: 'sawtooth', volume: 0.22, slide: 40 });
    noise(1.0, { filter: 'lowpass', frequency: 700, sweep: 80, volume: 0.25 });
  }

  // ---- the score -----------------------------------------------------------
  const CHORDS = [
    [110, 164.81, 220, 261.63],
    [98, 146.83, 196, 246.94],
    [130.81, 196, 246.94, 329.63],
    [87.31, 130.81, 174.61, 220],
  ];

  function scheduleMusic() {
    if (!started || muted || context.state !== 'running') return;
    const ahead = now() + 0.6;
    while (nextBeat < ahead) {
      const chord = CHORDS[(Math.floor(beat / 8) % CHORDS.length)];
      if (beat % 8 === 0) {
        // Warm pad at the top of each two-bar phrase.
        for (const frequency of chord) {
          for (const detune of [-4, 3]) {
            const osc = context.createOscillator();
            osc.type = 'sawtooth';
            osc.frequency.value = frequency;
            osc.detune.value = detune;
            const filter = context.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.value = 900 + wanted * 260;
            const gain = context.createGain();
            gain.gain.setValueAtTime(0.0001, nextBeat);
            gain.gain.exponentialRampToValueAtTime(0.05, nextBeat + 1.2);
            gain.gain.exponentialRampToValueAtTime(0.0001, nextBeat + 3.4);
            osc.connect(filter);
            filter.connect(gain);
            gain.connect(musicGain);
            osc.start(nextBeat);
            osc.stop(nextBeat + 3.6);
          }
        }
      }
      // A sparse arpeggio; faster and brighter with heat.
      const arp = [0, 2, 1, 3, 2, 1, 3, 2];
      const note = chord[arp[beat % arp.length]] * 2;
      const gainScale = 0.05 + wanted * 0.012;
      const osc = context.createOscillator();
      osc.type = 'square';
      osc.frequency.value = note;
      const filter = context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 1800;
      const gain = context.createGain();
      gain.gain.setValueAtTime(0.0001, nextBeat);
      gain.gain.exponentialRampToValueAtTime(gainScale, nextBeat + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, nextBeat + 0.24);
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(musicGain);
      osc.start(nextBeat);
      osc.stop(nextBeat + 0.3);
      if (beat % 2 === 0) {
        const bass = context.createOscillator();
        bass.type = 'triangle';
        bass.frequency.value = chord[0] / 2;
        const bg = context.createGain();
        bg.gain.setValueAtTime(0.0001, nextBeat);
        bg.gain.exponentialRampToValueAtTime(0.09, nextBeat + 0.02);
        bg.gain.exponentialRampToValueAtTime(0.0001, nextBeat + 0.7);
        bass.connect(bg);
        bg.connect(musicGain);
        bass.start(nextBeat);
        bass.stop(nextBeat + 0.75);
      }
      beat += 1;
      nextBeat += 0.32;
    }
  }

  /** Called once per fixed step with the player's context. */
  function update(dt, player) {
    if (!started) return;
    speed = player.car ? Math.abs(player.car.speed) : 0;
    throttle = player.car ? player.car.throttle : 0;
    inCar = Boolean(player.car);
    wanted = player.wanted ?? 0;
    if (engineNodes) {
      const idle = inCar ? 0.045 : 0;
      const moving = Math.min(1, speed / 42);
      const targetGain = inCar ? idle + moving * 0.12 : 0;
      engineNodes.gain.gain.setTargetAtTime(targetGain, now(), 0.08);
      const frequency = 42 + speed * 3.4 + (throttle > 0 ? 16 : 0);
      engineNodes.oscA.frequency.setTargetAtTime(frequency, now(), 0.1);
      engineNodes.oscB.frequency.setTargetAtTime(frequency * 1.51, now(), 0.1);
      engineNodes.filter.frequency.setTargetAtTime(420 + speed * 24, now(), 0.1);
    }
    if (sirenNodes) {
      sirenNodes.gain.gain.setTargetAtTime(wanted >= 2 ? 0.045 : 0, now(), 0.2);
    }
    scheduleMusic();
  }

  return {
    start, resume, gunshot, explosion, crash, horn, pickup, ui, missionSting, wasted, update,
    get started() { return started; },
    get muted() { return muted; },
    setMuted(value) { muted = value; if (master) master.gain.value = value ? 0 : 0.55; },
  };
}

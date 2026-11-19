// Neon Harbor's audio is entirely synthesised: no samples are fetched, so the
// game stays a static file and still has an engine, three original radio loops,
// a two-tone siren, gunfire, impacts, a horn and UI blips. The context is only
// created on the first real gesture, which keeps autoplay warnings out of the
// headless screenshots and keeps the shot renders silent.

const MASTER_VOLUME = 0.72;

function midiToFrequency(note) {
  return 440 * 2 ** ((note - 69) / 12);
}

const STATION_MUSIC = {
  synthwave: {
    chords: [45, 41, 48, 43],
    lead: [12, null, 19, null, 15, 12, null, 10, 12, null, 19, 22, 19, 15, 12, null],
    bass: [0, null, 0, null, 7, null, 0, null, 0, null, 5, null, 7, null, 10, null],
    pad: 0.055,
    leadType: 'sawtooth',
    leadGain: 0.075,
    bassType: 'triangle',
  },
  chiptune: {
    chords: [40, 43, 45, 38],
    lead: [12, 19, 24, 19, 12, 15, 19, 15, 12, 19, 24, 27, 24, 19, 15, 12],
    bass: [0, 0, 12, 0, 0, 7, 12, 7, 0, 0, 12, 0, 5, 7, 12, 7],
    pad: 0.025,
    leadType: 'square',
    leadGain: 0.058,
    bassType: 'square',
  },
  surf: {
    chords: [38, 43, 45, 40],
    lead: [12, null, 12, 15, 19, 15, 12, null, 10, null, 10, 12, 15, 12, 10, 7],
    bass: [0, 0, 7, 0, 0, 5, 7, 0, 0, 0, 7, 0, 3, 5, 7, 9],
    pad: 0.018,
    leadType: 'sawtooth',
    leadGain: 0.06,
    bassType: 'triangle',
  },
};

export class AudioSystem {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.noiseBuffer = null;
    this.muted = false;
    this.volume = MASTER_VOLUME;
    this.engine = null;
    this.engineState = { on: false, rpm: 0 };
    this.radio = { enabled: true, index: 0 };
    this.radioNodes = null;
    this.radioBus = null;
    this.radioTimer = 0;
    this.radioStep = 0;
    this.nextNote = 0;
    this.siren = null;
    this.sirenLevel = 0;
    this.sirenClock = 0;
    this._unlock = () => this.unlock();
    window.addEventListener('pointerdown', this._unlock);
    window.addEventListener('keydown', this._unlock);
  }

  get ready() {
    return Boolean(this.ctx);
  }

  get isMuted() {
    return this.muted;
  }

  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return;
    }
    // Never create a context off an untrusted scripted click; browsers will
    // suspend it and log the autoplay warning on every scheduled note. A real
    // pointerdown or keydown sets userActivation before this runs.
    const activation = navigator.userActivation;
    if (activation && !activation.isActive && !activation.hasBeenActive) return;
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return;
    try {
      this.ctx = new Ctor();
    } catch {
      return;
    }
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : this.volume;
    this.master.connect(this.ctx.destination);
    this.noiseBuffer = this.makeNoise(1.2);
    this.buildEngine();
    this.buildSiren();
    this.ctx.addEventListener('statechange', () => this.onAudioState());
    const resumed = this.ctx.resume();
    if (resumed && typeof resumed.catch === 'function') resumed.catch(() => {});
    this.startWhenRunning();
  }

  onAudioState() {
    if (this.ctx?.state === 'running') this.startWhenRunning();
  }

  startWhenRunning() {
    if (!this.ctx || this.ctx.state !== 'running') return;
    this.setEngine(this.engineState);
    if (this.radio.enabled && !this.radioBus) this.startRadio();
  }

  makeNoise(seconds) {
    const length = Math.max(1, Math.floor(this.ctx.sampleRate * seconds));
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let value = 0;
    for (let i = 0; i < length; i += 1) {
      value = value * 0.42 + (Math.random() * 2 - 1) * 0.58;
      data[i] = value;
    }
    return buffer;
  }

  setVolume(value) {
    this.volume = Math.max(0, Math.min(1, value));
    if (this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume, this.ctx.currentTime, 0.03);
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume, this.ctx.currentTime, 0.03);
    return this.muted;
  }

  // -------------------------------------------------------------- engine

  buildEngine() {
    const ctx = this.ctx;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 540;
    filter.Q.value = 1.1;
    const oscA = ctx.createOscillator();
    oscA.type = 'sawtooth';
    oscA.frequency.value = 46;
    const oscB = ctx.createOscillator();
    oscB.type = 'square';
    oscB.frequency.value = 69;
    oscB.detune.value = 7;
    const sub = ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.value = 29;
    const subGain = ctx.createGain();
    subGain.gain.value = 0.42;
    oscA.connect(filter);
    oscB.connect(filter);
    filter.connect(gain);
    sub.connect(subGain);
    subGain.connect(gain);
    gain.connect(this.master);
    oscA.start();
    oscB.start();
    sub.start();
    this.engine = { gain, filter, oscA, oscB, sub, subGain };
  }

  setEngine(state) {
    this.engineState = state ?? { on: false, rpm: 0 };
    if (!this.engine || !this.ctx) return;
    const now = this.ctx.currentTime;
    const rpm = Math.max(0, Math.min(6800, this.engineState.rpm ?? 0));
    const speed = Math.abs(this.engineState.speed ?? 0);
    const on = Boolean(this.engineState.on);
    const base = 34 + (rpm / 6800) * 76 + Math.min(15, speed * 0.25);
    this.engine.oscA.frequency.setTargetAtTime(base, now, 0.08);
    this.engine.oscB.frequency.setTargetAtTime(base * 1.5 + 6, now, 0.09);
    this.engine.sub.frequency.setTargetAtTime(base * 0.5, now, 0.1);
    this.engine.filter.frequency.setTargetAtTime(350 + (rpm / 6800) * 1100, now, 0.1);
    const load = Math.max(0, Math.min(1, this.engineState.load ?? 0));
    this.engine.gain.gain.setTargetAtTime(on ? 0.09 + load * 0.08 + Math.min(0.05, speed * 0.0015) : 0, now, 0.14);
  }

  // -------------------------------------------------------------- radio

  setRadio(enabled, index = this.radio.index) {
    this.radio.enabled = Boolean(enabled);
    this.radio.index = ((index % 3) + 3) % 3;
    if (!this.ctx) return;
    if (!this.radio.enabled) {
      this.stopRadio();
      return;
    }
    if (this.ctx.state === 'running') this.startRadio();
  }

  startRadio() {
    if (!this.ctx || !this.radio.enabled || this.ctx.state !== 'running') return;
    this.stopRadio();
    const ctx = this.ctx;
    const bus = ctx.createGain();
    bus.gain.value = 0;
    bus.connect(this.master);
    bus.gain.setTargetAtTime(0.7, ctx.currentTime, 0.25);
    this.radioBus = bus;
    this.radioStep = 0;
    this.nextNote = ctx.currentTime + 0.15;
    this.radioTimer = window.setInterval(() => this.scheduleRadio(), 90);
    this.scheduleRadio();
  }

  stopRadio() {
    if (this.radioTimer) {
      window.clearInterval(this.radioTimer);
      this.radioTimer = 0;
    }
    if (this.radioBus && this.ctx) {
      const bus = this.radioBus;
      bus.gain.setTargetAtTime(0, this.ctx.currentTime, 0.08);
      window.setTimeout(() => bus.disconnect(), 700);
      this.radioBus = null;
    }
  }

  scheduleRadio() {
    if (!this.ctx || !this.radioBus) return;
    const station = ['synthwave', 'chiptune', 'surf'][this.radio.index] ?? 'synthwave';
    const music = STATION_MUSIC[station];
    const bpm = [96, 118, 132][this.radio.index] ?? 100;
    const stepDuration = 60 / bpm / 4;
    while (this.nextNote < this.ctx.currentTime + 0.32) {
      this.playRadioStep(music, this.radioStep, this.nextNote, stepDuration);
      this.nextNote += stepDuration;
      this.radioStep = (this.radioStep + 1) % 64;
    }
  }

  playRadioStep(music, step, time, stepDuration) {
    const bus = this.radioBus;
    if (!bus) return;
    const bar = Math.floor(step / 16) % 4;
    const local = step % 16;
    const root = music.chords[bar];
    const leadNote = music.lead[local];
    if (leadNote !== null && leadNote !== undefined) {
      const duration = leadNote === 12 && local % 4 === 0 ? stepDuration * 2.6 : stepDuration * 1.4;
      this.note({
        type: music.leadType,
        frequency: midiToFrequency(root + leadNote + 12),
        time,
        duration,
        gain: music.leadGain,
        filter: 3200,
        destination: bus,
      });
    }
    const bassNote = music.bass[local];
    if (bassNote !== null && bassNote !== undefined) {
      this.note({
        type: music.bassType,
        frequency: midiToFrequency(root + bassNote),
        time,
        duration: stepDuration * 1.65,
        gain: 0.085,
        filter: 740,
        destination: bus,
      });
    }
    if (local === 0) {
      const padDuration = stepDuration * 14;
      for (const interval of [0, 7, 12]) {
        this.note({
          type: 'sawtooth',
          frequency: midiToFrequency(root + interval),
          time,
          duration: padDuration,
          gain: music.pad,
          filter: 900,
          attack: 0.18,
          destination: bus,
        });
      }
    }
    if (local % 2 === 1) {
      this.noiseHit({
        time,
        duration: 0.035,
        gain: 0.035,
        highpass: 6200,
        destination: bus,
      });
    }
    if (local === 0 || local === 8) {
      this.noiseHit({ time, duration: 0.09, gain: 0.05, lowpass: 220, destination: bus });
    }
  }

  note({ type = 'sine', frequency, time, duration, gain = 0.05, filter = 4000, attack = 0.008, destination = null }) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const oscillator = ctx.createOscillator();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, time);
    const lowpass = ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = filter;
    const envelope = ctx.createGain();
    envelope.gain.setValueAtTime(0.0001, time);
    envelope.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), time + attack);
    envelope.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    oscillator.connect(lowpass);
    lowpass.connect(envelope);
    envelope.connect(destination ?? this.master);
    oscillator.start(time);
    oscillator.stop(time + duration + 0.03);
  }

  noiseHit({ time, duration = 0.06, gain = 0.05, lowpass = null, highpass = null, destination = null }) {
    if (!this.ctx || !this.noiseBuffer) return;
    const ctx = this.ctx;
    const source = ctx.createBufferSource();
    source.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = lowpass ? 'lowpass' : 'highpass';
    filter.frequency.value = lowpass ?? highpass ?? 2000;
    const envelope = ctx.createGain();
    envelope.gain.setValueAtTime(0.0001, time);
    envelope.gain.exponentialRampToValueAtTime(gain, time + 0.004);
    envelope.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    source.connect(filter);
    filter.connect(envelope);
    envelope.connect(destination ?? this.master);
    source.start(time);
    source.stop(time + duration + 0.02);
  }

  // -------------------------------------------------------------- siren

  buildSiren() {
    const ctx = this.ctx;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1050;
    filter.Q.value = 1.6;
    const oscA = ctx.createOscillator();
    oscA.type = 'sawtooth';
    oscA.frequency.value = 700;
    const oscB = ctx.createOscillator();
    oscB.type = 'square';
    oscB.frequency.value = 933;
    oscB.detune.value = -8;
    const mix = ctx.createGain();
    mix.gain.value = 0.5;
    oscA.connect(mix);
    oscB.connect(mix);
    mix.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    oscA.start();
    oscB.start();
    this.siren = { gain, oscA, oscB, filter };
  }

  setSiren(level, dt = 0) {
    this.sirenLevel = Math.max(0, Math.min(1, level));
    if (!this.siren || !this.ctx) return;
    this.sirenClock += dt;
    const phase = Math.floor(this.sirenClock / 0.58) % 2;
    const target = phase === 0 ? 640 : 980;
    const now = this.ctx.currentTime;
    this.siren.oscA.frequency.setTargetAtTime(target, now, 0.03);
    this.siren.oscB.frequency.setTargetAtTime(target * 1.34, now, 0.03);
    this.siren.gain.gain.setTargetAtTime(this.sirenLevel * 0.13, now, 0.12);
  }

  // -------------------------------------------------------------- one-shots

  uiClick() {
    if (!this.ctx) return;
    const time = this.ctx.currentTime;
    this.note({ type: 'square', frequency: 780, time, duration: 0.045, gain: 0.035, filter: 2400 });
    this.note({ type: 'square', frequency: 1240, time: time + 0.028, duration: 0.05, gain: 0.026, filter: 3200 });
  }

  gunshot(kind = 'pistol') {
    if (!this.ctx) return;
    const time = this.ctx.currentTime;
    const smg = kind === 'smg';
    this.noiseHit({ time, duration: smg ? 0.12 : 0.22, gain: smg ? 0.24 : 0.34, lowpass: smg ? 2600 : 1800 });
    this.noiseHit({ time: time + 0.015, duration: 0.08, gain: 0.12, highpass: 2400 });
    this.note({
      type: 'sine',
      frequency: smg ? 150 : 110,
      time,
      duration: smg ? 0.1 : 0.16,
      gain: 0.16,
      filter: 600,
    });
  }

  impact(strength = 1) {
    if (!this.ctx) return;
    const time = this.ctx.currentTime;
    this.noiseHit({ time, duration: 0.18, gain: Math.min(0.32, 0.12 * strength), lowpass: 420 });
    this.note({ type: 'sine', frequency: 72, time, duration: 0.14, gain: Math.min(0.18, 0.08 * strength), filter: 240 });
  }

  explosion() {
    if (!this.ctx) return;
    const time = this.ctx.currentTime;
    this.noiseHit({ time, duration: 1.1, gain: 0.48, lowpass: 900 });
    this.note({ type: 'sine', frequency: 58, time, duration: 0.65, gain: 0.32, filter: 220 });
    this.note({ type: 'sawtooth', frequency: 42, time: time + 0.04, duration: 0.5, gain: 0.16, filter: 190 });
  }

  horn() {
    if (!this.ctx) return;
    const time = this.ctx.currentTime;
    for (const frequency of [392, 494]) {
      const oscillator = this.ctx.createOscillator();
      oscillator.type = 'sawtooth';
      oscillator.frequency.value = frequency;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 1200;
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.0001, time);
      gain.gain.exponentialRampToValueAtTime(0.06, time + 0.02);
      gain.gain.setValueAtTime(0.06, time + 0.3);
      gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.42);
      oscillator.connect(filter);
      filter.connect(gain);
      gain.connect(this.master);
      oscillator.start(time);
      oscillator.stop(time + 0.45);
    }
  }

  reload() {
    if (!this.ctx) return;
    const time = this.ctx.currentTime;
    this.noiseHit({ time, duration: 0.05, gain: 0.05, highpass: 3000 });
    this.noiseHit({ time: time + 0.35, duration: 0.06, gain: 0.07, highpass: 2200 });
    this.note({ type: 'square', frequency: 420, time: time + 0.6, duration: 0.04, gain: 0.03, filter: 1800 });
  }

  pickup() {
    if (!this.ctx) return;
    const time = this.ctx.currentTime;
    [660, 880, 1320].forEach((frequency, index) => {
      this.note({
        type: 'triangle',
        frequency,
        time: time + index * 0.055,
        duration: 0.12,
        gain: 0.06,
        filter: 3000,
      });
    });
  }

  hurt() {
    if (!this.ctx) return;
    const time = this.ctx.currentTime;
    this.noiseHit({ time, duration: 0.16, gain: 0.15, lowpass: 600 });
    this.note({ type: 'sine', frequency: 96, time, duration: 0.2, gain: 0.12, filter: 320 });
  }

  busted() {
    if (!this.ctx) return;
    const time = this.ctx.currentTime;
    [523, 440, 349, 262].forEach((frequency, index) => {
      this.note({
        type: 'sawtooth',
        frequency,
        time: time + index * 0.22,
        duration: 0.28,
        gain: 0.07,
        filter: 1400,
      });
    });
  }

  wasted() {
    if (!this.ctx) return;
    const time = this.ctx.currentTime;
    [196, 174, 146, 110].forEach((frequency, index) => {
      this.note({
        type: 'triangle',
        frequency,
        time: time + index * 0.26,
        duration: 0.45,
        gain: 0.09,
        filter: 900,
      });
    });
  }

  // -------------------------------------------------------------- story / UI

  missionStart() {
    if (!this.ctx) return;
    const time = this.ctx.currentTime;
    [196, 247, 294, 392].forEach((frequency, index) => {
      this.note({
        type: index === 3 ? 'triangle' : 'sawtooth',
        frequency,
        time: time + index * 0.085,
        duration: 0.22,
        gain: 0.045,
        filter: 1500,
      });
    });
    this.noiseHit({ time, duration: 0.35, gain: 0.035, lowpass: 700 });
  }

  missionComplete() {
    if (!this.ctx) return;
    const time = this.ctx.currentTime;
    [523, 659, 784, 1047].forEach((frequency, index) => {
      this.note({
        type: 'triangle',
        frequency,
        time: time + index * 0.11,
        duration: 0.32,
        gain: 0.065,
        filter: 3400,
      });
    });
    this.note({ type: 'sine', frequency: 131, time, duration: 0.4, gain: 0.05, filter: 500 });
  }

  missionFail() {
    if (!this.ctx) return;
    const time = this.ctx.currentTime;
    [330, 277, 220, 165].forEach((frequency, index) => {
      this.note({
        type: 'sawtooth',
        frequency,
        time: time + index * 0.17,
        duration: 0.26,
        gain: 0.05,
        filter: 900,
      });
    });
    this.noiseHit({ time: time + 0.2, duration: 0.5, gain: 0.07, lowpass: 400 });
  }

  reward() {
    if (!this.ctx) return;
    const time = this.ctx.currentTime;
    [880, 1175, 1568].forEach((frequency, index) => {
      this.note({
        type: 'triangle',
        frequency,
        time: time + index * 0.05,
        duration: 0.16,
        gain: 0.045,
        filter: 4200,
      });
    });
  }

  radioSwitch() {
    if (!this.ctx) return;
    const time = this.ctx.currentTime;
    this.noiseHit({ time, duration: 0.16, gain: 0.035, highpass: 900, lowpass: 3800 });
    this.note({ type: 'square', frequency: 640, time: time + 0.1, duration: 0.04, gain: 0.025, filter: 2200 });
  }

  sirenBurst() {
    if (!this.ctx) return;
    const time = this.ctx.currentTime;
    for (let i = 0; i < 2; i += 1) {
      this.note({
        type: 'sawtooth',
        frequency: i === 0 ? 620 : 780,
        time: time + i * 0.18,
        duration: 0.13,
        gain: 0.035,
        filter: 1800,
      });
    }
  }

  dispose() {
    this.stopRadio();
    window.removeEventListener('pointerdown', this._unlock);
    window.removeEventListener('keydown', this._unlock);
    if (this.ctx) this.ctx.close().catch(() => {});
    this.ctx = null;
    this.master = null;
  }
}

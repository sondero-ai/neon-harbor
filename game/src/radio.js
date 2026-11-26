// The radio front end. Two HTMLAudioElements route through the AudioSystem's
// WebAudio master so the master volume and mute apply to music too. Station
// and track changes crossfade over RADIO.crossfadeSeconds; a file that is
// missing or fails to load falls back to the station's procedural sequencer,
// and a station with neither shows OFF AIR. Nothing here starts on its own:
// main.js calls start() only after the first-gesture unlock and only outside
// deterministic shot mode.

import { RADIO } from './config.js';

const wrap = (value, length) => ((Math.round(value) % length) + length) % length;

export class RadioPlayer {
  constructor(audio, {
    stations = RADIO.stations,
    stationIndex = 0,
    trackIndex = RADIO.defaultTrack ?? 0,
    onChange = null,
  } = {}) {
    this.audio = audio;
    this.stations = stations;
    this.stationIndex = wrap(stationIndex, stations.length);
    this.trackIndex = wrap(trackIndex, this.station.tracks.length);
    this.enabled = true;
    this.mode = 'off'; // off | waiting | file | synth | offair
    this.playing = false;
    this.fallback = false;
    this.pendingReason = null;
    this.offAirStations = new Set();
    this.onChange = onChange;
    this.decks = [];
    this.activeDeck = 0;
    this.fadeSeconds = Math.max(0.05, RADIO.crossfadeSeconds ?? 0.8);
    this.token = 0;
    this.failureToken = 0;
    this.lastError = null;
    this.hiddenWasPlaying = false;
    this._visibility = () => this.onVisibility();
    document.addEventListener('visibilitychange', this._visibility);
  }

  get station() {
    return this.stations[this.stationIndex];
  }

  get track() {
    return this.station.tracks[this.trackIndex];
  }

  /** The state the HUD, save and __neon.radio all read. */
  get state() {
    const station = this.station;
    const track = this.track;
    return {
      station: station.station,
      stationId: station.id,
      stationIndex: this.stationIndex,
      short: station.short,
      genre: station.genre,
      color: station.color,
      track: track.title,
      title: track.title,
      artist: track.artist,
      index: this.trackIndex,
      trackIndex: this.trackIndex,
      trackNumber: this.trackIndex + 1,
      trackCount: station.tracks.length,
      duration: track.duration,
      enabled: this.enabled,
      playing: this.playing,
      fallback: this.fallback,
      offAir: this.mode === 'offair' || this.offAirStations.has(this.stationIndex),
      mode: this.mode,
      error: this.lastError,
    };
  }

  notify() {
    if (typeof this.onChange === 'function') this.onChange(this.state);
  }

  setEnabled(enabled, { autoplay = true } = {}) {
    const next = Boolean(enabled);
    if (this.enabled === next && this.mode !== 'off') return this.state;
    this.enabled = next;
    if (!this.enabled) {
      this.stop();
      return this.state;
    }
    if (autoplay) this.playCurrent();
    else this.notify();
    return this.state;
  }

  toggle() {
    return this.setEnabled(!this.enabled);
  }

  setStation(index, track = 0, { autoplay = true } = {}) {
    this.stationIndex = wrap(index, this.stations.length);
    this.trackIndex = wrap(track, this.station.tracks.length);
    this.pendingReason = null;
    this.token += 1;
    this.notify();
    if (this.enabled && autoplay) this.playCurrent();
    return this.state;
  }

  setTrack(index, { autoplay = true } = {}) {
    this.trackIndex = wrap(index, this.station.tracks.length);
    this.pendingReason = null;
    this.token += 1;
    this.notify();
    if (this.enabled && autoplay) this.playCurrent();
    return this.state;
  }

  nextStation(direction = 1) {
    const count = this.stations.length;
    for (let step = 1; step <= count; step += 1) {
      const index = wrap(this.stationIndex + direction * step, count);
      if (!this.offAirStations.has(index)) {
        this.setStation(index, 0);
        return true;
      }
    }
    return false;
  }

  nextTrack(direction = 1) {
    this.trackIndex = wrap(this.trackIndex + direction, this.station.tracks.length);
    this.pendingReason = null;
    this.token += 1;
    this.notify();
    if (this.enabled) this.playCurrent();
    return this.state;
  }

  /** Resume (or start) the current track. Safe to call before the unlock. */
  start() {
    if (!this.enabled) return false;
    return this.playCurrent();
  }

  stop() {
    this.token += 1;
    this.pendingReason = null;
    this.playing = false;
    this.fallback = false;
    this.mode = 'off';
    if (this.audio) this.audio.stopFallback();
    this.fadeAll(0.18, 1);
    this.notify();
  }

  /** Called every fixed step: retries playback once the context is running. */
  tick() {
    if (!this.enabled) return;
    if (!this.pendingReason) return;
    const ctx = this.audio?.ctx;
    if (!ctx || ctx.state !== 'running') return;
    if (this.pendingReason === 'fallback') {
      this.pendingReason = null;
      this.startFallback();
      return;
    }
    this.playCurrent();
  }

  // ------------------------------------------------------------- playback

  ensureDecks() {
    const ctx = this.audio?.ctx;
    const master = this.audio?.master;
    if (!ctx || !master) return false;
    if (this.decks.length === 2) return true;
    for (let i = 0; i < 2; i += 1) {
      const el = new Audio();
      el.preload = 'auto';
      el.volume = 1;
      el.addEventListener('ended', () => this.onEnded(i));
      el.addEventListener('error', () => this.onDeckError(i));
      const source = ctx.createMediaElementSource(el);
      const gain = ctx.createGain();
      gain.gain.value = 0;
      source.connect(gain);
      gain.connect(master);
      this.decks.push({ el, gain, token: 0 });
    }
    return true;
  }

  /** Start the current track file, or fall back when it cannot play. */
  playCurrent() {
    if (!this.enabled) return false;
    const ctx = this.audio?.ctx;
    if (!ctx || ctx.state !== 'running' || !this.audio.master) {
      this.mode = 'waiting';
      this.pendingReason = 'gesture';
      this.playing = false;
      this.notify();
      return false;
    }
    if (!this.ensureDecks()) return false;

    this.pendingReason = null;
    if (typeof this.audio.stopFallback === 'function') this.audio.stopFallback();

    const track = this.track;
    const token = this.token + 1;
    this.token = token;
    let deckIndex = this.activeDeck;
    if (this.mode === 'file') {
      const active = this.decks[this.activeDeck];
      if (active && !active.el.paused) deckIndex = 1 - this.activeDeck;
    }
    const deck = this.decks[deckIndex];
    const previous = this.decks[this.activeDeck];
    deck.token = token;
    const now = ctx.currentTime;
    deck.gain.gain.cancelScheduledValues(now);
    deck.gain.gain.setValueAtTime(0, now);
    deck.el.pause();
    deck.el.src = track.file;
    deck.el.load();

    this.mode = 'file';
    this.fallback = false;
    this.offAirStations.delete(this.stationIndex);
    this.lastError = null;
    this.notify();

    const remember = this.activeDeck;
    this.activeDeck = deckIndex;
    let settled = false;
    const play = deck.el.play();
    if (play && typeof play.then === 'function') {
      play.then(() => {
        if (deck.token !== token || this.token !== token) return;
        settled = true;
        this.playing = true;
        this.mode = 'file';
        this.fallback = false;
        this.fadeDeck(deck, 1, this.fadeSeconds);
        if (remember !== deckIndex) {
          this.fadeDeck(previous, 0, this.fadeSeconds);
          this.pauseLater(previous, remember, token);
        }
        this.notify();
      }).catch((error) => {
        if (deck.token !== token || this.token !== token) return;
        if (error && (error.name === 'NotAllowedError' || error.name === 'AbortError')) {
          // No trusted gesture yet: wait for the next key press or click.
          this.mode = 'waiting';
          this.playing = false;
          this.pendingReason = 'gesture';
          this.notify();
          return;
        }
        if (!settled) this.handleFailure(error);
      });
    }
    return true;
  }

  fadeDeck(deck, target, seconds) {
    const ctx = this.audio?.ctx;
    if (!ctx || !deck) return;
    const now = ctx.currentTime;
    const gain = deck.gain.gain;
    const current = Math.max(0, Math.min(1, gain.value));
    gain.cancelScheduledValues(now);
    gain.setValueAtTime(current, now);
    gain.linearRampToValueAtTime(target, now + Math.max(0.02, seconds));
  }

  pauseLater(deck, index, token) {
    if (!deck) return;
    window.setTimeout(() => {
      if (this.decks[index] !== deck) return;
      if (this.activeDeck === index && this.token === token) return;
      if (this.activeDeck !== index) deck.el.pause();
    }, this.fadeSeconds * 1000 + 120);
  }

  fadeAll(seconds, pauseAfter) {
    for (const deck of this.decks) this.fadeDeck(deck, 0, seconds);
    if (pauseAfter) {
      const token = this.token;
      window.setTimeout(() => {
        // A new tune may have started during the fade; never pause it.
        if (this.token !== token) return;
        for (const deck of this.decks) deck.el.pause();
      }, seconds * 1000 + 80);
    }
  }

  onEnded(deckIndex) {
    if (!this.enabled || this.mode !== 'file') return;
    if (deckIndex !== this.activeDeck) return;
    const deck = this.decks[deckIndex];
    if (!deck || deck.token !== this.token) return;
    this.nextTrack(1);
  }

  onDeckError(deckIndex) {
    const deck = this.decks[deckIndex];
    if (!deck || deck.token !== this.token) return;
    this.handleFailure(deck.el.error);
  }

  handleFailure(error) {
    if (this.failureToken === this.token) return;
    this.failureToken = this.token;
    this.playing = false;
    this.fadeAll(0.12, 1);
    const station = this.station;
    this.lastError = error?.message || (error ? `media error ${error.code ?? ''}`.trim() : 'load failed');
    if (station.fallbackStyle) {
      this.startFallback();
    } else {
      this.mode = 'offair';
      this.fallback = false;
      this.pendingReason = null;
      this.offAirStations.add(this.stationIndex);
      this.notify();
    }
  }

  startFallback() {
    const station = this.station;
    if (!station.fallbackStyle) {
      this.mode = 'offair';
      this.offAirStations.add(this.stationIndex);
      this.notify();
      return false;
    }
    const started = this.audio.startFallback(station.fallbackStyle, station.bpm ?? 100);
    if (!started) {
      this.mode = 'waiting';
      this.pendingReason = 'fallback';
      this.playing = false;
      this.notify();
      return false;
    }
    this.mode = 'synth';
    this.fallback = true;
    this.pendingReason = null;
    this.playing = true;
    this.notify();
    return true;
  }

  onVisibility() {
    if (document.hidden) {
      if (this.playing) this.hiddenWasPlaying = true;
      if (this.mode === 'file') this.fadeAll(0.12, 1);
      if (this.mode === 'synth' && this.audio) this.audio.stopFallback();
      this.playing = false;
      this.notify();
      return;
    }
    if (this.hiddenWasPlaying) {
      this.hiddenWasPlaying = false;
      if (!this.enabled) return;
      if (this.mode === 'synth') this.startFallback();
      else this.playCurrent();
    }
  }

  dispose() {
    document.removeEventListener('visibilitychange', this._visibility);
    this.stop();
    for (const deck of this.decks) {
      deck.el.pause();
      deck.el.removeAttribute('src');
    }
    this.decks = [];
  }
}

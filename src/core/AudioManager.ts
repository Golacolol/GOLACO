const STADIUM_SRC = `${import.meta.env.BASE_URL}audio/stadium.mp3`;
const WHISTLE_SRC = `${import.meta.env.BASE_URL}audio/whistle.mp3`;
/** Quiet under the stadium bed — short single blow, not a blast. */
const WHISTLE_VOL = 0.16;

export class AudioManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private home: GainNode | null = null;
  private away: GainNode | null = null;
  private stadium: HTMLAudioElement | null = null;
  private stadiumReady: Promise<void> | null = null;
  private whistleEl: HTMLAudioElement | null = null;
  private fadeToken = 0;
  /** True while a match session wants a stadium bed (even if currently paused/silent). */
  private matchAmbienceActive = false;
  /** True when gameplay has suspended the bed (pause menu / leaving play). */
  private stadiumSuspended = false;
  /**
   * User has clicked/pressed a key this session — browsers allow unmuted media after that.
   * Idle Simulator auto-start is gated on this, and we keep a silent bed warm.
   */
  private gestureUnlocked = false;
  private targetStadiumVol = 0.48;
  volume = 0.7;
  /** When false, SFX and stadium bed stay silent. */
  enabled = true;

  get isMatchAmbienceActive(): boolean {
    return this.matchAmbienceActive;
  }

  get isStadiumSuspended(): boolean {
    return this.stadiumSuspended;
  }

  /** True after the first click/key this page session (required for audible stadium autoplay). */
  get isGestureUnlocked(): boolean {
    return this.gestureUnlocked;
  }

  unlock(): void {
    this.gestureUnlocked = true;
    this.ensureContext();
    // Keep a silent unmuted loop running so idle Simulator kick-off only fades volume up.
    void this.warmSilentStadium();
    if (this.matchAmbienceActive && !this.stadiumSuspended) void this.retryStadiumIfNeeded();
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (this.master) this.master.gain.value = on ? this.volume : 0;
    if (!on) {
      this.haltStadiumElement();
      return;
    }
    this.ensureContext();
    if (this.gestureUnlocked) void this.warmSilentStadium();
    if (this.matchAmbienceActive && !this.stadiumSuspended) void this.playStadiumBed();
  }

  setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v));
    this.targetStadiumVol = 0.48 * this.volume;
    if (this.master && this.enabled) this.master.gain.value = this.volume;
    if (
      this.stadium &&
      this.enabled &&
      this.matchAmbienceActive &&
      !this.stadiumSuspended &&
      !this.stadium.paused
    ) {
      this.stadium.volume = this.targetStadiumVol;
    }
  }

  /**
   * Call synchronously from a click/tap handler (e.g. Start Match / Simulator)
   * so autoplay policies accept playback before kick-off async work runs.
   */
  prepareStadiumAmbience(): void {
    this.matchAmbienceActive = true;
    this.stadiumSuspended = false;
    this.ensureContext();
    if (!this.enabled) return;
    const el = this.ensureStadium();
    // Already warmed from a menu gesture — stay live at volume 0 until fade-up.
    if (!el.paused && !el.muted) {
      el.volume = 0;
      return;
    }
    el.volume = 0;
    void this.tryPlayUnmuted(el).then((started) => {
      if (!started) return;
      if (this.stadiumSuspended || !this.matchAmbienceActive) {
        // Keep warm if the user already unlocked this session.
        if (this.gestureUnlocked && this.enabled) el.volume = 0;
        else el.pause();
      }
    });
  }

  /** Start (or restart) stadium bed for a new match — play first, then fade (no decode wait). */
  async startStadiumAmbience(): Promise<void> {
    this.matchAmbienceActive = true;
    this.stadiumSuspended = false;
    this.ensureContext();
    const el = this.ensureStadium();
    if (!this.enabled) {
      this.haltStadiumElement();
      return;
    }

    if (el.paused || el.muted) {
      el.volume = 0;
      el.muted = false;
      const started = await this.tryPlayUnmuted(el);
      if (!started || this.stadiumSuspended || !this.matchAmbienceActive) return;
    }

    // Seek without blocking kick-off audio if metadata is not ready yet.
    void this.seekStadiumRandom(el).then(() => {
      if (!this.matchAmbienceActive || this.stadiumSuspended || !this.enabled) return;
      if (el.paused) void this.tryPlayUnmuted(el);
    });

    this.fadeStadiumVolume(this.targetStadiumVol, 0.85);
  }

  pauseStadiumAmbience(): void {
    this.stadiumSuspended = true;
    this.haltStadiumElement();
  }

  async resumeStadiumAmbience(): Promise<void> {
    if (!this.matchAmbienceActive || !this.enabled) return;
    this.stadiumSuspended = false;
    await this.playStadiumBed();
  }

  async retryStadiumIfNeeded(): Promise<void> {
    if (!this.matchAmbienceActive || !this.enabled || this.stadiumSuspended || !this.stadium) return;
    if (!this.stadium.paused && !this.stadium.muted && this.stadium.volume > 0.01) return;
    const el = this.stadium;
    el.muted = false;
    el.volume = Math.max(el.volume, 0);
    const started = await this.tryPlayUnmuted(el);
    if (!started || this.stadiumSuspended || !this.matchAmbienceActive) return;
    if (el.volume < this.targetStadiumVol * 0.5) this.fadeStadiumVolume(this.targetStadiumVol, 0.85);
  }

  stopStadiumAmbience(): void {
    this.matchAmbienceActive = false;
    this.stadiumSuspended = false;
    this.haltStadiumElement();
    if (!this.stadium) return;
    this.stadium.muted = false;
    this.stadium.volume = 0;
    try {
      this.stadium.currentTime = 0;
    } catch {
      /* ignore */
    }
    // Re-warm silently after leaving a match so the next idle Simulator can fade up again.
    if (this.gestureUnlocked && this.enabled) void this.warmSilentStadium();
  }

  kick(): void {
    if (!this.enabled) return;
    this.blip(180, 0.09, 0.2);
  }

  whistle(): void {
    if (!this.enabled) return;
    this.ensureContext();
    const el = this.ensureWhistle();
    el.volume = WHISTLE_VOL * this.volume;
    try {
      el.currentTime = 0;
    } catch {
      /* ignore seek race */
    }
    void el.play().catch(() => {
      // Fallback soft chirp if the sample can't start (autoplay / missing file).
      this.blip(1400, 0.22, 0.05);
    });
  }

  private ensureWhistle(): HTMLAudioElement {
    if (this.whistleEl) return this.whistleEl;
    const el = new Audio(WHISTLE_SRC);
    el.preload = "auto";
    el.volume = WHISTLE_VOL;
    this.whistleEl = el;
    return el;
  }

  goal(section: "HOME" | "AWAY"): void {
    if (!this.enabled) return;
    const node = section === "HOME" ? this.home : this.away;
    if (!this.ctx || !node) return;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.frequency.value = 220;
    g.gain.value = 0.0001;
    osc.connect(g);
    g.connect(node);
    g.gain.exponentialRampToValueAtTime(0.18, this.ctx.currentTime + 0.08);
    g.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + 1.4);
    osc.start();
    osc.stop(this.ctx.currentTime + 1.5);
  }

  ui(): void {
    if (!this.enabled) return;
    this.blip(660, 0.05, 0.08);
  }

  private ensureContext(): void {
    if (this.ctx) {
      if (this.ctx.state === "suspended") void this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.enabled ? this.volume : 0;
    this.master.connect(ctx.destination);
    this.home = ctx.createGain();
    this.away = ctx.createGain();
    this.home.gain.value = 0.4;
    this.away.gain.value = 0.28;
    this.home.connect(this.master);
    this.away.connect(this.master);
  }

  private haltStadiumElement(): void {
    this.fadeToken += 1;
    if (this.stadium && !this.stadium.paused) this.stadium.pause();
  }

  /**
   * Start (or resume) the stadium element at volume 0 while unmuted.
   * Must run inside a user-gesture stack the first time; later idle kick-offs only raise volume.
   */
  private async warmSilentStadium(): Promise<void> {
    if (!this.enabled || this.stadiumSuspended) return;
    const el = this.ensureStadium();
    await this.stadiumReady;
    if (!this.enabled || this.stadiumSuspended) return;
    // Match bed owns audible volume; keep-alive stays silent.
    if (!this.matchAmbienceActive) el.volume = 0;
    el.muted = false;
    if (!el.paused) return;
    await this.tryPlayUnmuted(el);
  }

  private async playStadiumBed(): Promise<void> {
    this.ensureContext();
    const el = this.ensureStadium();
    await this.stadiumReady;
    if (!this.matchAmbienceActive || !this.enabled || this.stadiumSuspended) return;
    el.muted = false;
    const started = await this.tryPlayUnmuted(el);
    if (!started) return;
    el.volume = this.targetStadiumVol;
  }

  private ensureStadium(): HTMLAudioElement {
    if (this.stadium) return this.stadium;
    const el = new Audio(STADIUM_SRC);
    el.loop = true;
    el.preload = "auto";
    el.volume = 0;
    this.stadium = el;
    this.stadiumReady = new Promise((resolve) => {
      if (el.readyState >= 1) {
        resolve();
        return;
      }
      const done = () => {
        el.removeEventListener("loadedmetadata", done);
        el.removeEventListener("error", done);
        resolve();
      };
      el.addEventListener("loadedmetadata", done);
      el.addEventListener("error", done);
      el.load();
    });
    return el;
  }

  private async seekStadiumRandom(el: HTMLAudioElement): Promise<void> {
    await this.stadiumReady;
    if (this.stadiumSuspended || !this.matchAmbienceActive) return;
    const dur = Number.isFinite(el.duration) && el.duration > 2 ? el.duration : 0;
    if (!(dur > 0)) return;
    const target = Math.random() * (dur - 1);
    if (Math.abs(el.currentTime - target) < 0.05) return;
    await new Promise<void>((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        el.removeEventListener("seeked", finish);
        resolve();
      };
      el.addEventListener("seeked", finish);
      try {
        el.currentTime = target;
      } catch {
        finish();
        return;
      }
      if (Math.abs(el.currentTime - target) < 0.05) {
        finish();
        return;
      }
      window.setTimeout(finish, 400);
    });
  }

  private async tryPlayUnmuted(el: HTMLAudioElement): Promise<boolean> {
    el.muted = false;
    try {
      await el.play();
      return true;
    } catch {
      return false;
    }
  }

  private fadeStadiumVolume(to: number, seconds: number): void {
    const el = this.stadium;
    if (!el) return;
    const token = ++this.fadeToken;
    const from = el.volume;
    const start = performance.now();
    const ms = Math.max(16, seconds * 1000);
    const step = (now: number) => {
      if (token !== this.fadeToken || !this.stadium || this.stadiumSuspended) return;
      const t = Math.min(1, (now - start) / ms);
      el.volume = from + (to - from) * t;
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  private blip(freq: number, dur: number, vol: number): void {
    if (!this.ctx || !this.master || !this.enabled) return;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.frequency.value = freq;
    g.gain.value = vol;
    osc.connect(g);
    g.connect(this.master);
    g.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + dur);
    osc.start();
    osc.stop(this.ctx.currentTime + dur);
  }
}

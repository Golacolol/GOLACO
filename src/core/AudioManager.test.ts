/** @vitest-environment jsdom */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { AudioManager } from "./AudioManager";

function mockStadiumAudio(): HTMLAudioElement {
  const el = {
    loop: false,
    preload: "auto",
    volume: 0,
    muted: false,
    paused: true,
    currentTime: 0,
    duration: 120,
    readyState: 4,
    play: vi.fn(async () => {
      (el as { paused: boolean }).paused = false;
    }),
    pause: vi.fn(() => {
      (el as { paused: boolean }).paused = true;
    }),
    load: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
  return el as unknown as HTMLAudioElement;
}

describe("AudioManager stadium bed", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "Audio",
      vi.fn(() => mockStadiumAudio()),
    );
    vi.stubGlobal(
      "AudioContext",
      vi.fn(() => ({
        state: "running",
        currentTime: 0,
        destination: {},
        resume: vi.fn(async () => undefined),
        createGain: () => ({
          gain: { value: 1, exponentialRampToValueAtTime: vi.fn() },
          connect: vi.fn(),
        }),
        createOscillator: () => ({
          frequency: { value: 0 },
          connect: vi.fn(),
          start: vi.fn(),
          stop: vi.fn(),
        }),
      })),
    );
  });

  it("does not restart stadium audio when enabling sound while gameplay-suspended (pause)", async () => {
    const audio = new AudioManager();
    audio.prepareStadiumAmbience();
    await audio.startStadiumAmbience();
    expect(audio.isMatchAmbienceActive).toBe(true);

    audio.pauseStadiumAmbience();
    expect(audio.isStadiumSuspended).toBe(true);

    audio.setEnabled(false);
    audio.setEnabled(true);
    expect(audio.isStadiumSuspended).toBe(true);
    const el = (audio as unknown as { stadium: HTMLAudioElement }).stadium;
    expect(el.paused).toBe(true);
  });

  it("resumes on enable during live play without waiting on decode", async () => {
    const audio = new AudioManager();
    await audio.startStadiumAmbience();
    audio.setEnabled(false);
    expect(audio.isStadiumSuspended).toBe(false);
    audio.setEnabled(true);
    await vi.waitFor(() => {
      const el = (audio as unknown as { stadium: HTMLAudioElement }).stadium;
      expect(el.paused).toBe(false);
    });
  });

  it("arms playback immediately from prepareStadiumAmbience", () => {
    const audio = new AudioManager();
    audio.prepareStadiumAmbience();
    expect(audio.isMatchAmbienceActive).toBe(true);
    const el = (audio as unknown as { stadium: HTMLAudioElement }).stadium;
    expect(el.play).toHaveBeenCalled();
  });

  it("warms a silent unmuted bed on unlock so idle kick-off only fades up", async () => {
    const audio = new AudioManager();
    expect(audio.isGestureUnlocked).toBe(false);
    audio.unlock();
    expect(audio.isGestureUnlocked).toBe(true);
    await vi.waitFor(() => {
      const el = (audio as unknown as { stadium: HTMLAudioElement }).stadium;
      expect(el).toBeTruthy();
      expect(el.paused).toBe(false);
      expect(el.muted).toBe(false);
      expect(el.volume).toBe(0);
    });

    audio.prepareStadiumAmbience();
    await audio.startStadiumAmbience();
    const el = (audio as unknown as { stadium: HTMLAudioElement }).stadium;
    expect(el.paused).toBe(false);
    expect(el.muted).toBe(false);
  });
});

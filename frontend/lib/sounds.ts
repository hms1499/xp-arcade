"use client";

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    try {
      ctx = new AudioContext();
    } catch {
      return null;
    }
  }
  return ctx;
}

function tone(
  frequency: number,
  duration: number,
  type: OscillatorType = "square",
  gain = 0.15,
  startDelay = 0,
) {
  const ac = getCtx();
  if (!ac) return;
  const osc = ac.createOscillator();
  const vol = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(frequency, ac.currentTime + startDelay);
  vol.gain.setValueAtTime(gain, ac.currentTime + startDelay);
  vol.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + startDelay + duration);
  osc.connect(vol);
  vol.connect(ac.destination);
  osc.start(ac.currentTime + startDelay);
  osc.stop(ac.currentTime + startDelay + duration);
}

/** Short blip when snake eats food */
export function playEat() {
  tone(880, 0.06, "square", 0.12);
  tone(1320, 0.06, "square", 0.10, 0.06);
}

/** Ascending 3-note jingle on game start */
export function playStart() {
  tone(523, 0.1, "triangle", 0.12, 0.0);   // C5
  tone(659, 0.1, "triangle", 0.12, 0.1);   // E5
  tone(784, 0.15, "triangle", 0.15, 0.2);  // G5
}

/** Descending buzz on game over */
export function playDead() {
  tone(440, 0.08, "sawtooth", 0.18, 0.0);
  tone(330, 0.08, "sawtooth", 0.18, 0.08);
  tone(220, 0.2, "sawtooth", 0.15, 0.16);
}

/** Classic XP-style "ding" for notifications */
export function playBalloon() {
  tone(1046, 0.05, "sine", 0.12, 0.0);  // C6
  tone(1318, 0.12, "sine", 0.10, 0.05); // E6
}

/** Short success chime for confirmed NFT */
export function playSuccess() {
  tone(523, 0.08, "triangle", 0.12, 0.0);
  tone(659, 0.08, "triangle", 0.12, 0.08);
  tone(784, 0.08, "triangle", 0.12, 0.16);
  tone(1046, 0.2, "triangle", 0.14, 0.24);
}

/** Unlock AudioContext on first user interaction (required by browsers) */
export function unlockAudio() {
  const ac = getCtx();
  if (ac && ac.state === "suspended") ac.resume();
}

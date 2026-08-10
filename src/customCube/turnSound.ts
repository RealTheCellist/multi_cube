// Short percussive "click/tock" for a committed cube turn -- synthesized
// via Web Audio API rather than an external audio file, so there's nothing
// to fetch, license, or bundle. A noise burst gives the click transient,
// a quick pitched triangle wave gives the body, both with a fast
// exponential decay envelope so it reads as a single crisp tick.
let ctx: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  // Autoplay policy suspends a freshly-created context until a user
  // gesture -- this is always called from one (a swipe/tap that just
  // committed a turn), so resuming here is safe rather than a workaround.
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

/**
 * Plays one turn-click. Called once per committed turn from
 * CustomCubeScene.ts's endTurn/undoLastMove -- deliberately NOT from
 * scramble()'s batch move loop, which applies many moves within a single
 * JS tick with no per-move visual feedback to sync a click to (would just
 * sound like one garbled burst).
 */
export function playTurnSound(): void {
  const audioCtx = getContext();
  if (!audioCtx) return;
  const now = audioCtx.currentTime;

  const bufferSize = Math.floor(audioCtx.sampleRate * 0.03);
  const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
  const noise = audioCtx.createBufferSource();
  noise.buffer = buffer;
  const noiseFilter = audioCtx.createBiquadFilter();
  noiseFilter.type = "highpass";
  noiseFilter.frequency.value = 1800;
  const noiseGain = audioCtx.createGain();
  noiseGain.gain.setValueAtTime(0.25, now);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);
  noise.connect(noiseFilter).connect(noiseGain).connect(audioCtx.destination);
  noise.start(now);
  noise.stop(now + 0.03);

  const osc = audioCtx.createOscillator();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(280, now);
  osc.frequency.exponentialRampToValueAtTime(140, now + 0.06);
  const oscGain = audioCtx.createGain();
  oscGain.gain.setValueAtTime(0.18, now);
  oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
  osc.connect(oscGain).connect(audioCtx.destination);
  osc.start(now);
  osc.stop(now + 0.08);
}

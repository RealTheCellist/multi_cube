// Short percussive rattle for a committed cube turn -- synthesized via Web
// Audio API rather than an external audio file, so there's nothing to
// fetch, license, or bundle. A real speedcube's turn sound is a dry,
// plasticky rattle/clatter (Korean: "쨜그락") -- a cluster of many small,
// irregularly-timed, irregularly-pitched noise clicks blurring together
// over ~0.15s as the internal pieces catch and settle, not two clean
// isolated ticks and not a pitched tone. The previous version used a
// pitched triangle oscillator for body (read as a synthesized game-UI
// "boop") and then two too-clean discrete clicks (read as "tick tick"
// rather than a rattle) -- replaced here with a scattered cluster of
// randomized micro-clicks plus a very brief, quiet low-frequency thump
// underneath for body.
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

// One dry noise click: a short burst of white noise through a bandpass
// filter (so it reads as a pitched-less plastic "clack" rather than a
// hiss or a hollow thump), with a fast exponential decay envelope.
function playClick(audioCtx: AudioContext, when: number, freq: number, q: number, gain: number, durationSec: number): void {
  const bufferSize = Math.max(1, Math.floor(audioCtx.sampleRate * durationSec));
  const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
  const noise = audioCtx.createBufferSource();
  noise.buffer = buffer;
  const bandpass = audioCtx.createBiquadFilter();
  bandpass.type = "bandpass";
  bandpass.frequency.value = freq;
  bandpass.Q.value = q;
  const noiseGain = audioCtx.createGain();
  noiseGain.gain.setValueAtTime(gain, when);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, when + durationSec);
  noise.connect(bandpass).connect(noiseGain).connect(audioCtx.destination);
  noise.start(when);
  noise.stop(when + durationSec);
}

// How many clicks make up one rattle, and the base spacing between them --
// close enough together (well under the ~50ms the ear needs to hear
// separate events as fully distinct) to blur into a rattle/ratchet texture
// rather than reading as N separate, countable ticks. Fixed at ~0.15s
// total (measured via offline rendering) -- CLICK_COUNT/SPACING tuned
// together rather than spacing alone, since a much wider spacing on its
// own starts reading as separate countable ticks instead of one blurred
// rattle.
const RATTLE_CLICK_COUNT = 7;
const RATTLE_CLICK_SPACING_SEC = 0.021;

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

  // A short rattle/ratchet of quick clicks (Korean: "쨜그락"/"척척척척"),
  // each landing near an even beat but with enough per-click jitter in
  // timing, pitch, and volume to sound like loose plastic catching a
  // detent rather than a robotically exact repeat. Overall amplitude
  // decays across the series so it reads as one settling event, not a
  // flat drum roll.
  for (let i = 0; i < RATTLE_CLICK_COUNT; i++) {
    const jitterSec = (Math.random() - 0.5) * 0.006;
    const when = Math.max(now, now + i * RATTLE_CLICK_SPACING_SEC + jitterSec);
    // Lower + wider bandpass than the first pass (was 2400-4200Hz, narrow
    // Q) -- that read as thin/bright. Centering lower with a broader
    // resonance and a longer decay per click gives each one more low-mid
    // body ("굵은 톤"/a thicker tone) while staying noise-based, not pitched.
    const freq = 900 + Math.random() * 900;
    const decay = 1 - i / (RATTLE_CLICK_COUNT + 1);
    const gain = (0.28 + Math.random() * 0.08) * decay;
    playClick(audioCtx, when, freq, 0.8 + Math.random() * 0.5, gain, 0.016 + Math.random() * 0.008);
  }
  // Body: a brief, quiet low-frequency thump underneath the first catch so
  // it doesn't read as thin -- lowpassed noise, not a pitched tone.
  const thumpSize = Math.floor(audioCtx.sampleRate * 0.025);
  const thumpBuffer = audioCtx.createBuffer(1, thumpSize, audioCtx.sampleRate);
  const thumpData = thumpBuffer.getChannelData(0);
  for (let i = 0; i < thumpSize; i++) thumpData[i] = Math.random() * 2 - 1;
  const thump = audioCtx.createBufferSource();
  thump.buffer = thumpBuffer;
  const thumpFilter = audioCtx.createBiquadFilter();
  thumpFilter.type = "lowpass";
  thumpFilter.frequency.value = 180;
  const thumpGain = audioCtx.createGain();
  thumpGain.gain.setValueAtTime(0.14, now);
  thumpGain.gain.exponentialRampToValueAtTime(0.001, now + 0.025);
  thump.connect(thumpFilter).connect(thumpGain).connect(audioCtx.destination);
  thump.start(now);
  thump.stop(now + 0.025);
}

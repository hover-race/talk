import { audioBus } from "./audio";
import { useTalkStore } from "./store";

/** (F1, F2) targets for a handful of vowels, in Hz. */
const VOWEL_FORMANTS: Array<[number, number]> = [
  [730, 1090], // aa
  [530, 1840], // E
  [270, 2290], // I
  [570, 840], // O
  [300, 870], // U
];

/**
 * A crude formant synthesiser used to exercise the lip sync path without a
 * Realtime session. It is not speech, but it occupies the same frequency bands
 * that speech does, which is all the analyser looks at.
 */
export function startDemoVoice(): () => void {
  const ctx = new AudioContext();
  const dest = ctx.createMediaStreamDestination();

  const glottis = ctx.createOscillator();
  glottis.type = "sawtooth";
  glottis.frequency.value = 118;

  const noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const samples = noiseBuffer.getChannelData(0);
  for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuffer;
  noise.loop = true;

  const voiced = ctx.createGain();
  voiced.gain.value = 0;
  const hiss = ctx.createGain();
  hiss.gain.value = 0;

  const f1 = ctx.createBiquadFilter();
  f1.type = "bandpass";
  f1.Q.value = 5;
  f1.frequency.value = 700;

  const f2 = ctx.createBiquadFilter();
  f2.type = "bandpass";
  f2.Q.value = 7;
  f2.frequency.value = 1200;

  const sibilance = ctx.createBiquadFilter();
  sibilance.type = "highpass";
  sibilance.frequency.value = 4000;

  const master = ctx.createGain();
  master.gain.value = 0.35;

  glottis.connect(voiced);
  voiced.connect(f1).connect(master);
  voiced.connect(f2).connect(master);
  noise.connect(hiss).connect(sibilance).connect(master);
  master.connect(dest);

  glottis.start();
  noise.start();

  const step = () => {
    const now = ctx.currentTime;
    const roll = Math.random();
    if (roll < 0.18) {
      // Word gap.
      voiced.gain.setTargetAtTime(0, now, 0.02);
      hiss.gain.setTargetAtTime(0, now, 0.02);
    } else if (roll < 0.36) {
      // Fricative.
      voiced.gain.setTargetAtTime(0.05, now, 0.02);
      hiss.gain.setTargetAtTime(0.5, now, 0.015);
    } else {
      const [a, b] =
        VOWEL_FORMANTS[Math.floor(Math.random() * VOWEL_FORMANTS.length)];
      f1.frequency.setTargetAtTime(a, now, 0.03);
      f2.frequency.setTargetAtTime(b, now, 0.03);
      glottis.frequency.setTargetAtTime(100 + Math.random() * 60, now, 0.08);
      voiced.gain.setTargetAtTime(0.9, now, 0.02);
      hiss.gain.setTargetAtTime(0, now, 0.03);
    }
  };

  step();
  const timer = window.setInterval(step, 130);

  audioBus.attachRemoteStream(dest.stream);
  useTalkStore.getState().setStatus("speaking");

  return () => {
    window.clearInterval(timer);
    glottis.stop();
    noise.stop();
    ctx.close();
    audioBus.detach();
    useTalkStore.getState().setStatus("offline");
  };
}

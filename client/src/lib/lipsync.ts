import { VISEMES, type Viseme, type VisemeWeights, zeroVisemes } from "./visemes";

/**
 * Formant-oriented frequency bands. The split points matter more than the exact
 * edges: bands 1-2 straddle F1 (mouth openness) and bands 3-4 straddle F2
 * (tongue frontness), which is what lets us place a vowel on the vowel
 * quadrilateral without knowing the phoneme.
 */
const BANDS: Array<[number, number]> = [
  [50, 200],
  [200, 400],
  [400, 800],
  [800, 1500],
  [1500, 2500],
  [2500, 4000],
  [4000, 8000],
];

/** Mouths open faster than they close; matching that asymmetry is most of what reads as real. */
const ATTACK_MS = 30;
const RELEASE_MS = 80;

const SILENCE_FLOOR = 0.015;
const SPEECH_CEIL = 0.08;

type VowelPrototype = { viseme: Viseme; openness: number; frontness: number };

/** Positions on the vowel quadrilateral, in (F1 proxy, F2 proxy) space. */
const VOWELS: VowelPrototype[] = [
  { viseme: "aa", openness: 0.85, frontness: 0.4 },
  { viseme: "E", openness: 0.55, frontness: 0.7 },
  { viseme: "I", openness: 0.2, frontness: 0.85 },
  { viseme: "O", openness: 0.65, frontness: 0.2 },
  { viseme: "U", openness: 0.25, frontness: 0.15 },
];
const VOWEL_SIGMA = 0.28;

function smoothstep(x: number, edge0: number, edge1: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** Triangular response peaking at `mid`, zero outside [lo, hi]. */
function bump(x: number, lo: number, mid: number, hi: number): number {
  if (x <= lo || x >= hi) return 0;
  return x < mid ? (x - lo) / (mid - lo) : (hi - x) / (hi - mid);
}

export type LipsyncFrame = {
  weights: VisemeWeights;
  /** Smoothed speech energy, 0..1. Drives head motion and the waveform ring. */
  envelope: number;
  /** Instantaneous band-averaged volume, 0..1. */
  volume: number;
};

export class LipsyncAnalyser {
  private analyser: AnalyserNode;
  private freq: Uint8Array<ArrayBuffer>;
  private binWidth: number;
  private source: MediaStreamAudioSourceNode | null = null;

  private bands = new Array<number>(BANDS.length).fill(0);
  private scores = {} as Record<Viseme, number>;
  private smoothed: VisemeWeights = zeroVisemes();
  private prevVolume = 0;
  private envelope = 0;

  private frame: LipsyncFrame = {
    weights: this.smoothed,
    envelope: 0,
    volume: 0,
  };

  constructor(private ctx: AudioContext, fftSize = 2048) {
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = fftSize;
    this.analyser.smoothingTimeConstant = 0;
    this.freq = new Uint8Array(new ArrayBuffer(this.analyser.frequencyBinCount));
    this.binWidth = ctx.sampleRate / fftSize;
    for (const v of VISEMES) this.scores[v] = 0;
  }

  connect(stream: MediaStream) {
    this.disconnect();
    this.source = this.ctx.createMediaStreamSource(stream);
    // Deliberately not connected to ctx.destination: the <audio> element owns playback.
    this.source.connect(this.analyser);
  }

  disconnect() {
    if (this.source) {
      this.source.disconnect();
      this.source = null;
    }
    this.reset();
  }

  reset() {
    for (const v of VISEMES) this.smoothed[v] = v === "sil" ? 1 : 0;
    this.prevVolume = 0;
    this.envelope = 0;
  }

  update(dtMs: number): LipsyncFrame {
    this.analyser.getByteFrequencyData(this.freq);

    let volume = 0;
    for (let i = 0; i < BANDS.length; i++) {
      const [lo, hi] = BANDS[i];
      const start = Math.max(0, Math.round(lo / this.binWidth));
      const end = Math.min(this.freq.length - 1, Math.round(hi / this.binWidth));
      let sum = 0;
      for (let j = start; j < end; j++) sum += this.freq[j];
      const n = Math.max(1, end - start);
      this.bands[i] = sum / n / 255;
      volume += this.bands[i];
    }
    volume /= BANDS.length;

    let weightedSum = 0;
    let magSum = 0;
    for (let i = 0; i < this.freq.length; i++) {
      const m = this.freq[i] / 255;
      magSum += m;
      weightedSum += i * this.binWidth * m;
    }
    const centroid = magSum > 0 ? weightedSum / magSum : 0;

    const dVolume = volume - this.prevVolume;
    this.prevVolume = volume;

    this.classify(volume, centroid, dVolume);

    const speech = smoothstep(volume, SILENCE_FLOOR, SPEECH_CEIL);
    let total = 0;
    for (const v of VISEMES) {
      if (v === "sil") continue;
      total += this.scores[v];
    }

    for (const v of VISEMES) {
      const target =
        v === "sil"
          ? 1 - speech
          : total > 0
            ? (this.scores[v] / total) * speech
            : 0;
      const current = this.smoothed[v];
      const tau = target > current ? ATTACK_MS : RELEASE_MS;
      const alpha = 1 - Math.exp(-dtMs / tau);
      this.smoothed[v] = current + (target - current) * alpha;
    }

    const envTau = volume > this.envelope ? 40 : 180;
    this.envelope += (volume - this.envelope) * (1 - Math.exp(-dtMs / envTau));

    this.frame.envelope = Math.min(1, this.envelope / SPEECH_CEIL);
    this.frame.volume = volume;
    return this.frame;
  }

  private classify(volume: number, centroid: number, dVolume: number) {
    const s = this.scores;
    for (const v of VISEMES) s[v] = 0;

    const [b0, b1, b2, b3, b4, b5, b6] = this.bands;
    const voiced = b0 + b1 + b2;
    const hiss = b5 + b6;
    const fric = smoothstep(hiss / (voiced + hiss + 1e-6), 0.35, 0.7);
    const vowel = 1 - fric;

    if (vowel > 0.01) {
      const openness = b2 / (b1 + b2 + 1e-6);
      const frontness = b4 / (b3 + b4 + 1e-6);
      for (const p of VOWELS) {
        const dx = openness - p.openness;
        const dy = frontness - p.frontness;
        const d2 = dx * dx + dy * dy;
        s[p.viseme] += vowel * Math.exp(-d2 / (2 * VOWEL_SIGMA * VOWEL_SIGMA));
      }
      // Nasals and approximants: voiced but dark and quiet.
      s.nn += vowel * smoothstep(1 - centroid / 2000, 0.4, 1) * (1 - openness);
      s.RR += vowel * bump(centroid, 800, 1600, 2600) * 0.6;
    }

    if (fric > 0.01) {
      s.SS += fric * smoothstep(centroid, 4500, 7000);
      s.CH += fric * bump(centroid, 3000, 4500, 6000);
      const soft = fric * bump(centroid, 2000, 3500, 5000) * (1 - smoothstep(volume, 0.03, 0.09));
      s.FF += soft * 0.6;
      s.TH += soft * 0.4;
    }

    // Plosive burst: a sharp energy rise out of near-silence. Centroid picks the place
    // of articulation, roughly bilabial -> alveolar -> velar as it climbs.
    const burst = smoothstep(dVolume, 0.02, 0.08);
    if (burst > 0) {
      s.PP += burst * (1 - smoothstep(centroid, 1500, 3000));
      s.DD += burst * bump(centroid, 2000, 4000, 6500);
      s.kk += burst * smoothstep(centroid, 3000, 5500);
    }
  }
}

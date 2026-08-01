export const VISEMES = [
  "sil",
  "PP",
  "FF",
  "TH",
  "DD",
  "kk",
  "CH",
  "SS",
  "nn",
  "RR",
  "aa",
  "E",
  "I",
  "O",
  "U",
] as const;

export type Viseme = (typeof VISEMES)[number];
export type VisemeWeights = Record<Viseme, number>;

export function zeroVisemes(): VisemeWeights {
  const w = {} as VisemeWeights;
  for (const v of VISEMES) w[v] = 0;
  w.sil = 1;
  return w;
}

/**
 * Mouth pose contributed by each viseme at full weight. Kept renderer-agnostic so
 * the same blended result can drive either procedural geometry or GLB blendshapes.
 *
 * jaw   vertical opening, 0..1
 * wide  corner spread, -1 (pucker) .. 1 (grin)
 * round lip rounding / protrusion, 0..1
 * press lips pressed together, 0..1
 * teeth upper teeth exposure, 0..1
 */
export type MouthShape = {
  jaw: number;
  wide: number;
  round: number;
  press: number;
  teeth: number;
};

export const VISEME_SHAPES: Record<Viseme, MouthShape> = {
  sil: { jaw: 0.02, wide: 0.0, round: 0.0, press: 0.15, teeth: 0.0 },
  PP: { jaw: 0.0, wide: 0.0, round: 0.05, press: 1.0, teeth: 0.0 },
  FF: { jaw: 0.12, wide: 0.2, round: 0.0, press: 0.2, teeth: 0.8 },
  TH: { jaw: 0.2, wide: 0.15, round: 0.0, press: 0.0, teeth: 0.5 },
  DD: { jaw: 0.25, wide: 0.2, round: 0.0, press: 0.0, teeth: 0.35 },
  kk: { jaw: 0.3, wide: 0.1, round: 0.05, press: 0.0, teeth: 0.2 },
  CH: { jaw: 0.18, wide: -0.2, round: 0.5, press: 0.0, teeth: 0.5 },
  SS: { jaw: 0.1, wide: 0.45, round: 0.0, press: 0.0, teeth: 0.7 },
  nn: { jaw: 0.12, wide: 0.1, round: 0.0, press: 0.5, teeth: 0.1 },
  RR: { jaw: 0.22, wide: -0.15, round: 0.45, press: 0.0, teeth: 0.1 },
  aa: { jaw: 0.85, wide: 0.15, round: 0.05, press: 0.0, teeth: 0.1 },
  E: { jaw: 0.45, wide: 0.55, round: 0.0, press: 0.0, teeth: 0.3 },
  I: { jaw: 0.25, wide: 0.7, round: 0.0, press: 0.0, teeth: 0.4 },
  O: { jaw: 0.6, wide: -0.5, round: 0.85, press: 0.0, teeth: 0.0 },
  U: { jaw: 0.3, wide: -0.7, round: 1.0, press: 0.0, teeth: 0.0 },
};

const EMPTY_SHAPE: MouthShape = {
  jaw: 0,
  wide: 0,
  round: 0,
  press: 0,
  teeth: 0,
};

export function blendMouthShape(
  weights: VisemeWeights,
  out: MouthShape = { ...EMPTY_SHAPE },
): MouthShape {
  out.jaw = 0;
  out.wide = 0;
  out.round = 0;
  out.press = 0;
  out.teeth = 0;

  let total = 0;
  for (const v of VISEMES) total += weights[v];
  if (total <= 0) return out;

  for (const v of VISEMES) {
    const w = weights[v] / total;
    if (w <= 0) continue;
    const s = VISEME_SHAPES[v];
    out.jaw += s.jaw * w;
    out.wide += s.wide * w;
    out.round += s.round * w;
    out.press += s.press * w;
    out.teeth += s.teeth * w;
  }
  return out;
}

/** Oculus viseme morph target names, as exported by Ready Player Me. */
export const VISEME_MORPH_TARGETS: Record<Viseme, string> = {
  sil: "viseme_sil",
  PP: "viseme_PP",
  FF: "viseme_FF",
  TH: "viseme_TH",
  DD: "viseme_DD",
  kk: "viseme_kk",
  CH: "viseme_CH",
  SS: "viseme_SS",
  nn: "viseme_nn",
  RR: "viseme_RR",
  aa: "viseme_aa",
  E: "viseme_E",
  I: "viseme_I",
  O: "viseme_O",
  U: "viseme_U",
};

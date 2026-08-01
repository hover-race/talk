export const HAIR_COLORS = [
  { value: "#1c1614", label: "Black" },
  { value: "#3d2a24", label: "Dark brown" },
  { value: "#6b3a24", label: "Auburn" },
  { value: "#a86b32", label: "Chestnut" },
  { value: "#d9a441", label: "Blonde" },
  { value: "#c14f34", label: "Ginger" },
  { value: "#9a9aa2", label: "Silver" },
  { value: "#a97fd6", label: "Violet" },
] as const;

export const HEAD_IDS = ["male", "female", "unicorn"] as const;
export type HeadId = (typeof HEAD_IDS)[number];

export type HeadPreset = {
  label: string;
  palette: {
    skin: string;
    skinShade: string;
    hair: string;
    lip: string;
    iris: string;
    accent: string;
  };
  skull: [number, number, number];
  eye: { x: number; y: number; z: number; r: number; iris: number; pupil: number };
  brow: {
    visible: boolean;
    y: number;
    z: number;
    thickness: number;
    length: number;
  };
  nose: {
    style: "human" | "nostrils";
    y: number;
    z: number;
    r: number;
    scale: [number, number, number];
  };
  mouth: {
    y: number;
    z: number;
    rotX: number;
    width: number;
    restHeight: number;
    tube: number;
  };
  hair: {
    visible: boolean;
    thetaLength: number;
    rotX: number;
    position: [number, number, number];
    scale: [number, number, number];
  };
  ears: "human" | "pointed" | "none";
  lashes: boolean;
  longHair: boolean;
  muzzle: boolean;
  horn: boolean;
  mane: boolean;
  /** Where the neck meets the head, so the bust lines up with different skull shapes. */
  neckY: number;
};

export const HEAD_PRESETS: Record<HeadId, HeadPreset> = {
  male: {
    label: "Male",
    palette: {
      skin: "#f0c6ae",
      skinShade: "#dda88d",
      hair: "#3d2a24",
      lip: "#c9736f",
      iris: "#3f6f7a",
      accent: "#3d2a24",
    },
    skull: [1, 1.06, 0.94],
    eye: { x: 0.4, y: 0.1, z: 0.645, r: 0.265, iris: 0.062, pupil: 0.026 },
    brow: { visible: true, y: 0.4, z: 0.79, thickness: 0.026, length: 0.22 },
    nose: { style: "human", y: -0.2, z: 0.85, r: 0.12, scale: [0.9, 1.05, 1.3] },
    mouth: { y: -0.44, z: 0.86, rotX: -0.28, width: 0.26, restHeight: 0.012, tube: 1.5 },
    hair: {
      visible: true,
      thetaLength: Math.PI * 0.38,
      rotX: -0.3,
      position: [0, 0.03, -0.1],
      scale: [1.02, 1.07, 1.0],
    },
    ears: "human",
    lashes: false,
    longHair: false,
    muzzle: false,
    horn: false,
    mane: false,
    neckY: -1.28,
  },

  female: {
    label: "Female",
    palette: {
      skin: "#f5cdb8",
      skinShade: "#e0ac93",
      hair: "#6b3a24",
      lip: "#c4605f",
      iris: "#6b5334",
      accent: "#6b3a24",
    },
    skull: [0.97, 1.05, 0.92],
    eye: { x: 0.39, y: 0.11, z: 0.625, r: 0.265, iris: 0.066, pupil: 0.028 },
    brow: { visible: true, y: 0.41, z: 0.78, thickness: 0.017, length: 0.2 },
    nose: { style: "human", y: -0.2, z: 0.83, r: 0.105, scale: [0.85, 1.0, 1.25] },
    mouth: { y: -0.44, z: 0.85, rotX: -0.28, width: 0.24, restHeight: 0.014, tube: 2.1 },
    hair: {
      visible: true,
      thetaLength: Math.PI * 0.42,
      rotX: -0.22,
      position: [0, 0.02, -0.08],
      scale: [1.05, 1.1, 1.04],
    },
    ears: "human",
    lashes: true,
    longHair: true,
    muzzle: false,
    horn: false,
    mane: false,
    neckY: -1.26,
  },

  unicorn: {
    label: "Unicorn",
    palette: {
      skin: "#f2ebf8",
      skinShade: "#dccdec",
      hair: "#a97fd6",
      lip: "#d59bb4",
      iris: "#4a3b6b",
      accent: "#f0d38a",
    },
    skull: [0.9, 0.98, 1.12],
    // Narrow skull, so the eyes have to come inboard or they break the silhouette.
    eye: { x: 0.34, y: 0.14, z: 0.825, r: 0.25, iris: 0.085, pupil: 0.042 },
    brow: { visible: false, y: 0.45, z: 0.8, thickness: 0.02, length: 0.18 },
    // Both sit on the muzzle, well forward of the skull.
    nose: { style: "nostrils", y: -0.42, z: 1.31, r: 0.045, scale: [1, 1.3, 1] },
    mouth: { y: -0.64, z: 1.35, rotX: -0.5, width: 0.19, restHeight: 0.01, tube: 1.6 },
    hair: { visible: false, thetaLength: 0, rotX: 0, position: [0, 0, 0], scale: [1, 1, 1] },
    ears: "pointed",
    lashes: true,
    longHair: false,
    muzzle: true,
    horn: true,
    mane: true,
    neckY: -1.2,
  },
};

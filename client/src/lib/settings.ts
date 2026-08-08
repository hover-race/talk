import { HAIR_COLORS, HEAD_IDS, type HeadId } from "./heads";
import { store } from "./store";

/**
 * The single source of truth for the settings the model is allowed to touch.
 * The tool schema, the human-readable description in the system prompt, the
 * validation, and the client-side apply step are all derived from this, so
 * adding a setting means adding one entry here and nothing else.
 */
type SettingSpec =
  | { type: "enum"; description: string; values: readonly string[] }
  | { type: "number"; description: string; min: number; max: number }
  | { type: "color"; description: string };

export const SETTINGS = {
  head: {
    type: "enum",
    description: "Which character your face is.",
    values: HEAD_IDS,
  },
  hairColor: {
    type: "color",
    description: "Your hair colour.",
  },
  hairLength: {
    type: "number",
    description:
      "Hair length. 0 is a bob, 1 falls to the chest. Only visible on characters with long hair.",
    min: 0,
    max: 1,
  },
} as const satisfies Record<string, SettingSpec>;

export type SettingKey = keyof typeof SETTINGS;
export type SettingValue = string | number;
export type Settings = Record<SettingKey, SettingValue>;

const SETTING_KEYS = Object.keys(SETTINGS) as SettingKey[];

/** Sentinel for "no override", since the store models that as null. */
const DEFAULT = "default";

const HEX = /^#[0-9a-f]{6}$/i;

function coerce(spec: SettingSpec, raw: unknown): SettingValue | null {
  switch (spec.type) {
    case "enum":
      return spec.values.includes(String(raw)) ? String(raw) : null;

    case "number": {
      const n = Number(raw);
      if (!Number.isFinite(n)) return null;
      return Math.min(spec.max, Math.max(spec.min, n));
    }

    case "color": {
      const value = String(raw).trim();
      if (value.toLowerCase() === DEFAULT) return DEFAULT;
      if (HEX.test(value)) return value.toLowerCase();
      const named = HAIR_COLORS.find(
        (c) => c.label.toLowerCase() === value.toLowerCase(),
      );
      return named ? named.value : null;
    }
  }
}

/** Keeps unknown keys and unusable values out, so callers only see valid settings. */
export function coerceSettings(patch: unknown): {
  values: Partial<Settings>;
  rejected: string[];
} {
  const values: Partial<Settings> = {};
  const rejected: string[] = [];
  if (!patch || typeof patch !== "object") return { values, rejected };

  for (const [key, raw] of Object.entries(patch)) {
    const spec: SettingSpec | undefined = SETTINGS[key as SettingKey];
    if (!spec) {
      rejected.push(key);
      continue;
    }
    const value = coerce(spec, raw);
    if (value === null) {
      rejected.push(key);
      continue;
    }
    values[key as SettingKey] = value;
  }
  return { values, rejected };
}

function describe(spec: SettingSpec): string {
  switch (spec.type) {
    case "enum":
      return `one of ${spec.values.join(", ")}`;
    case "number":
      return `a number between ${spec.min} and ${spec.max}`;
    case "color":
      return `a hex colour like #6b3a24, a named colour (${HAIR_COLORS.map((c) => c.label).join(", ")}), or "${DEFAULT}" for the character's own colour`;
  }
}

/** The `parameters` block of the tool definition, so the model sees enums and ranges. */
export function settingsToolParameters() {
  const properties: Record<string, Record<string, unknown>> = {};
  for (const key of SETTING_KEYS) {
    const spec: SettingSpec = SETTINGS[key];
    properties[key] =
      spec.type === "enum"
        ? { type: "string", enum: [...spec.values], description: spec.description }
        : spec.type === "number"
          ? {
              type: "number",
              minimum: spec.min,
              maximum: spec.max,
              description: spec.description,
            }
          : { type: "string", description: `${spec.description} ${describe(spec)}.` };
  }
  return {
    type: "object",
    properties,
    required: [],
    additionalProperties: false,
  };
}

/** Prose for the system prompt: every setting, its range, and where it stands now. */
export function describeSettings(current: Partial<Settings>): string {
  return SETTING_KEYS.map((key) => {
    const spec: SettingSpec = SETTINGS[key];
    const value = current[key];
    const now = value === undefined ? "" : `, currently ${value}`;
    return `- ${key}: ${spec.description} ${describe(spec)}${now}`;
  }).join("\n");
}

export function readSettings(): Settings {
  return {
    head: store.head,
    hairColor: store.hairColor ?? DEFAULT,
    hairLength: store.hairLength,
  };
}

const APPLY: Record<SettingKey, (value: SettingValue) => void> = {
  head: (v) => store.setHead(v as HeadId),
  hairColor: (v) => store.setHairColor(v === DEFAULT ? null : String(v)),
  hairLength: (v) => store.setHairLength(Number(v)),
};

export function applySettings(patch: unknown): {
  applied: Partial<Settings>;
  rejected: string[];
  settings: Settings;
} {
  const { values, rejected } = coerceSettings(patch);
  for (const key of Object.keys(values) as SettingKey[]) {
    APPLY[key](values[key]!);
  }
  return { applied: values, rejected, settings: readSettings() };
}

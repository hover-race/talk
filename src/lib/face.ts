import {
  blendMouthShape,
  zeroVisemes,
  type MouthShape,
  type VisemeWeights,
} from "./visemes";
import type { Expression, Status } from "./store";

export type FacePose = {
  mouth: MouthShape;
  /** Raw smoothed viseme weights, for rigs that have per-viseme blendshapes. */
  visemes: VisemeWeights;
  /** 0 = open, 1 = fully closed. */
  blink: number;
  browRaise: number;
  /** Inner brow lift, the concern/sadness axis. */
  browInner: number;
  smile: number;
  squint: number;
  gazeX: number;
  gazeY: number;
  headPitch: number;
  headYaw: number;
  headRoll: number;
  breath: number;
  /** Forward lean, 0..1. Rises when listening. */
  lean: number;
};

type ExpressionTarget = {
  browRaise: number;
  browInner: number;
  smile: number;
  squint: number;
};

const EXPRESSION_TARGETS: Record<Expression, ExpressionTarget> = {
  neutral: { browRaise: 0.0, browInner: 0.0, smile: 0.08, squint: 0.0 },
  happy: { browRaise: 0.25, browInner: 0.0, smile: 0.85, squint: 0.35 },
  thinking: { browRaise: -0.1, browInner: 0.35, smile: 0.0, squint: 0.25 },
  curious: { browRaise: 0.5, browInner: -0.2, smile: 0.3, squint: 0.0 },
  concerned: { browRaise: 0.1, browInner: 0.8, smile: -0.2, squint: 0.15 },
  excited: { browRaise: 0.8, browInner: 0.0, smile: 0.7, squint: -0.1 },
};

const BLINK_MIN_MS = 2000;
const BLINK_MAX_MS = 6000;
const BLINK_CLOSE_MS = 45;
const BLINK_HOLD_MS = 15;
const BLINK_OPEN_MS = 60;

const SACCADE_MIN_MS = 900;
const SACCADE_MAX_MS = 3000;

const BREATH_PERIOD_MS = 4000;

function rand(min: number, max: number) {
  return min + Math.random() * (max - min);
}

/** Exponential approach, framerate independent. */
function ease(current: number, target: number, tauMs: number, dtMs: number) {
  return current + (target - current) * (1 - Math.exp(-dtMs / tauMs));
}

export type FaceInput = {
  visemes: VisemeWeights;
  envelope: number;
  status: Status;
  expression: Expression;
  intensity: number;
};

export class FaceRig {
  private t = 0;
  private nextBlinkAt = rand(BLINK_MIN_MS, BLINK_MAX_MS);
  private blinkElapsed = -1;

  private nextSaccadeAt = rand(SACCADE_MIN_MS, SACCADE_MAX_MS);
  private gazeTargetX = 0;
  private gazeTargetY = 0;

  private prevEnvelope = 0;
  private stress = 0;
  private headNoiseSeed = Math.random() * 1000;

  private pose: FacePose = {
    mouth: { jaw: 0, wide: 0, round: 0, press: 0, teeth: 0 },
    visemes: zeroVisemes(),
    blink: 0,
    browRaise: 0,
    browInner: 0,
    smile: 0,
    squint: 0,
    gazeX: 0,
    gazeY: 0,
    headPitch: 0,
    headYaw: 0,
    headRoll: 0,
    breath: 0,
    lean: 0,
  };

  update(dtMs: number, input: FaceInput): FacePose {
    const dt = Math.min(dtMs, 100);
    this.t += dt;
    const p = this.pose;
    const { status, envelope } = input;

    p.visemes = input.visemes;
    blendMouthShape(input.visemes, p.mouth);

    this.updateBlink(dt);
    this.updateGaze(dt, status);

    // Stress = positive rate of change in loudness. Stressed syllables get a head nudge.
    const dEnv = Math.max(0, envelope - this.prevEnvelope);
    this.prevEnvelope = envelope;
    this.stress = ease(this.stress, dEnv * 6, dEnv * 6 > this.stress ? 30 : 220, dt);

    const target = EXPRESSION_TARGETS[input.expression];
    const k = 0.35 + 0.65 * input.intensity;
    const speaking = status === "speaking";
    const listening = status === "listening";

    // Loud syllables lift the brows a little; this is small but it stops the upper
    // face from looking frozen while the mouth is busy.
    const speechBrow = speaking ? this.stress * 0.25 : 0;

    p.browRaise = ease(
      p.browRaise,
      target.browRaise * k + speechBrow + (listening ? 0.2 : 0),
      300,
      dt,
    );
    p.browInner = ease(p.browInner, target.browInner * k, 300, dt);
    p.smile = ease(p.smile, target.smile * k, 300, dt);
    p.squint = ease(p.squint, target.squint * k, 300, dt);
    p.lean = ease(p.lean, listening ? 1 : 0, 400, dt);

    const s = this.t / 1000;
    const n = this.headNoiseSeed;
    // Slow multi-frequency sway so the neck never locks into a visible loop.
    let yaw = Math.sin(s * 0.31 + n) * 0.035 + Math.sin(s * 0.13 + n * 2) * 0.02;
    let pitch = Math.sin(s * 0.23 + n) * 0.025 + Math.sin(s * 0.09) * 0.015;
    let roll = Math.sin(s * 0.17 + n * 3) * 0.02;

    if (speaking) {
      pitch -= this.stress * 0.05;
      yaw += Math.sin(s * 1.7) * this.stress * 0.03;
      roll += Math.sin(s * 1.1) * this.stress * 0.02;
    }
    if (status === "thinking") {
      roll += 0.08;
      pitch -= 0.03;
    }
    if (listening) {
      pitch += 0.04;
    }
    // Head follows the eyes slightly, the way people orient toward what they look at.
    yaw += p.gazeX * 0.25;
    pitch += p.gazeY * 0.15;

    p.headYaw = ease(p.headYaw, yaw, 120, dt);
    p.headPitch = ease(p.headPitch, pitch, 120, dt);
    p.headRoll = ease(p.headRoll, roll, 200, dt);
    p.breath = Math.sin((this.t / BREATH_PERIOD_MS) * Math.PI * 2);

    return p;
  }

  private updateBlink(dt: number) {
    const p = this.pose;
    if (this.blinkElapsed >= 0) {
      this.blinkElapsed += dt;
      const e = this.blinkElapsed;
      if (e < BLINK_CLOSE_MS) {
        p.blink = e / BLINK_CLOSE_MS;
      } else if (e < BLINK_CLOSE_MS + BLINK_HOLD_MS) {
        p.blink = 1;
      } else if (e < BLINK_CLOSE_MS + BLINK_HOLD_MS + BLINK_OPEN_MS) {
        p.blink = 1 - (e - BLINK_CLOSE_MS - BLINK_HOLD_MS) / BLINK_OPEN_MS;
      } else {
        p.blink = 0;
        this.blinkElapsed = -1;
        this.nextBlinkAt = this.t + rand(BLINK_MIN_MS, BLINK_MAX_MS);
      }
      return;
    }
    if (this.t >= this.nextBlinkAt) this.blinkElapsed = 0;
  }

  private updateGaze(dt: number, status: Status) {
    const p = this.pose;
    if (this.t >= this.nextSaccadeAt) {
      if (status === "thinking") {
        // Breaking eye contact upward is the universal tell for "working on it".
        this.gazeTargetX = rand(-0.7, -0.25);
        this.gazeTargetY = rand(0.3, 0.7);
        this.nextSaccadeAt = this.t + rand(500, 1200);
      } else if (status === "listening") {
        this.gazeTargetX = rand(-0.12, 0.12);
        this.gazeTargetY = rand(-0.08, 0.1);
        this.nextSaccadeAt = this.t + rand(1200, 2600);
      } else {
        this.gazeTargetX = rand(-0.45, 0.45);
        this.gazeTargetY = rand(-0.25, 0.3);
        this.nextSaccadeAt = this.t + rand(SACCADE_MIN_MS, SACCADE_MAX_MS);
      }
    }
    // Saccades are ballistic, so this eases fast enough to look like a jump.
    p.gazeX = ease(p.gazeX, this.gazeTargetX, 28, dt);
    p.gazeY = ease(p.gazeY, this.gazeTargetY, 28, dt);
  }
}

"use client";

import { useMemo } from "react";
import { audioBus } from "./audio";
import { FaceRig, type FacePose } from "./face";
import { useTalkStore } from "./store";
import { zeroVisemes } from "./visemes";

/**
 * Per-frame face driver. Reads the store imperatively rather than by subscription:
 * at 60fps a reactive read would re-render the whole scene graph every frame.
 */
export function useFaceDriver(): (dtMs: number) => FacePose {
  return useMemo(() => {
    const rig = new FaceRig();
    const silent = zeroVisemes();

    return (dtMs: number) => {
      const frame = audioBus.analyser?.update(dtMs);
      const { status, expression, expressionIntensity } =
        useTalkStore.getState();

      return rig.update(dtMs, {
        visemes: frame?.weights ?? silent,
        envelope: frame?.envelope ?? 0,
        status,
        expression,
        intensity: expressionIntensity,
      });
    };
  }, []);
}

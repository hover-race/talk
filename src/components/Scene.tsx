"use client";

import { Suspense, useEffect } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import type { PerspectiveCamera } from "three";
import { ProceduralHead } from "./ProceduralHead";
import { GlbHead } from "./GlbHead";

const AVATAR_URL = process.env.NEXT_PUBLIC_AVATAR_URL;

/** Bounding box the head should always fit inside, in world units. */
const FRAME_WIDTH = 2.5;
const FRAME_HEIGHT = 3.3;

/**
 * Pulls the camera back until the head fits both axes. Without this a portrait
 * viewport crops to a nostril, since a fixed vertical FOV narrows horizontally
 * as the aspect ratio drops.
 */
function FitCamera() {
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const size = useThree((s) => s.size);

  useEffect(() => {
    const vFov = (camera.fov * Math.PI) / 180;
    const aspect = size.width / size.height;
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
    const distance = Math.max(
      FRAME_HEIGHT / 2 / Math.tan(vFov / 2),
      FRAME_WIDTH / 2 / Math.tan(hFov / 2),
    );
    camera.position.set(0, 0.05, distance);
    camera.updateProjectionMatrix();
  }, [camera, size]);

  return null;
}

export function Scene() {
  return (
    <Canvas
      camera={{ position: [0, 0.05, 3.4], fov: 30 }}
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: true }}
    >
      <FitCamera />
      <ambientLight intensity={0.4} />
      {/* Key */}
      <directionalLight position={[2.5, 3, 4]} intensity={2.2} color="#fff4e8" />
      {/* Cool fill, so the shadow side doesn't go muddy */}
      <directionalLight position={[-3.5, -0.5, 2]} intensity={0.7} color="#9fc4ff" />
      {/* Rim, which is what separates the head from the background */}
      <directionalLight position={[-1, 2.5, -4]} intensity={1.8} color="#ffd9b0" />

      <Suspense fallback={null}>
        {AVATAR_URL ? <GlbHead url={AVATAR_URL} /> : <ProceduralHead />}
      </Suspense>
    </Canvas>
  );
}

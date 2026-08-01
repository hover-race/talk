"use client";

import { Suspense, useEffect, useRef } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { Spherical, Vector3, type PerspectiveCamera } from "three";
import { GLB_HEADS, HEADS, isGlbHead } from "@/lib/heads";
import { useTalkStore } from "@/lib/store";
import { ProceduralHead } from "./ProceduralHead";
import { GlbHead } from "./GlbHead";

/** Bounding box the head should always fit inside, in world units. */
const FRAME_WIDTH = 2.5;
const FRAME_HEIGHT = 3.3;

const TARGET = new Vector3(0, 0.05, 0);

const VIEW_KEY = "talk-view";

/** Where the camera sits on its orbit. Distance is derived from the viewport. */
type View = { azimuth: number; polar: number };

const DEFAULT_VIEW: View = { azimuth: 0, polar: Math.PI / 2 };

function loadView(): View {
  const raw = localStorage.getItem(VIEW_KEY);
  if (!raw) return DEFAULT_VIEW;
  const { azimuth, polar } = JSON.parse(raw) as View;
  return { azimuth, polar };
}

/**
 * Pulls the camera back until the head fits both axes, then swings it around to
 * wherever the last drag left it. Without the fit a portrait viewport crops to a
 * nostril, since a fixed vertical FOV narrows horizontally as the aspect ratio
 * drops.
 */
function CameraRig() {
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const size = useThree((s) => s.size);
  const controls = useRef<React.ComponentRef<typeof OrbitControls>>(null);

  useEffect(() => {
    const vFov = (camera.fov * Math.PI) / 180;
    const aspect = size.width / size.height;
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
    const distance = Math.max(
      FRAME_HEIGHT / 2 / Math.tan(vFov / 2),
      FRAME_WIDTH / 2 / Math.tan(hFov / 2),
    );
    const { azimuth, polar } = loadView();
    camera.position
      .setFromSpherical(new Spherical(distance, polar, azimuth))
      .add(TARGET);
    camera.updateProjectionMatrix();
    controls.current?.update();
  }, [camera, size]);

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      target={TARGET}
      enablePan={false}
      enableZoom={false}
      enableDamping
      dampingFactor={0.1}
      rotateSpeed={0.5}
      // Stop short of the poles so the head never ends up upside down.
      minPolarAngle={Math.PI * 0.25}
      maxPolarAngle={Math.PI * 0.75}
      onEnd={() => {
        const c = controls.current;
        if (!c) return;
        const view: View = {
          azimuth: c.getAzimuthalAngle(),
          polar: c.getPolarAngle(),
        };
        localStorage.setItem(VIEW_KEY, JSON.stringify(view));
      }}
    />
  );
}

function Avatar() {
  const head = useTalkStore((s) => s.head);

  if (isGlbHead(head)) {
    const { url, focusY } = GLB_HEADS[head];
    return <GlbHead key={head} url={url} focusY={focusY} />;
  }

  return <ProceduralHead key={head} />;
}

export function Scene() {
  return (
    <Canvas
      camera={{ position: [0, 0.05, 3.4], fov: 30 }}
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: true }}
    >
      <CameraRig />
      <ambientLight intensity={0.4} />
      {/* Key */}
      <directionalLight position={[2.5, 3, 4]} intensity={2.2} color="#fff4e8" />
      {/* Cool fill, so the shadow side doesn't go muddy */}
      <directionalLight position={[-3.5, -0.5, 2]} intensity={0.7} color="#9fc4ff" />
      {/* Rim, which is what separates the head from the background */}
      <directionalLight position={[-1, 2.5, -4]} intensity={1.8} color="#ffd9b0" />

      <Suspense fallback={null}>
        <Avatar />
      </Suspense>
    </Canvas>
  );
}

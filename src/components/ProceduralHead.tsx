"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useFaceDriver } from "@/lib/useFace";

const SKIN = "#f0c6ae";
const SKIN_SHADE = "#dda88d";
const HAIR = "#3d2a24";
const LIP = "#c9736f";
const CAVITY = "#3a1420";
const IRIS = "#3f6f7a";

const EYE_X = 0.4;
const EYE_Y = 0.1;
/**
 * A large eyeball set deep gives the same visible opening as a small one set
 * shallow, but with far less bulge. The skull occludes everything but the cap.
 */
const EYE_Z = 0.632;
const EYE_R = 0.265;
const BROW_Y = 0.4;
const BROW_Z = 0.79;
const MOUTH_Y = -0.44;
const MOUTH_Z = 0.86;

const HEAD_SCALE_Y = 1.06;
const HEAD_SCALE_Z = 0.94;

const lerp = THREE.MathUtils.lerp;

export function ProceduralHead() {
  const drive = useFaceDriver();

  const root = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const skull = useRef<THREE.Mesh>(null);
  const eyeL = useRef<THREE.Group>(null);
  const eyeR = useRef<THREE.Group>(null);
  const lidL = useRef<THREE.Mesh>(null);
  const lidR = useRef<THREE.Mesh>(null);
  const browL = useRef<THREE.Mesh>(null);
  const browR = useRef<THREE.Mesh>(null);
  const mouth = useRef<THREE.Group>(null);
  const cavity = useRef<THREE.Mesh>(null);
  const lips = useRef<THREE.Mesh>(null);
  const teeth = useRef<THREE.Mesh>(null);
  const torso = useRef<THREE.Group>(null);
  const ring = useRef<THREE.Mesh>(null);

  const materials = useMemo(
    () => ({
      skin: new THREE.MeshStandardMaterial({
        color: SKIN,
        roughness: 0.78,
        metalness: 0,
      }),
      skinShade: new THREE.MeshStandardMaterial({
        color: SKIN_SHADE,
        roughness: 0.82,
        metalness: 0,
      }),
      hair: new THREE.MeshStandardMaterial({ color: HAIR, roughness: 0.95 }),
      sclera: new THREE.MeshStandardMaterial({
        color: "#f6f3ee",
        roughness: 0.22,
      }),
      iris: new THREE.MeshStandardMaterial({ color: IRIS, roughness: 0.18 }),
      pupil: new THREE.MeshStandardMaterial({
        color: "#100c0e",
        roughness: 0.1,
      }),
      lip: new THREE.MeshStandardMaterial({ color: LIP, roughness: 0.5 }),
      cavity: new THREE.MeshStandardMaterial({
        color: CAVITY,
        roughness: 1,
        side: THREE.DoubleSide,
      }),
      teeth: new THREE.MeshStandardMaterial({
        color: "#f7f4ee",
        roughness: 0.3,
      }),
      brow: new THREE.MeshStandardMaterial({ color: HAIR, roughness: 0.9 }),
      ring: new THREE.MeshBasicMaterial({
        color: "#7dd3fc",
        transparent: true,
        opacity: 0,
      }),
    }),
    [],
  );

  useFrame((_, delta) => {
    const pose = drive(Math.min(delta, 0.1) * 1000);
    const open = pose.mouth.jaw;

    if (head.current) {
      head.current.rotation.set(pose.headPitch, pose.headYaw, pose.headRoll);
      head.current.position.z = pose.lean * 0.12;
      head.current.position.y = 0.02 * pose.breath;
    }
    if (root.current) {
      root.current.position.z = pose.lean * 0.06;
    }

    // No jaw bone here, so a small vertical stretch plus a dropping mouth anchor
    // stands in for one. Subtle on purpose: overdoing it reads as a puppet.
    if (skull.current) {
      skull.current.scale.set(1, HEAD_SCALE_Y + open * 0.03, HEAD_SCALE_Z);
    }

    // Each eyeball rotates about its own centre, otherwise gaze slides the eyes
    // sideways across the face instead of turning them.
    for (const eye of [eyeL, eyeR]) {
      if (!eye.current) continue;
      eye.current.rotation.y = pose.gazeX * 0.45;
      eye.current.rotation.x = -pose.gazeY * 0.35;
    }

    const closed = Math.max(pose.blink, pose.squint * 0.35);
    // Even wide open the lid clips the top of the eye. A fully exposed circle of
    // sclera is the single biggest "googly eye" tell.
    const lidAngle = lerp(-0.12, 1.62, closed);
    if (lidL.current) lidL.current.rotation.x = lidAngle;
    if (lidR.current) lidR.current.rotation.x = lidAngle;

    for (const [brow, side] of [
      [browL, 1],
      [browR, -1],
    ] as const) {
      if (!brow.current) continue;
      brow.current.position.y = BROW_Y + pose.browRaise * 0.06 - pose.squint * 0.02;
      brow.current.rotation.z =
        Math.PI / 2 + side * (pose.browInner * 0.38 - pose.browRaise * 0.1);
    }

    const m = pose.mouth;
    const width = 0.26 * (1 + m.wide * 0.45) * (1 - m.round * 0.42);
    const height = (0.012 + open * 0.25) * (1 - m.press * 0.7);

    if (mouth.current) {
      mouth.current.position.y = MOUTH_Y - open * 0.06;
      mouth.current.position.z = MOUTH_Z + m.round * 0.05;
    }
    if (cavity.current) {
      cavity.current.scale.set(width * 0.95, height * 0.95, 1);
    }
    if (lips.current) {
      const tube = Math.min(width, height) * (1.5 + m.round * 0.6 + m.press * 0.8);
      lips.current.scale.set(width, height, tube);
    }
    if (teeth.current) {
      teeth.current.visible = m.teeth > 0.05 && height > 0.05;
      teeth.current.scale.set(width * 0.8, 0.02 + m.teeth * 0.05, 1);
      teeth.current.position.y = height * 0.5;
    }

    if (torso.current) {
      const breath = 1 + pose.breath * 0.012;
      torso.current.scale.set(breath, 1, breath);
    }
    if (ring.current) {
      const envelope = Math.max(0, Math.min(1, open * 1.4));
      (ring.current.material as THREE.MeshBasicMaterial).opacity =
        0.06 + envelope * 0.3;
      const s = 1 + envelope * 0.06;
      ring.current.scale.set(s, s, 1);
    }
  });

  const eye = (side: 1 | -1, ref: React.RefObject<THREE.Group | null>) => (
    <group ref={ref} position={[EYE_X * side, EYE_Y, EYE_Z]}>
      <mesh material={materials.sclera}>
        <sphereGeometry args={[EYE_R, 32, 24]} />
      </mesh>
      <mesh position={[0, 0, EYE_R * 0.86]} material={materials.iris}>
        <sphereGeometry args={[0.062, 24, 20]} />
      </mesh>
      <mesh position={[0, 0, EYE_R * 1.03]} material={materials.pupil}>
        <sphereGeometry args={[0.026, 20, 16]} />
      </mesh>
    </group>
  );

  const lid = (side: 1 | -1, ref: React.RefObject<THREE.Mesh | null>) => (
    <mesh
      ref={ref}
      position={[EYE_X * side, EYE_Y, EYE_Z]}
      material={materials.skin}
    >
      <sphereGeometry
        args={[EYE_R * 1.02, 28, 18, 0, Math.PI * 2, 0, Math.PI / 2]}
      />
    </mesh>
  );

  return (
    <group ref={root} position={[0, -0.05, 0]}>
      <mesh ref={ring} position={[0, 0.15, -1.1]} material={materials.ring}>
        <torusGeometry args={[1.7, 0.012, 8, 96]} />
      </mesh>

      <group ref={head}>
        <mesh
          ref={skull}
          material={materials.skin}
          scale={[1, HEAD_SCALE_Y, HEAD_SCALE_Z]}
        >
          <sphereGeometry args={[1, 64, 48]} />
        </mesh>

        {/* Hair cap. A bald sphere reads as alien; a hairline reads as a person.
            Tilted back so the front edge clears the brows. */}
        <mesh
          position={[0, 0.03, -0.1]}
          rotation={[-0.3, 0, 0]}
          scale={[1.02, 1.07, 1.0]}
          material={materials.hair}
        >
          <sphereGeometry args={[1.01, 56, 40, 0, Math.PI * 2, 0, Math.PI * 0.38]} />
        </mesh>

        {/* Ears */}
        {[1, -1].map((s) => (
          <mesh
            key={s}
            position={[0.99 * s, -0.05, -0.04]}
            scale={[0.42, 1.45, 0.8]}
            material={materials.skinShade}
          >
            <sphereGeometry args={[0.17, 20, 16]} />
          </mesh>
        ))}

        {/* Nose */}
        <mesh
          position={[0, -0.2, 0.85]}
          scale={[0.9, 1.05, 1.3]}
          material={materials.skin}
        >
          <sphereGeometry args={[0.12, 24, 20]} />
        </mesh>

        {/* Brows */}
        <mesh
          ref={browL}
          position={[EYE_X, BROW_Y, BROW_Z]}
          rotation={[0, 0, Math.PI / 2]}
          material={materials.brow}
        >
          <capsuleGeometry args={[0.024, 0.22, 4, 10]} />
        </mesh>
        <mesh
          ref={browR}
          position={[-EYE_X, BROW_Y, BROW_Z]}
          rotation={[0, 0, Math.PI / 2]}
          material={materials.brow}
        >
          <capsuleGeometry args={[0.024, 0.22, 4, 10]} />
        </mesh>

        {eye(1, eyeL)}
        {eye(-1, eyeR)}
        {lid(1, lidL)}
        {lid(-1, lidR)}

        {/* Mouth */}
        <group ref={mouth} position={[0, MOUTH_Y, MOUTH_Z]} rotation={[-0.28, 0, 0]}>
          <mesh ref={cavity} material={materials.cavity}>
            <circleGeometry args={[1, 40]} />
          </mesh>
          <mesh ref={teeth} position={[0, 0.1, 0.01]} material={materials.teeth}>
            <planeGeometry args={[1, 1]} />
          </mesh>
          <mesh ref={lips} material={materials.lip}>
            <torusGeometry args={[1, 0.1, 12, 48]} />
          </mesh>
        </group>
      </group>

      <group ref={torso}>
        <mesh position={[0, -1.28, -0.03]} material={materials.skinShade}>
          <cylinderGeometry args={[0.3, 0.37, 0.62, 32]} />
        </mesh>
        <mesh
          position={[0, -1.95, -0.05]}
          scale={[1.15, 0.62, 0.66]}
          material={materials.skinShade}
        >
          <sphereGeometry args={[1, 40, 28]} />
        </mesh>
      </group>
    </group>
  );
}

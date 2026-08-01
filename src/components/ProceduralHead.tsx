"use client";

import { useRef, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { HEAD_PRESETS } from "@/lib/heads";
import { useTalkStore } from "@/lib/store";
import { useFaceDriver } from "@/lib/useFace";

const lerp = THREE.MathUtils.lerp;

/**
 * Mane tufts down the crest of the unicorn's skull. The first few rise above the
 * crown, otherwise the whole mane hides behind the head in a front-on portrait.
 */
const MANE = [0, 1, 2, 3, 4, 5].map((i) => {
  const t = i / 5;
  return {
    y: 1.02 - t * 1.77,
    z: -0.2 - t * 0.8,
    r: 0.3 - t * 0.15,
  };
});

export function ProceduralHead() {
  const headId = useTalkStore((s) => s.head);
  const preset = HEAD_PRESETS[headId];
  const drive = useFaceDriver();

  const root = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const skull = useRef<THREE.Mesh>(null);
  const eyeL = useRef<THREE.Group>(null);
  const eyeR = useRef<THREE.Group>(null);
  const lidL = useRef<THREE.Mesh>(null);
  const lidR = useRef<THREE.Mesh>(null);
  const lowLidL = useRef<THREE.Mesh>(null);
  const lowLidR = useRef<THREE.Mesh>(null);
  const browL = useRef<THREE.Mesh>(null);
  const browR = useRef<THREE.Mesh>(null);
  const mouth = useRef<THREE.Group>(null);
  const cavity = useRef<THREE.Mesh>(null);
  const lips = useRef<THREE.Mesh>(null);
  const teeth = useRef<THREE.Mesh>(null);
  const torso = useRef<THREE.Group>(null);
  const ring = useRef<THREE.Mesh>(null);

  useFrame((_, delta) => {
    const pose = drive(Math.min(delta, 0.1) * 1000);
    const open = pose.mouth.jaw;
    const p = preset;

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
      skull.current.scale.set(p.skull[0], p.skull[1] + open * 0.03, p.skull[2]);
    }

    // Each eyeball rotates about its own centre, otherwise gaze slides the eyes
    // sideways across the face instead of turning them.
    for (const eye of [eyeL, eyeR]) {
      if (!eye.current) continue;
      eye.current.rotation.y = pose.gazeX * 0.45;
      eye.current.rotation.x = -pose.gazeY * 0.35;
    }

    const closed = Math.max(pose.blink, pose.squint * 0.35);
    // Upper and lower lids leave an almond opening. Without the lower one the
    // bottom of the eyeball reads as a bulge stuck on the face.
    const lidAngle = lerp(-0.38, 1.55, closed);
    if (lidL.current) lidL.current.rotation.x = lidAngle;
    if (lidR.current) lidR.current.rotation.x = lidAngle;

    const lowerAngle = -0.42 + pose.blink * 0.2 + pose.squint * 0.4;
    if (lowLidL.current) lowLidL.current.rotation.x = lowerAngle;
    if (lowLidR.current) lowLidR.current.rotation.x = lowerAngle;

    for (const [brow, side] of [
      [browL, 1],
      [browR, -1],
    ] as const) {
      if (!brow.current) continue;
      brow.current.position.y =
        p.brow.y + pose.browRaise * 0.06 - pose.squint * 0.02;
      brow.current.rotation.z =
        Math.PI / 2 + side * (pose.browInner * 0.38 - pose.browRaise * 0.1);
    }

    const m = pose.mouth;
    const width = p.mouth.width * (1 + m.wide * 0.45) * (1 - m.round * 0.42);
    const height = (p.mouth.restHeight + open * 0.25) * (1 - m.press * 0.7);

    if (mouth.current) {
      mouth.current.position.y = p.mouth.y - open * 0.06;
      mouth.current.position.z = p.mouth.z + m.round * 0.05;
    }
    if (cavity.current) {
      cavity.current.scale.set(width * 0.95, height * 0.95, 1);
    }
    if (lips.current) {
      const tube =
        Math.min(width, height) * (p.mouth.tube + m.round * 0.6 + m.press * 0.8);
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

  const { palette: c, eye: e } = preset;

  const eyeball = (side: 1 | -1, ref: RefObject<THREE.Group | null>) => (
    <group ref={ref} position={[e.x * side, e.y, e.z]}>
      <mesh>
        <sphereGeometry args={[e.r, 32, 24]} />
        <meshStandardMaterial color="#f6f3ee" roughness={0.22} />
      </mesh>
      <mesh position={[0, 0, e.r * 0.86]}>
        <sphereGeometry args={[e.iris, 24, 20]} />
        <meshStandardMaterial color={c.iris} roughness={0.18} />
      </mesh>
      <mesh position={[0, 0, e.r * 1.03]}>
        <sphereGeometry args={[e.pupil, 20, 16]} />
        <meshStandardMaterial color="#100c0e" roughness={0.1} />
      </mesh>
    </group>
  );

  const eyelid = (
    side: 1 | -1,
    upper: RefObject<THREE.Mesh | null>,
    lower: RefObject<THREE.Mesh | null>,
  ) => (
    <group position={[e.x * side, e.y, e.z]}>
      <mesh ref={upper}>
        <sphereGeometry args={[e.r * 1.02, 28, 18, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color={c.skin} roughness={0.78} />
        {/* A narrow band at the lid rim rather than a ring, so it stays hidden
            wherever the lid itself is hidden by the skull. */}
        {preset.lashes && (
          <mesh>
            <sphereGeometry
              args={[e.r * 1.04, 28, 6, 0, Math.PI * 2, Math.PI / 2 - 0.09, 0.09]}
            />
            <meshStandardMaterial color="#241a17" roughness={0.6} />
          </mesh>
        )}
      </mesh>
      <mesh ref={lower}>
        <sphereGeometry
          args={[e.r * 1.02, 28, 18, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2]}
        />
        <meshStandardMaterial color={c.skin} roughness={0.78} />
      </mesh>
    </group>
  );

  const brow = (side: 1 | -1, ref: RefObject<THREE.Mesh | null>) => (
    <mesh
      ref={ref}
      position={[e.x * side, preset.brow.y, preset.brow.z]}
      rotation={[0, 0, Math.PI / 2]}
    >
      <capsuleGeometry args={[preset.brow.thickness, preset.brow.length, 4, 10]} />
      <meshStandardMaterial color={c.accent} roughness={0.9} />
    </mesh>
  );

  return (
    <group ref={root} position={[0, -0.05, 0]}>
      <mesh ref={ring} position={[0, 0.15, -1.1]}>
        <torusGeometry args={[1.7, 0.012, 8, 96]} />
        <meshBasicMaterial color="#7dd3fc" transparent opacity={0} />
      </mesh>

      <group ref={head}>
        <mesh ref={skull} scale={preset.skull}>
          <sphereGeometry args={[1, 64, 48]} />
          <meshStandardMaterial color={c.skin} roughness={0.78} />
        </mesh>

        {/* Hair cap. A bald sphere reads as alien; a hairline reads as a person.
            Tilted back so the front edge clears the brows. */}
        {preset.hair.visible && (
          <mesh
            position={preset.hair.position}
            rotation={[preset.hair.rotX, 0, 0]}
            scale={preset.hair.scale}
          >
            <sphereGeometry
              args={[1.01, 56, 40, 0, Math.PI * 2, 0, preset.hair.thetaLength]}
            />
            <meshStandardMaterial color={c.hair} roughness={0.95} />
          </mesh>
        )}

        {preset.longHair && (
          <>
            {/* Kept well behind the face plane so it frames rather than covers. */}
            <mesh position={[0, -0.12, -0.35]} scale={[1.06, 1.12, 0.75]}>
              <sphereGeometry args={[1, 48, 32]} />
              <meshStandardMaterial color={c.hair} roughness={0.95} />
            </mesh>
            {[1, -1].map((s) => (
              <mesh
                key={s}
                position={[0.86 * s, -0.5, -0.12]}
                rotation={[0, 0, 0.08 * s]}
              >
                <capsuleGeometry args={[0.16, 0.6, 6, 16]} />
                <meshStandardMaterial color={c.hair} roughness={0.95} />
              </mesh>
            ))}
          </>
        )}

        {preset.ears === "human" &&
          [1, -1].map((s) => (
            <mesh
              key={s}
              position={[0.99 * s, -0.05, -0.04]}
              scale={[0.42, 1.45, 0.8]}
            >
              <sphereGeometry args={[0.17, 20, 16]} />
              <meshStandardMaterial color={c.skinShade} roughness={0.82} />
            </mesh>
          ))}

        {preset.ears === "pointed" &&
          [1, -1].map((s) => (
            <mesh
              key={s}
              position={[0.5 * s, 0.82, -0.12]}
              rotation={[-0.1, 0, -0.35 * s]}
            >
              <coneGeometry args={[0.15, 0.46, 16]} />
              <meshStandardMaterial color={c.skinShade} roughness={0.82} />
            </mesh>
          ))}

        {preset.muzzle && (
          <mesh position={[0, -0.55, 0.95]} scale={[0.62, 0.6, 1.0]}>
            <sphereGeometry args={[0.42, 32, 24]} />
            <meshStandardMaterial color={c.skin} roughness={0.78} />
          </mesh>
        )}

        {preset.horn && (
          <mesh position={[0, 1.25, 0.15]} rotation={[-0.22, 0, 0]}>
            <coneGeometry args={[0.11, 0.8, 12]} />
            <meshStandardMaterial
              color={c.accent}
              roughness={0.25}
              metalness={0.55}
            />
          </mesh>
        )}

        {preset.mane &&
          MANE.map((tuft, i) => (
            <mesh key={i} position={[0, tuft.y, tuft.z]} scale={[1.35, 1, 1]}>
              <sphereGeometry args={[tuft.r, 24, 18]} />
              <meshStandardMaterial color={c.hair} roughness={0.95} />
            </mesh>
          ))}

        {preset.nose.style === "human" && (
          <mesh
            position={[0, preset.nose.y, preset.nose.z]}
            scale={preset.nose.scale}
          >
            <sphereGeometry args={[preset.nose.r, 24, 20]} />
            <meshStandardMaterial color={c.skin} roughness={0.78} />
          </mesh>
        )}

        {preset.nose.style === "nostrils" &&
          [1, -1].map((s) => (
            <mesh
              key={s}
              position={[0.1 * s, preset.nose.y, preset.nose.z]}
              scale={preset.nose.scale}
            >
              <sphereGeometry args={[preset.nose.r, 16, 12]} />
              <meshStandardMaterial color="#43304f" roughness={0.9} />
            </mesh>
          ))}

        {preset.brow.visible && (
          <>
            {brow(1, browL)}
            {brow(-1, browR)}
          </>
        )}

        {eyeball(1, eyeL)}
        {eyeball(-1, eyeR)}
        {eyelid(1, lidL, lowLidL)}
        {eyelid(-1, lidR, lowLidR)}

        <group
          ref={mouth}
          position={[0, preset.mouth.y, preset.mouth.z]}
          rotation={[preset.mouth.rotX, 0, 0]}
        >
          <mesh ref={cavity}>
            <circleGeometry args={[1, 40]} />
            <meshStandardMaterial
              color="#3a1420"
              roughness={1}
              side={THREE.DoubleSide}
            />
          </mesh>
          <mesh ref={teeth} position={[0, 0.1, 0.01]}>
            <planeGeometry args={[1, 1]} />
            <meshStandardMaterial color="#f7f4ee" roughness={0.3} />
          </mesh>
          <mesh ref={lips}>
            <torusGeometry args={[1, 0.1, 12, 48]} />
            <meshStandardMaterial color={c.lip} roughness={0.5} />
          </mesh>
        </group>
      </group>

      <group ref={torso}>
        <mesh position={[0, preset.neckY, -0.03]}>
          <cylinderGeometry args={[0.3, 0.37, 0.62, 32]} />
          <meshStandardMaterial color={c.skinShade} roughness={0.82} />
        </mesh>
        <mesh position={[0, -1.95, -0.05]} scale={[1.15, 0.62, 0.66]}>
          <sphereGeometry args={[1, 40, 28]} />
          <meshStandardMaterial color={c.skinShade} roughness={0.82} />
        </mesh>
      </group>
    </group>
  );
}

"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { useFaceDriver } from "@/lib/useFace";
import { VISEMES, VISEME_MORPH_TARGETS } from "@/lib/visemes";

type MorphMesh = THREE.Mesh & {
  morphTargetDictionary: Record<string, number>;
  morphTargetInfluences: number[];
};

type Rig = { meshes: MorphMesh[]; eyeBones: THREE.Object3D[] };

function collectRig(scene: THREE.Object3D): Rig {
  const meshes: MorphMesh[] = [];
  const eyeBones: THREE.Object3D[] = [];
  scene.traverse((o) => {
    const mesh = o as MorphMesh;
    if (mesh.isMesh && mesh.morphTargetDictionary && mesh.morphTargetInfluences) {
      meshes.push(mesh);
    }
    if (o.name === "LeftEye" || o.name === "RightEye") eyeBones.push(o);
  });
  return { meshes, eyeBones };
}

/**
 * Drives an ARKit + Oculus-viseme rig, which is what Ready Player Me exports when
 * you request `?morphTargets=ARKit,Oculus Visemes`. Every morph is looked up by
 * name and skipped if absent, so a partial rig degrades instead of throwing.
 */
export function GlbHead({ url }: { url: string }) {
  const { scene } = useGLTF(url);
  const drive = useFaceDriver();
  const group = useRef<THREE.Group>(null);

  const rig = useRef<Rig | null>(null);

  useFrame((_, delta) => {
    if (!rig.current) rig.current = collectRig(scene);
    const { meshes, eyeBones } = rig.current;
    const pose = drive(Math.min(delta, 0.1) * 1000);

    const setMorph = (name: string, value: number) => {
      for (const mesh of meshes) {
        const index = mesh.morphTargetDictionary[name];
        if (index !== undefined) mesh.morphTargetInfluences[index] = value;
      }
    };

    for (const v of VISEMES) {
      setMorph(VISEME_MORPH_TARGETS[v], pose.visemes[v]);
    }

    setMorph("eyeBlinkLeft", pose.blink);
    setMorph("eyeBlinkRight", pose.blink);
    setMorph("eyeSquintLeft", Math.max(0, pose.squint));
    setMorph("eyeSquintRight", Math.max(0, pose.squint));

    const raise = Math.max(0, pose.browRaise);
    const lower = Math.max(0, -pose.browRaise);
    setMorph("browOuterUpLeft", raise);
    setMorph("browOuterUpRight", raise);
    setMorph("browDownLeft", lower);
    setMorph("browDownRight", lower);
    setMorph("browInnerUp", Math.max(0, pose.browInner));

    const smile = Math.max(0, pose.smile);
    const frown = Math.max(0, -pose.smile);
    setMorph("mouthSmileLeft", smile);
    setMorph("mouthSmileRight", smile);
    setMorph("mouthFrownLeft", frown);
    setMorph("mouthFrownRight", frown);

    for (const bone of eyeBones) {
      bone.rotation.y = pose.gazeX * 0.4;
      bone.rotation.x = -pose.gazeY * 0.3;
    }

    if (group.current) {
      group.current.rotation.set(pose.headPitch, pose.headYaw, pose.headRoll);
      group.current.position.z = pose.lean * 0.1;
      group.current.position.y = -1.55 + pose.breath * 0.01;
    }
  });

  return (
    <group ref={group} position={[0, -1.55, 0]}>
      <primitive object={scene} />
    </group>
  );
}

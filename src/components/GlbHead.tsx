"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Avatar } from "aniface";
import * as THREE from "three";
import { useFaceDriver } from "@/lib/useFace";

/** Box the loaded head is scaled into, in world units. Sits inside Scene's camera frame. */
const FIT_HEIGHT = 2.9;
const FIT_WIDTH = 2.3;

/**
 * Exaggeration per channel, in the spirit of aniface's `blendshapeMultipliers`.
 * Rigs authored for webcam tracking expect the small movements MediaPipe reports,
 * so our synthesised pose needs pushing to read at conversational distance.
 */
const GAIN = {
  blink: 1.15,
  squint: 1.3,
  wide: 1.2,
  brow: 1.4,
  smile: 1.25,
  jaw: 1.3,
  gaze: 1.2,
};

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * Drives an ARKit blendshape head through aniface's Avatar, which owns loading and
 * the morph-target cache. The weights come from our own audio analysis rather than
 * aniface's webcam tracking, so the head lip-syncs to the assistant.
 *
 * Everything is expressed in the 52 ARKit shapes, including mouth position and
 * gaze. Oculus `viseme_*` targets are deliberately not used: they only exist on
 * Ready Player Me exports that opt into them, whereas every model aniface targets
 * has the ARKit set.
 */
export function GlbHead({ url }: { url: string }) {
  const drive = useFaceDriver();
  const group = useRef<THREE.Group>(null);
  const eyeBones = useRef<THREE.Object3D[]>([]);

  // Avatar.add()s the model into whatever it is handed, so give it a container we
  // mount ourselves rather than letting it reach into the R3F root scene.
  const rig = useMemo(() => new THREE.Scene(), []);
  const avatar = useMemo(() => new Avatar(url, rig), [url, rig]);
  const blendshapes = useMemo(() => new Map<string, number>(), []);

  useEffect(() => {
    void avatar.initialize().then(() => {
      const scene = avatar.getScene();
      if (!scene) return;

      eyeBones.current = [];
      scene.traverse((o) => {
        if (o.name === "LeftEye" || o.name === "RightEye")
          eyeBones.current.push(o);
      });

      // Head models come in wildly different units, so measure rather than assume.
      const size = new THREE.Box3().setFromObject(scene).getSize(
        new THREE.Vector3(),
      );
      const fit = Math.min(FIT_HEIGHT / size.y, FIT_WIDTH / size.x);
      group.current?.scale.setScalar(fit);
    });

    return () => {
      eyeBones.current = [];
      avatar.destroy();
    };
  }, [avatar]);

  useFrame((_, delta) => {
    if (!avatar.loaded) return;
    const pose = drive(Math.min(delta, 0.1) * 1000);
    const set = (name: string, value: number) =>
      blendshapes.set(name, clamp01(value));

    const blink = pose.blink * GAIN.blink;
    set("eyeBlinkLeft", blink);
    set("eyeBlinkRight", blink);

    const squint = Math.max(0, pose.squint) * GAIN.squint;
    set("eyeSquintLeft", squint);
    set("eyeSquintRight", squint);
    // Negative squint is the excited, eyes-flung-open end of the same axis.
    const eyesWide = Math.max(0, -pose.squint) * GAIN.wide;
    set("eyeWideLeft", eyesWide);
    set("eyeWideRight", eyesWide);

    // Saccades, for rigs whose eyes are morph targets rather than bones.
    const gazeX = pose.gazeX * GAIN.gaze;
    const gazeY = pose.gazeY * GAIN.gaze;
    const gazeRight = Math.max(0, gazeX);
    const gazeLeft = Math.max(0, -gazeX);
    set("eyeLookOutLeft", gazeLeft);
    set("eyeLookInRight", gazeLeft);
    set("eyeLookOutRight", gazeRight);
    set("eyeLookInLeft", gazeRight);
    set("eyeLookUpLeft", Math.max(0, gazeY));
    set("eyeLookUpRight", Math.max(0, gazeY));
    set("eyeLookDownLeft", Math.max(0, -gazeY));
    set("eyeLookDownRight", Math.max(0, -gazeY));

    const raise = Math.max(0, pose.browRaise) * GAIN.brow;
    const lower = Math.max(0, -pose.browRaise) * GAIN.brow;
    set("browOuterUpLeft", raise);
    set("browOuterUpRight", raise);
    set("browInnerUp", Math.max(0, pose.browInner) * GAIN.brow + raise * 0.4);
    set("browDownLeft", lower);
    set("browDownRight", lower);

    // Mouth corners carry both the emotion and the spread of wide vowels.
    const mouth = pose.mouth;
    const spread = Math.max(0, mouth.wide);
    const pucker = Math.max(0, -mouth.wide);
    const smile = (Math.max(0, pose.smile) + spread * 0.35) * GAIN.smile;
    const frown = Math.max(0, -pose.smile) * GAIN.smile;
    set("mouthSmileLeft", smile);
    set("mouthSmileRight", smile);
    set("mouthDimpleLeft", smile * 0.4);
    set("mouthDimpleRight", smile * 0.4);
    set("cheekSquintLeft", smile * 0.5);
    set("cheekSquintRight", smile * 0.5);
    set("mouthFrownLeft", frown);
    set("mouthFrownRight", frown);

    set("jawOpen", mouth.jaw * GAIN.jaw);
    set("mouthFunnel", mouth.round * 0.7);
    set("mouthPucker", mouth.round * 0.5 + pucker * 0.8);
    set("mouthStretchLeft", spread * 0.6);
    set("mouthStretchRight", spread * 0.6);
    set("mouthPressLeft", mouth.press);
    set("mouthPressRight", mouth.press);
    set("mouthClose", mouth.press * 0.35);
    set("mouthUpperUpLeft", mouth.teeth * 0.5);
    set("mouthUpperUpRight", mouth.teeth * 0.5);
    set("mouthLowerDownLeft", mouth.teeth * 0.3);
    set("mouthLowerDownRight", mouth.teeth * 0.3);

    avatar.updateBlendshapes(blendshapes);

    for (const bone of eyeBones.current) {
      bone.rotation.y = pose.gazeX * 0.4;
      bone.rotation.x = -pose.gazeY * 0.3;
    }

    if (group.current) {
      group.current.rotation.set(pose.headPitch, pose.headYaw, pose.headRoll);
      group.current.position.z = pose.lean * 0.1;
      group.current.position.y = pose.breath * 0.01;
    }
  });

  return (
    <group ref={group}>
      <primitive object={rig} />
    </group>
  );
}

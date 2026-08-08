<template>
  <canvas ref="canvas" class="h-full w-full" />
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from "vue";
import * as THREE from "three";
import { Avatar } from "aniface";
import { useFaceDriver } from "@/lib/useFace";
import { useTalkStore, loadView, saveView, DEFAULT_VIEW } from "@/lib/store";
import { GLB_HEADS, isGlbHead } from "@/lib/heads";
import { blendMouthShape } from "@/lib/visemes";

const FIT_HEIGHT = 2.9;
const FIT_WIDTH = 2.3;
const TARGET_Y = 0.05;

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

const canvas = ref<HTMLCanvasElement | null>(null);
const store = useTalkStore();
const drive = useFaceDriver();

let renderer: THREE.WebGLRenderer | null = null;
let camera: THREE.PerspectiveCamera | null = null;
let scene: THREE.Scene | null = null;
let avatar: Avatar | null = null;
let raf = 0;
let eyeBones: THREE.Object3D[] = [];
const blendshapes = new Map<string, number>();

const spherical = new THREE.Spherical();
const target = new THREE.Vector3(0, TARGET_Y, 0);
let dragging = false;
let lastX = 0;
let lastY = 0;
let azimuth = DEFAULT_VIEW.azimuth;
let polar = DEFAULT_VIEW.polar;

function fitCamera() {
  if (!camera || !canvas.value) return;
  const rect = canvas.value.getBoundingClientRect();
  const aspect = rect.width / rect.height;
  const vFov = (camera.fov * Math.PI) / 180;
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
  const distance = Math.max(
    FIT_HEIGHT / 2 / Math.tan(vFov / 2),
    FIT_WIDTH / 2 / Math.tan(hFov / 2),
  );
  spherical.set(distance, polar, azimuth);
  camera.position.setFromSpherical(spherical).add(target);
  camera.lookAt(target);
  camera.updateProjectionMatrix();
}

function loadAvatar() {
  if (!scene || !isGlbHead(store.head)) return;
  const { url, focusY } = GLB_HEADS[store.head];
  console.log("loading avatar", url);

  avatar?.destroy();
  avatar = new Avatar(url, scene, { center: false, autoRotate: false, scale: 1 });
  (window as any).__avatar = avatar;
  eyeBones = [];

  avatar
    .initialize()
    .then(() => {
      console.log("avatar initialized", avatar?.loaded);
      const loaded = avatar?.getScene();
      if (!loaded || !avatar) return;

      loaded.traverse((o) => {
        if (o.name === "LeftEye" || o.name === "RightEye") eyeBones.push(o);
      });

      const box = new THREE.Box3().setFromObject(loaded);
      const size = box.getSize(new THREE.Vector3());
      const fit = Math.min(FIT_HEIGHT / size.y, FIT_WIDTH / size.x);
      loaded.scale.setScalar(fit);
      const anchorY = box.min.y + size.y * focusY;
      loaded.position.y = TARGET_Y - anchorY * fit;

      fitCamera();
    })
    .catch((err: unknown) => {
      console.error("avatar load failed", err);
    });
}

function onMouseDown(e: MouseEvent) {
  dragging = true;
  lastX = e.clientX;
  lastY = e.clientY;
}

function onMouseMove(e: MouseEvent) {
  if (!dragging) return;
  const dx = e.clientX - lastX;
  const dy = e.clientY - lastY;
  lastX = e.clientX;
  lastY = e.clientY;
  azimuth -= dx * 0.005;
  polar += dy * 0.005;
  polar = Math.max(Math.PI * 0.25, Math.min(Math.PI * 0.75, polar));
  fitCamera();
}

function onMouseUp() {
  if (dragging) {
    dragging = false;
    saveView({ azimuth, polar });
  }
}

function onResize() {
  if (!canvas.value || !camera || !renderer) return;
  const rect = canvas.value.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio, 2);
  canvas.value.width = rect.width * dpr;
  canvas.value.height = rect.height * dpr;
  renderer.setSize(rect.width, rect.height, false);
  camera.aspect = rect.width / rect.height;
  camera.updateProjectionMatrix();
  fitCamera();
}

function animate() {
  raf = requestAnimationFrame(animate);
  if (!renderer || !camera || !scene || !avatar?.loaded) return;

  const dtMs = 16;
  const pose = drive(dtMs);

  const mouth = blendMouthShape(pose.visemes);

  const set = (name: string, value: number) => blendshapes.set(name, clamp01(value));

  const blink = pose.blink * GAIN.blink;
  set("eyeBlinkLeft", blink);
  set("eyeBlinkRight", blink);

  const squint = Math.max(0, pose.squint) * GAIN.squint;
  set("eyeSquintLeft", squint);
  set("eyeSquintRight", squint);
  const eyesWide = Math.max(0, -pose.squint) * GAIN.wide;
  set("eyeWideLeft", eyesWide);
  set("eyeWideRight", eyesWide);

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

  for (const bone of eyeBones) {
    bone.rotation.y = pose.gazeX * 0.4;
    bone.rotation.x = -pose.gazeY * 0.3;
  }

  const loaded = avatar.getScene();
  if (loaded) {
    loaded.rotation.set(pose.headPitch, pose.headYaw, pose.headRoll);
    loaded.position.z = pose.lean * 0.1 + loaded.position.z; // keep fitted y
  }

  renderer.render(scene, camera);
}

onMounted(() => {
  const el = canvas.value;
  if (!el) return;

  const rect = el.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio, 2);
  el.width = rect.width * dpr;
  el.height = rect.height * dpr;

  scene = new THREE.Scene();
  (window as any).__scene = scene;
  camera = new THREE.PerspectiveCamera(30, rect.width / rect.height, 0.1, 100);

  renderer = new THREE.WebGLRenderer({ canvas: el, antialias: true, alpha: true });
  renderer.setSize(rect.width, rect.height, false);
  renderer.setPixelRatio(dpr);

  scene.add(new THREE.AmbientLight(0xffffff, 0.4));
  const key = new THREE.DirectionalLight(0xfff4e8, 2.2);
  key.position.set(2.5, 3, 4);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0x9fc4ff, 0.7);
  fill.position.set(-3.5, -0.5, 2);
  scene.add(fill);
  const rim = new THREE.DirectionalLight(0xffd9b0, 1.8);
  rim.position.set(-1, 2.5, -4);
  scene.add(rim);

  const saved = loadView();
  azimuth = saved.azimuth;
  polar = saved.polar;

  el.addEventListener("mousedown", onMouseDown);
  window.addEventListener("mousemove", onMouseMove);
  window.addEventListener("mouseup", onMouseUp);
  window.addEventListener("resize", onResize);

  loadAvatar();
  animate();
});

onUnmounted(() => {
  cancelAnimationFrame(raf);
  window.removeEventListener("resize", onResize);
  window.removeEventListener("mousemove", onMouseMove);
  window.removeEventListener("mouseup", onMouseUp);
  canvas.value?.removeEventListener("mousedown", onMouseDown);
  renderer?.dispose();
  avatar?.destroy();
});

watch(() => store.head, loadAvatar);
</script>

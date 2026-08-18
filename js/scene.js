import * as THREE from 'three';
import { RoomEnvironment } from 'roomenvironment';
import { makeCanvas, noise2D } from './utils.js';
import { EffectComposer } from '../vendor/postprocessing/EffectComposer.js';
import { RenderPass } from '../vendor/postprocessing/RenderPass.js';
import { ShaderPass } from '../vendor/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from '../vendor/postprocessing/UnrealBloomPass.js';
import { SSAOPass } from '../vendor/postprocessing/SSAOPass.js';
import { BokehPass } from '../vendor/postprocessing/BokehPass.js';
import { FilmPass } from '../vendor/postprocessing/FilmPass.js';
import { SMAAPass } from '../vendor/postprocessing/SMAAPass.js';
import { RGBShiftShader } from '../vendor/shaders/RGBShiftShader.js';
import { VignetteShader } from '../vendor/shaders/VignetteShader.js';

export const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) ||
  (navigator.maxTouchPoints > 1 && window.innerWidth < 900);
export const TEX_SIZE = isMobile ? 768 : 1024;

export const scene = new THREE.Scene();
scene.background = new THREE.Color(0x08060f);
scene.fog = new THREE.Fog(0x08060f, 16, 50);

export const camera = new THREE.PerspectiveCamera(48, window.innerWidth / window.innerHeight, 0.1, 200);
export const camBase = new THREE.Vector3(0, 6.1, 16.5);
export const camLookAt = new THREE.Vector3(0, 2.1, -1.5);
export const camFittedPos = new THREE.Vector3().copy(camBase);
camera.position.copy(camBase);
camera.lookAt(camLookAt);

export const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', stencil: false });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isMobile ? 3 : 3));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.035).texture;

/* ============================================================
   フルポストプロセッシング・パイプライン
   Bloom / SSAO / 被写界深度 / フィルムグレイン / 色収差 / ビネット / SMAA
   ============================================================ */
export const composer = new EffectComposer(renderer);
composer.setSize(window.innerWidth, window.innerHeight);
composer.setPixelRatio(renderer.getPixelRatio());

const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);

export const ssaoPass = new SSAOPass(scene, camera, window.innerWidth, window.innerHeight);
ssaoPass.kernelRadius = 0.6;
ssaoPass.minDistance = 0.0004;
ssaoPass.maxDistance = 0.15;
ssaoPass.output = SSAOPass.OUTPUT.Default;
composer.addPass(ssaoPass);

export const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.85, 0.55, 0.72);
composer.addPass(bloomPass);

export const bokehPass = new BokehPass(scene, camera, {
  focus: camBase.distanceTo(camLookAt),
  aperture: 0.00028,
  maxblur: 0.008,
});
composer.addPass(bokehPass);

const chromaPass = new ShaderPass(RGBShiftShader);
chromaPass.uniforms.amount.value = 0.0006;
composer.addPass(chromaPass);

export const filmPass = new FilmPass(0.28, 0.35, 1400, false);
composer.addPass(filmPass);

const vignettePass = new ShaderPass(VignetteShader);
vignettePass.uniforms.offset.value = 1.05;
vignettePass.uniforms.darkness.value = 1.15;
composer.addPass(vignettePass);

export const smaaPass = new SMAAPass(window.innerWidth * renderer.getPixelRatio(), window.innerHeight * renderer.getPixelRatio());
smaaPass.renderToScreen = true;
composer.addPass(smaaPass);

export let postFXEnabled = true;
export function setPostFXEnabled(on) {
  postFXEnabled = on;
}

const BASE_FOV = 48;
const BASE_ASPECT = 16 / 9;
const BASE_HALF_HFOV = Math.atan(Math.tan(THREE.MathUtils.degToRad(BASE_FOV) / 2) * BASE_ASPECT);
export function fitCameraToViewport() {
  const w = window.innerWidth, h = window.innerHeight;
  const aspect = w / h;
  camera.aspect = aspect;
  let vFov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(BASE_HALF_HFOV) / aspect));
  vFov = THREE.MathUtils.clamp(vFov, BASE_FOV, 100);
  camera.fov = vFov;
  const portraitFactor = aspect < 1 ? THREE.MathUtils.clamp(1 / aspect, 1, 2.1) : 1;
  const dist = camBase.length() * (1 + (portraitFactor - 1) * 0.22);
  const dir = camBase.clone().normalize();
  camFittedPos.copy(dir.multiplyScalar(dist));
  camera.position.copy(camFittedPos);
  camera.lookAt(camLookAt);
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  const pr = renderer.getPixelRatio();
  composer.setSize(w, h);
  composer.setPixelRatio(pr);
  ssaoPass.setSize(w, h);
  bloomPass.setSize(w, h);
  smaaPass.setSize(w * pr, h * pr);
}
fitCameraToViewport();
window.addEventListener('resize', fitCameraToViewport);
window.visualViewport && window.visualViewport.addEventListener('resize', fitCameraToViewport);
screen.orientation && screen.orientation.addEventListener('change', () => setTimeout(fitCameraToViewport, 200));

export function mountRenderer() {
  document.body.appendChild(renderer.domElement);
}

/* ---------- ライティング ---------- */
const hemi = new THREE.HemisphereLight(0x7788ff, 0x150a22, 0.55);
scene.add(hemi);
export const dirLight = new THREE.DirectionalLight(0xd8e4ff, 2.4);
dirLight.position.set(6, 13, 7);
dirLight.castShadow = true;
dirLight.shadow.mapSize.set(isMobile ? 2048 : 4096, isMobile ? 2048 : 4096);
dirLight.shadow.camera.left = -16;
dirLight.shadow.camera.right = 16;
dirLight.shadow.camera.top = 16;
dirLight.shadow.camera.bottom = -16;
dirLight.shadow.camera.near = 1;
dirLight.shadow.camera.far = 40;
dirLight.shadow.bias = -0.0015;
dirLight.shadow.radius = 3;
scene.add(dirLight);
export const bossGlow = new THREE.PointLight(0xaa22ff, 3.5, 24, 2);
bossGlow.position.set(3, 4, -4);
scene.add(bossGlow);
const rimLight = new THREE.SpotLight(0x66ddff, 4, 30, Math.PI / 5, 0.5, 1.5);
rimLight.position.set(-8, 10, -6);
scene.add(rimLight);

/* ---------- 床（結晶闘技場） ---------- */
function makeStoneTextures() {
  const size = TEX_SIZE;
  const albedoCanvas = makeCanvas(size);
  const ctx = albedoCanvas.getContext('2d');
  ctx.fillStyle = '#2a2833';
  ctx.fillRect(0, 0, size, size);
  const rnd = noise2D(7.3);
  for (let i = 0; i < 3000; i++) {
    const x = Math.random() * size, y = Math.random() * size;
    const v = rnd(x * 0.05, y * 0.05);
    const shade = 40 + v * 50;
    ctx.fillStyle = `rgba(${shade + 8},${shade + 8},${shade + 20},${0.15 + Math.random() * 0.25})`;
    const r = 2 + Math.random() * 7;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.strokeStyle = 'rgba(12,10,18,0.4)';
  for (let i = 0; i < 26; i++) {
    ctx.lineWidth = 1 + Math.random() * 2;
    ctx.beginPath();
    let x = Math.random() * size, y = Math.random() * size;
    ctx.moveTo(x, y);
    for (let j = 0; j < 6; j++) {
      x += (Math.random() - 0.5) * 80;
      y += (Math.random() - 0.5) * 80;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  // 結晶の発光脈
  for (let i = 0; i < 40; i++) {
    const x = Math.random() * size, y = Math.random() * size;
    const grad = ctx.createRadialGradient(x, y, 0, x, y, 14);
    grad.addColorStop(0, 'rgba(140,90,255,0.5)');
    grad.addColorStop(1, 'rgba(140,90,255,0)');
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(x, y, 14, 0, Math.PI * 2); ctx.fill();
  }

  const roughCanvas = makeCanvas(size);
  const rctx = roughCanvas.getContext('2d');
  rctx.fillStyle = '#999999';
  rctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 4000; i++) {
    const x = Math.random() * size, y = Math.random() * size;
    const v = Math.floor(120 + rnd(x * 0.08, y * 0.08) * 120);
    rctx.fillStyle = `rgb(${v},${v},${v})`;
    rctx.fillRect(x, y, 2, 2);
  }

  const albedo = new THREE.CanvasTexture(albedoCanvas);
  const roughness = new THREE.CanvasTexture(roughCanvas);
  [albedo, roughness].forEach(t => {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(6, 6);
    t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  });
  albedo.colorSpace = THREE.SRGBColorSpace;
  return { albedo, roughness };
}

const stoneTex = makeStoneTextures();
const floorMat = new THREE.MeshStandardMaterial({
  map: stoneTex.albedo, roughnessMap: stoneTex.roughness, roughness: 1.0, metalness: 0.05,
});
const floor = new THREE.Mesh(new THREE.CylinderGeometry(14, 14, 0.5, 64), floorMat);
floor.position.y = -0.25;
floor.receiveShadow = true;
scene.add(floor);

const ringMat = new THREE.MeshStandardMaterial({ color: 0x8844ff, emissive: 0x6622dd, emissiveIntensity: 1.2, roughness: 0.4, metalness: 0.3 });
const ring = new THREE.Mesh(new THREE.TorusGeometry(13.2, 0.15, 12, 96), ringMat);
ring.rotation.x = Math.PI / 2;
ring.position.y = 0.02;
scene.add(ring);

/* ---------- 柱＋結晶灯 ---------- */
const pillarMat = new THREE.MeshStandardMaterial({ color: 0x2a2a38, roughness: 0.75, metalness: 0.15 });
export const torchFires = [];
for (let i = 0; i < 8; i++) {
  const ang = (i / 8) * Math.PI * 2 + Math.PI / 8;
  const r = 12.5;
  const px = Math.cos(ang) * r, pz = Math.sin(ang) * r;
  const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, 5, 16), pillarMat);
  pillar.position.set(px, 2.5, pz);
  pillar.castShadow = true; pillar.receiveShadow = true;
  scene.add(pillar);

  const fireMat = new THREE.MeshStandardMaterial({ color: 0x88ccff, emissive: 0x6699ff, emissiveIntensity: 2.4, roughness: 0.2 });
  const fire = new THREE.Mesh(new THREE.OctahedronGeometry(0.28, 1), fireMat);
  fire.position.set(px, 5.3, pz);
  scene.add(fire);
  const fLight = new THREE.PointLight(0x77aaff, 1.4, 9, 2);
  fLight.position.copy(fire.position);
  scene.add(fLight);
  torchFires.push(fire);
}

/* ---------- 星空パーティクル ---------- */
{
  const starGeo = new THREE.BufferGeometry();
  const starCount = 1600;
  const positions = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    const ang = Math.random() * Math.PI * 2;
    const r = 20 + Math.random() * 22;
    positions[i * 3] = Math.cos(ang) * r;
    positions[i * 3 + 1] = Math.random() * 26 + 6;
    positions[i * 3 + 2] = Math.sin(ang) * r;
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const starMat = new THREE.PointsMaterial({ color: 0xccddff, size: 0.12, transparent: true, opacity: 0.75, sizeAttenuation: true });
  scene.add(new THREE.Points(starGeo, starMat));
}

/* ============================================================
   グラフィック品質プリセット（設定画面から切り替え可能）
   ============================================================ */
export function setQualityPreset(level) {
  let pr;
  if (level === 'high') {
    pr = Math.min(window.devicePixelRatio || 1, isMobile ? 3 : 3);
    renderer.shadowMap.enabled = true;
    dirLight.shadow.mapSize.set(isMobile ? 2048 : 4096, isMobile ? 2048 : 4096);
    dirLight.castShadow = true;
    ssaoPass.enabled = true;
    bokehPass.enabled = true;
    filmPass.enabled = true;
    smaaPass.enabled = true;
    bloomPass.strength = 0.85;
  } else if (level === 'medium') {
    pr = Math.min(window.devicePixelRatio || 1, 1.5);
    renderer.shadowMap.enabled = true;
    dirLight.shadow.mapSize.set(1024, 1024);
    dirLight.castShadow = true;
    ssaoPass.enabled = true;
    bokehPass.enabled = false;
    filmPass.enabled = true;
    smaaPass.enabled = true;
    bloomPass.strength = 0.55;
  } else {
    pr = 1;
    renderer.shadowMap.enabled = false;
    dirLight.castShadow = false;
    ssaoPass.enabled = false;
    bokehPass.enabled = false;
    filmPass.enabled = false;
    smaaPass.enabled = false;
    bloomPass.strength = 0.35;
  }
  renderer.setPixelRatio(pr);
  composer.setPixelRatio(pr);
  ssaoPass.setSize(window.innerWidth, window.innerHeight);
  bloomPass.setSize(window.innerWidth, window.innerHeight);
  smaaPass.setSize(window.innerWidth * pr, window.innerHeight * pr);
  dirLight.shadow.map && dirLight.shadow.map.dispose();
  dirLight.shadow.map = null;
}

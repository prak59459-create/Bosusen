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
scene.background = new THREE.Color(0xcfe8ff);
scene.fog = new THREE.Fog(0xdcefff, 34, 80);

export const camera = new THREE.PerspectiveCamera(48, window.innerWidth / window.innerHeight, 0.1, 200);
export const camBase = new THREE.Vector3(0, 6.1, 16.5);
export const camLookAt = new THREE.Vector3(0, 2.1, -1.5);
export const camFittedPos = new THREE.Vector3().copy(camBase);
export let cameraMode = 'battle';
export function setCameraMode(m) { cameraMode = m; }
camera.position.copy(camBase);
camera.lookAt(camLookAt);

export const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', stencil: false, preserveDrawingBuffer: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isMobile ? 3 : 3));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

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

export const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.55, 0.6, 0.88);
composer.addPass(bloomPass);

export const bokehPass = new BokehPass(scene, camera, {
  focus: camBase.distanceTo(camLookAt),
  aperture: 0.00028,
  maxblur: 0.008,
});
composer.addPass(bokehPass);

const chromaPass = new ShaderPass(RGBShiftShader);
chromaPass.uniforms.amount.value = 0.00015;
composer.addPass(chromaPass);

export const filmPass = new FilmPass(0.08, 0, 1400, false);
composer.addPass(filmPass);

const vignettePass = new ShaderPass(VignetteShader);
vignettePass.uniforms.offset.value = 1.35;
vignettePass.uniforms.darkness.value = 0.6;
composer.addPass(vignettePass);

const colorGradeShader = {
  uniforms: { tDiffuse: { value: null }, mode: { value: 0 } },
  vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform int mode;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      if (mode == 1) {
        float gray = dot(c.rgb, vec3(0.393, 0.769, 0.189));
        float gray2 = dot(c.rgb, vec3(0.349, 0.686, 0.168));
        float gray3 = dot(c.rgb, vec3(0.272, 0.534, 0.131));
        c.rgb = vec3(gray, gray2, gray3);
      } else if (mode == 2) {
        float gray = dot(c.rgb, vec3(0.299, 0.587, 0.114));
        c.rgb = vec3(gray);
      } else if (mode == 3) {
        c.rgb = pow(c.rgb, vec3(0.85)) * 1.15;
      } else if (mode == 4) {
        // 夕暮れ調: 暖色を持ち上げ、影を青に寄せる
        float lum = dot(c.rgb, vec3(0.299, 0.587, 0.114));
        c.rgb = mix(c.rgb * vec3(1.15, 0.98, 0.82), vec3(0.16, 0.20, 0.35), (1.0 - lum) * 0.35);
      } else if (mode == 5) {
        // 蒼氷調: 全体を寒色へ寄せ、少し締める
        float lum2 = dot(c.rgb, vec3(0.299, 0.587, 0.114));
        c.rgb = mix(c.rgb * vec3(0.82, 0.95, 1.18), vec3(lum2), 0.18);
      }
      gl_FragColor = c;
    }
  `,
};
export const colorGradePass = new ShaderPass(colorGradeShader);
composer.addPass(colorGradePass);
// フィルターの一覧（表示名の並び＝mode の値）。切り替え処理はこの長さに追従する。
export const PHOTO_FILTERS = ['標準', 'セピア', 'モノクロ', '鮮やか', '夕暮れ', '蒼氷'];

export function setPhotoFilter(mode) {
  colorGradePass.uniforms.mode.value = mode;
}

export const smaaPass = new SMAAPass(window.innerWidth * renderer.getPixelRatio(), window.innerHeight * renderer.getPixelRatio());
smaaPass.renderToScreen = true;
composer.addPass(smaaPass);

/* ============================================================
   原神風トゥーンシェーディング（段階的ライティング＋輪郭線）
   ============================================================ */
const TOON_STEPS = 4;
function makeGradientMap() {
  const data = new Uint8Array(TOON_STEPS);
  for (let i = 0; i < TOON_STEPS; i++) data[i] = Math.round((i / (TOON_STEPS - 1)) * 255);
  const tex = new THREE.DataTexture(data, TOON_STEPS, 1, THREE.RedFormat);
  tex.needsUpdate = true;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  return tex;
}
export const toonGradientMap = makeGradientMap();

export function makeToonMaterial(opts = {}) {
  return new THREE.MeshToonMaterial({
    gradientMap: toonGradientMap,
    color: opts.color !== undefined ? opts.color : 0xffffff,
    map: opts.map || null,
    emissive: opts.emissive !== undefined ? opts.emissive : 0x000000,
    emissiveIntensity: opts.emissiveIntensity !== undefined ? opts.emissiveIntensity : 1,
  });
}

export function toonifyMaterial(mat) {
  if (!mat) return mat;
  const t = makeToonMaterial({
    color: mat.color ? mat.color.getHex() : 0xffffff,
    map: mat.map || null,
    emissive: mat.emissive ? mat.emissive.getHex() : 0x000000,
    emissiveIntensity: mat.emissiveIntensity !== undefined ? mat.emissiveIntensity : 1,
  });
  return t;
}

export function addOutline(root, colorHex = 0x0c0a16, thickness = 0.02) {
  const shells = [];
  const meshes = [];
  root.traverse(c => { if (c.isMesh) meshes.push(c); });
  meshes.forEach(c => {
    const shellMat = new THREE.MeshBasicMaterial({ color: colorHex, side: THREE.BackSide });
    shellMat.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>\n\ttransformed += normalize(normal) * ${thickness.toFixed(4)};`
      );
    };
    if (c.isSkinnedMesh) {
      const shell = new THREE.SkinnedMesh(c.geometry, shellMat);
      shell.position.copy(c.position);
      shell.rotation.copy(c.rotation);
      shell.scale.copy(c.scale);
      shell.bind(c.skeleton, c.bindMatrix);
      shell.renderOrder = 1;
      c.parent.add(shell);
      shells.push(shell);
    } else {
      const shell = new THREE.Mesh(c.geometry, shellMat);
      shell.renderOrder = 1;
      c.add(shell);
      shells.push(shell);
    }
  });
  return shells;
}

const BASE_FOV = 48;
const BASE_ASPECT = 16 / 9;
const BASE_HALF_HFOV = Math.atan(Math.tan(THREE.MathUtils.degToRad(BASE_FOV) / 2) * BASE_ASPECT);
let baseFov = BASE_FOV;
let fovKick = 0;
export function setFovKick(amount) {
  fovKick = amount;
  camera.fov = baseFov + fovKick;
  camera.updateProjectionMatrix();
}
export function fitCameraToViewport() {
  const w = window.innerWidth, h = window.innerHeight;
  const aspect = w / h;
  camera.aspect = aspect;
  let vFov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(BASE_HALF_HFOV) / aspect));
  vFov = THREE.MathUtils.clamp(vFov, BASE_FOV, 100);
  baseFov = vFov;
  camera.fov = vFov + fovKick;
  const portraitFactor = aspect < 1 ? THREE.MathUtils.clamp(1 / aspect, 1, 2.1) : 1;
  const dist = camBase.length() * (1 + (portraitFactor - 1) * 0.22);
  const dir = camBase.clone().normalize();
  camFittedPos.copy(dir.multiplyScalar(dist));
  if (cameraMode === 'battle') {
    camera.position.copy(camFittedPos);
    camera.lookAt(camLookAt);
  }
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
// resize イベントはウィンドウ端をドラッグ中に連続発火するが、fitCameraToViewport は
// レンダーターゲットの再確保を伴う重い処理（renderer/composer/各ポストFXパスの
// setSize）のため、そのたびに呼ぶとドラッグ中にカクつく。1フレームに1回へ間引く。
let resizeScheduled = false;
function scheduleFitCameraToViewport() {
  if (resizeScheduled) return;
  resizeScheduled = true;
  requestAnimationFrame(() => { resizeScheduled = false; fitCameraToViewport(); });
}
window.addEventListener('resize', scheduleFitCameraToViewport);
window.visualViewport && window.visualViewport.addEventListener('resize', scheduleFitCameraToViewport);
screen.orientation && screen.orientation.addEventListener('change', () => setTimeout(fitCameraToViewport, 200));

export function mountRenderer() {
  document.body.appendChild(renderer.domElement);
}

/* ---------- ライティング ---------- */
const hemi = new THREE.HemisphereLight(0xffffff, 0xd8c9a0, 0.75);
scene.add(hemi);

const DAY_SKY = new THREE.Color(0xcfe8ff);
const NIGHT_SKY = new THREE.Color(0x0a0f2a);
const GOLDEN_SKY = new THREE.Color(0xff9d5c);
const _cycleColor = new THREE.Color();
export function updateDayNightCycle(t) {
  const cycle = (Math.sin(t * 0.015) + 1) / 2; // 0=夜, 1=昼。約420秒で1周
  _cycleColor.copy(NIGHT_SKY).lerp(DAY_SKY, cycle);
  const goldenAmount = Math.max(0, 1 - Math.abs(cycle - 0.42) / 0.18);
  if (goldenAmount > 0) _cycleColor.lerp(GOLDEN_SKY, goldenAmount * 0.5);
  scene.background = _cycleColor;
  if (scene.fog) scene.fog.color.copy(_cycleColor);
  hemi.intensity = 0.22 + cycle * 0.58;
  dirLight.intensity = 0.35 + cycle * 1.55;
  dirLight.color.setHSL(0.12 - goldenAmount * 0.03, 0.55 + goldenAmount * 0.2, 0.42 + cycle * 0.28);
}
export function isNightTime(t) {
  return (Math.sin(t * 0.015) + 1) / 2 < 0.3;
}
export const DAY_PERIOD_SEC = (Math.PI * 2) / 0.015;
const DAY_PERIOD = DAY_PERIOD_SEC;
export function getDayCount(t) {
  return Math.floor(t / DAY_PERIOD) + 1;
}
export function getTimeOfDayLabel(t) {
  const cycle = (Math.sin(t * 0.015) + 1) / 2;
  const rising = Math.cos(t * 0.015) < 0;
  if (cycle < 0.3) return '夜';
  if (cycle < 0.55) return rising ? '明け方' : '夕暮れ';
  return '昼';
}
export const dirLight = new THREE.DirectionalLight(0xfff6e0, 1.8);
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
  ctx.fillStyle = '#e6ddcf';
  ctx.fillRect(0, 0, size, size);
  const rnd = noise2D(7.3);
  for (let i = 0; i < 3000; i++) {
    const x = Math.random() * size, y = Math.random() * size;
    const v = rnd(x * 0.05, y * 0.05);
    const shade = 190 + v * 40;
    ctx.fillStyle = `rgba(${shade},${shade - 6},${shade - 18},${0.12 + Math.random() * 0.2})`;
    const r = 2 + Math.random() * 7;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.strokeStyle = 'rgba(160,150,135,0.35)';
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
let currentQuality = 'high';
export function isLowQuality() { return currentQuality === 'low'; }
export function setQualityPreset(level) {
  currentQuality = level;
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
    bloomPass.strength = 0.55;
  } else if (level === 'medium') {
    pr = Math.min(window.devicePixelRatio || 1, 1.5);
    renderer.shadowMap.enabled = true;
    dirLight.shadow.mapSize.set(1024, 1024);
    dirLight.castShadow = true;
    ssaoPass.enabled = true;
    bokehPass.enabled = false;
    filmPass.enabled = true;
    smaaPass.enabled = true;
    bloomPass.strength = 0.4;
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

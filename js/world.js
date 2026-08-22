import * as THREE from 'three';
import { scene, makeToonMaterial, addOutline, renderer } from './scene.js';
import { CHAPTERS } from './data.js';
import { makeCanvas } from './utils.js';
import { mergeGeometries } from 'buffergeometryutils';

/* ============================================================
   オープンワールド・ハブ ―― 数km四方の広大な大陸に4聖域・
   クエスト依頼人・遠方の討伐目標・商店を配置する
   ============================================================ */
export const HUB_OFFSET = new THREE.Vector3(0, 0, 260);
export const WORLD_RADIUS = 12000; // 半径12,000m（直径24km）の広域マップ
export const HUB_SPAWN = new THREE.Vector3(0, 0, 6);
const ZONE_DIST = WORLD_RADIUS * 0.15; // ハブから各聖域まで約1,800m
const FIELD_TARGET_DIST = 450; // 聖域からさらに数百m先に討伐目標を配置

export const worldGroup = new THREE.Group();
worldGroup.position.copy(HUB_OFFSET);
scene.add(worldGroup);

const ZONE_THEME = [
  { color: 0x2d5a3d, glow: 0x66ff88, name: '崩壊の古城' },
  { color: 0x1f6b3a, glow: 0xaaff33, name: '結晶の森' },
  { color: 0x4a1f7a, glow: 0x9955ff, name: '浸食された地下都市' },
  { color: 0x5c2436, glow: 0xff4444, name: '虚無の塔' },
];

function zoneAngle(i) {
  return (i / CHAPTERS.length) * Math.PI * 2 - Math.PI / 2;
}

export function zoneLocalPos(i) {
  const ang = zoneAngle(i);
  return new THREE.Vector3(Math.cos(ang) * ZONE_DIST, 0, Math.sin(ang) * ZONE_DIST);
}

/* ============================================================
   35のバイオーム ―― 大自然・砂漠・サイバー都市など多彩な地帯を
   世界中にランダムに散りばめ、地面の色と植生を大きく変化させる
   ============================================================ */
const BIOME_DEFS = [
  { name: '青緑の草原', color: 0x4a8a3f, category: 'forest' },
  { name: '深緑の大森林', color: 0x2c5c2a, category: 'forest' },
  { name: '黄金の丘陵', color: 0x9aa03a, category: 'forest' },
  { name: '花咲く高原', color: 0x6bb04a, category: 'forest' },
  { name: '霧の針葉樹林', color: 0x35594a, category: 'forest' },
  { name: '紅葉の森', color: 0x9a4a2a, category: 'forest' },
  { name: '苔むした渓谷', color: 0x3c6b3c, category: 'forest' },
  { name: '乾いた大砂漠', color: 0xd8b168, category: 'desert' },
  { name: '赤土の荒野', color: 0xc07a45, category: 'desert' },
  { name: '塩の平原', color: 0xdcd3b8, category: 'desert' },
  { name: '黄砂の丘', color: 0xcaa25a, category: 'desert' },
  { name: '砕けた岩漠', color: 0xa8875f, category: 'desert' },
  { name: 'ネオン都市の外郭', color: 0x2233aa, category: 'cyber' },
  { name: '電脳工業地帯', color: 0x224455, category: 'cyber' },
  { name: 'サイバー廃墟街', color: 0x442266, category: 'cyber' },
  { name: '光る回路平野', color: 0x1a3a6a, category: 'cyber' },
  { name: 'ホロ広告の荒地', color: 0x662255, category: 'cyber' },
  { name: '凍てつく雪原', color: 0xdbe6ec, category: 'snow' },
  { name: '氷結した山麓', color: 0xb8ccdc, category: 'snow' },
  { name: '白銀のツンドラ', color: 0xc8d8d4, category: 'snow' },
  { name: '極寒の凍土', color: 0xa0bcc8, category: 'snow' },
  { name: '瘴気の沼地', color: 0x445a34, category: 'swamp' },
  { name: '腐れ木の湿原', color: 0x384a2c, category: 'swamp' },
  { name: '毒沼の窪地', color: 0x4a6a2e, category: 'swamp' },
  { name: '灼熱の溶岩地帯', color: 0x6a2216, category: 'volcanic' },
  { name: '噴煙の火山麓', color: 0x502218, category: 'volcanic' },
  { name: '赤熱の亀裂地', color: 0x7a2a12, category: 'volcanic' },
  { name: '紫水晶の洞野', color: 0x6a3aa0, category: 'crystal' },
  { name: '蒼晶の輝原', color: 0x2a6aa0, category: 'crystal' },
  { name: '虹晶の断層', color: 0x9a4aa0, category: 'crystal' },
  { name: '灰燼の死地', color: 0x5a5248, category: 'wasteland' },
  { name: '朽ちた荒野', color: 0x6a5a48, category: 'wasteland' },
  { name: '崩落した廃土', color: 0x4a4238, category: 'wasteland' },
  { name: '珊瑚色の岩場', color: 0xd06a7a, category: 'crystal' },
  { name: '常春の楽園', color: 0x5ac06a, category: 'forest' },
];
const BIOME_SEEDS = BIOME_DEFS.map(() => {
  const r = 0.2 + Math.random() * 0.72;
  const ang = Math.random() * Math.PI * 2;
  return { x: Math.cos(ang) * r * WORLD_RADIUS, z: Math.sin(ang) * r * WORLD_RADIUS };
});
export function nearestBiome(x, z) {
  let best = -1, bestD = Infinity;
  for (let i = 0; i < BIOME_SEEDS.length; i++) {
    const s = BIOME_SEEDS[i];
    const d = (x - s.x) * (x - s.x) + (z - s.z) * (z - s.z);
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}
export function biomeNameAt(x, z) {
  const idx = nearestBiome(x, z);
  return idx >= 0 ? BIOME_DEFS[idx].name : '';
}
export function biomeCategoryAt(x, z) {
  const idx = nearestBiome(x, z);
  return idx >= 0 ? BIOME_DEFS[idx].category : '';
}

/* ---------- 地面（広域タイル張りテクスチャ） ---------- */
function buildTileTexture() {
  const size = 2048;
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext('2d');

  // ベースの大域的な色ムラ（大きな草地パッチ）
  ctx.fillStyle = '#bfe0a0';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 26; i++) {
    const cx = Math.random() * size, cy = Math.random() * size;
    const r = 140 + Math.random() * 260;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    const tint = Math.random() > 0.5 ? '160,200,120' : '190,220,150';
    g.addColorStop(0, `rgba(${tint},${0.10 + Math.random() * 0.10})`);
    g.addColorStop(1, 'rgba(160,200,120,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // 中間スケールのざらつき（土・砂利の粒立ち）
  for (let i = 0; i < 9000; i++) {
    const x = Math.random() * size, y = Math.random() * size;
    const v = 130 + Math.random() * 70;
    ctx.fillStyle = `rgba(${v * 0.7},${v},${v * 0.55},${0.06 + Math.random() * 0.10})`;
    ctx.fillRect(x, y, 1.5 + Math.random() * 2.5, 1.5 + Math.random() * 2.5);
  }

  // 細かい草の穂（短いストローク）
  for (let i = 0; i < 4200; i++) {
    const x = Math.random() * size, y = Math.random() * size;
    const len = 3 + Math.random() * 6;
    const ang = Math.random() * Math.PI;
    const dark = Math.random() > 0.5;
    ctx.strokeStyle = dark ? 'rgba(70,110,55,0.35)' : 'rgba(210,235,150,0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(ang) * len, y - len - Math.sin(ang) * 2);
    ctx.stroke();
  }

  // 小さな花・クローバーの点在
  for (let i = 0; i < 260; i++) {
    const x = Math.random() * size, y = Math.random() * size;
    const petals = Math.random() > 0.7 ? 4 : 0;
    if (petals) {
      ctx.fillStyle = 'rgba(255,250,220,0.55)';
      for (let p = 0; p < petals; p++) {
        const a = (p / petals) * Math.PI * 2;
        ctx.beginPath();
        ctx.ellipse(x + Math.cos(a) * 2.5, y + Math.sin(a) * 2.5, 1.6, 1, a, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = 'rgba(255,220,90,0.7)';
      ctx.beginPath();
      ctx.arc(x, y, 1.1, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = 'rgba(90,140,70,0.3)';
      ctx.beginPath();
      ctx.arc(x, y, 1.5 + Math.random(), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // 小石・砂利
  for (let i = 0; i < 700; i++) {
    const x = Math.random() * size, y = Math.random() * size;
    const r = 1 + Math.random() * 2.2;
    const v = 150 + Math.random() * 50;
    ctx.fillStyle = `rgba(${v},${v - 8},${v - 20},0.28)`;
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * 0.7, Math.random() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }

  // 獣道・ひび割れ風のライン
  for (let i = 0; i < 34; i++) {
    ctx.strokeStyle = 'rgba(110,140,80,0.2)';
    ctx.lineWidth = 1 + Math.random() * 2;
    ctx.beginPath();
    let x = Math.random() * size, y = Math.random() * size;
    ctx.moveTo(x, y);
    for (let j = 0; j < 6; j++) { x += (Math.random() - 0.5) * 90; y += (Math.random() - 0.5) * 90; ctx.lineTo(x, y); }
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(WORLD_RADIUS / 4, WORLD_RADIUS / 4);
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  const maxAniso = renderer.capabilities ? renderer.capabilities.getMaxAnisotropy() : 1;
  tex.anisotropy = maxAniso || 4;
  return { tex, canvas };
}

// カラーテクスチャの輝度からノーマルマップを生成し、微細な凹凸感をライティングに反映する
function buildNormalMapFromCanvas(srcCanvas) {
  const size = srcCanvas.width;
  const src = srcCanvas.getContext('2d').getImageData(0, 0, size, size).data;
  const lum = new Float32Array(size * size);
  for (let i = 0; i < size * size; i++) {
    const o = i * 4;
    lum[i] = (src[o] * 0.299 + src[o + 1] * 0.587 + src[o + 2] * 0.114) / 255;
  }
  const nCanvas = makeCanvas(size);
  const nCtx = nCanvas.getContext('2d');
  const out = nCtx.createImageData(size, size);
  const strength = 2.2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const xL = lum[y * size + ((x - 1 + size) % size)];
      const xR = lum[y * size + ((x + 1) % size)];
      const yU = lum[((y - 1 + size) % size) * size + x];
      const yD = lum[((y + 1) % size) * size + x];
      const dx = (xL - xR) * strength;
      const dy = (yU - yD) * strength;
      const dz = 1.0;
      const len = Math.hypot(dx, dy, dz);
      const o = (y * size + x) * 4;
      out.data[o] = ((dx / len) * 0.5 + 0.5) * 255;
      out.data[o + 1] = ((dy / len) * 0.5 + 0.5) * 255;
      out.data[o + 2] = ((dz / len) * 0.5 + 0.5) * 255;
      out.data[o + 3] = 255;
    }
  }
  nCtx.putImageData(out, 0, 0);
  const tex = new THREE.CanvasTexture(nCanvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(WORLD_RADIUS / 4, WORLD_RADIUS / 4);
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  return tex;
}

const { tex: groundTex, canvas: groundCanvas } = buildTileTexture();
const biomeColorCache = BIOME_DEFS.map(b => new THREE.Color(b.color));
const groundNormalTex = buildNormalMapFromCanvas(groundCanvas);
const groundMat = makeToonMaterial({ map: groundTex, color: 0xffffff });
groundMat.normalMap = groundNormalTex;
groundMat.normalScale = new THREE.Vector2(0.6, 0.6);
groundMat.needsUpdate = true;
const GROUND_SEGMENTS = 128;
const ground = new THREE.Mesh(new THREE.PlaneGeometry(WORLD_RADIUS * 2, WORLD_RADIUS * 2, GROUND_SEGMENTS, GROUND_SEGMENTS), groundMat);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
{
  const posAttr = ground.geometry.attributes.position;
  const colors = new Float32Array(posAttr.count * 3);
  for (let i = 0; i < posAttr.count; i++) {
    const x = posAttr.getX(i), y = posAttr.getY(i);
    const r = Math.hypot(x, y) / WORLD_RADIUS;
    const wave = Math.sin(x * 0.0035) * Math.cos(y * 0.004) * 1.6
      + Math.sin(x * 0.012 + y * 0.01) * 0.4
      + Math.sin(x * 0.05 - y * 0.043) * 0.08;
    // ハブ・道・聖域周辺（中心付近）は平坦に保ち、遠方でのみ緩やかに起伏させる。
    // 世界の果て付近は境界の結晶壁と自然に馴染むよう再び滑らかにする。
    const rampIn = Math.min(1, Math.max(0, (r - 0.22) / 0.18));
    const rampOut = Math.min(1, Math.max(0, (0.94 - r) / 0.08));
    const falloff = rampIn * rampOut;
    posAttr.setZ(i, wave * falloff);

    // 大域的な色ムラを頂点カラーで加え、タイリングの反復感を軽減する
    const tint = (
      Math.sin(x * 0.00042 + 1.7) * Math.cos(y * 0.00051 - 0.9) * 0.5 +
      Math.sin(x * 0.0011 - y * 0.0009) * 0.5
    ); // -1..1程度
    const warmth = tint * 0.10;
    let cr = 1.0 + warmth * 0.6;
    let cg = 1.0 + warmth * 0.15;
    let cb = 1.0 - warmth * 0.55;

    // 35バイオームによる大域的な色分け（ハブ・道周辺は淡く抑えて視認性を保つ）
    const biomeIdx = nearestBiome(x, y);
    const bc = biomeColorCache[biomeIdx];
    const biomeStrength = 0.55 * falloff + 0.08;
    cr = cr * (1 - biomeStrength) + bc.r * 2 * biomeStrength;
    cg = cg * (1 - biomeStrength) + bc.g * 2 * biomeStrength;
    cb = cb * (1 - biomeStrength) + bc.b * 2 * biomeStrength;

    colors[i * 3] = cr;
    colors[i * 3 + 1] = cg;
    colors[i * 3 + 2] = cb;
  }
  ground.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  posAttr.needsUpdate = true;
  ground.geometry.computeVertexNormals();
}
groundMat.vertexColors = true;
groundMat.needsUpdate = true;
worldGroup.add(ground);

// 世界の果ての結晶壁
const boundaryMat = makeToonMaterial({ color: 0x3a2f55, emissive: 0x1c1030, emissiveIntensity: 0.6 });
const boundary = new THREE.Mesh(new THREE.TorusGeometry(WORLD_RADIUS - 4, 6, 8, 128), boundaryMat);
boundary.rotation.x = Math.PI / 2;
boundary.position.y = 2;
worldGroup.add(boundary);

/* ---------- 遠方の野生地帯に散らばる岩・小石（InstancedMesh） ---------- */
{
  const rockGeo = new THREE.DodecahedronGeometry(1, 0);
  const rockMat = makeToonMaterial({ color: 0x726a72, emissive: 0x14101a, emissiveIntensity: 0.25 });
  const ROCK_COUNT = 2600;
  const rockMesh = new THREE.InstancedMesh(rockGeo, rockMat, ROCK_COUNT);
  rockMesh.castShadow = true;
  rockMesh.receiveShadow = true;
  const dummy = new THREE.Object3D();
  let placed = 0;
  let guard = 0;
  while (placed < ROCK_COUNT && guard < ROCK_COUNT * 6) {
    guard++;
    const r = 0.24 + Math.random() * 0.68; // 起伏帯（0.22〜0.94付近）に集中させる
    const ang = Math.random() * Math.PI * 2;
    const dist = r * WORLD_RADIUS;
    const x = Math.cos(ang) * dist, z = Math.sin(ang) * dist;
    // 各聖域への道や拠点周辺（半径60m）は避けて自然な野原にのみ配置する
    let tooClose = false;
    for (let i = 0; i < CHAPTERS.length; i++) {
      const zx = Math.cos((i / CHAPTERS.length) * Math.PI * 2 - Math.PI / 2) * ZONE_DIST;
      const zz = Math.sin((i / CHAPTERS.length) * Math.PI * 2 - Math.PI / 2) * ZONE_DIST;
      if (Math.hypot(x - zx, z - zz) < 70) { tooClose = true; break; }
    }
    if (tooClose || dist < 90) continue;
    const scale = 0.5 + Math.random() * 2.1;
    dummy.position.set(x, scale * 0.35, z);
    dummy.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
    dummy.scale.set(scale, scale * (0.6 + Math.random() * 0.5), scale);
    dummy.updateMatrix();
    rockMesh.setMatrixAt(placed, dummy.matrix);
    placed++;
  }
  rockMesh.count = placed;
  rockMesh.instanceMatrix.needsUpdate = true;
  worldGroup.add(rockMesh);
}

/* ---------- 草むら（クロスビルボード・InstancedMesh）で近景の地面密度を強化 ---------- */
let windGrassMesh = null;
const windGrassData = [];
{
  const size = 64;
  const gCanvas = makeCanvas(size);
  const gctx = gCanvas.getContext('2d');
  gctx.clearRect(0, 0, size, size);
  for (let b = 0; b < 7; b++) {
    const bx = size * 0.5 + (Math.random() - 0.5) * size * 0.5;
    const bottom = size * 0.98;
    const topY = size * (0.08 + Math.random() * 0.25);
    const bend = (Math.random() - 0.5) * size * 0.3;
    const g = Math.random() > 0.5 ? '68,120,54' : '92,150,66';
    gctx.strokeStyle = `rgba(${g},0.95)`;
    gctx.lineWidth = 2 + Math.random() * 1.5;
    gctx.beginPath();
    gctx.moveTo(bx, bottom);
    gctx.quadraticCurveTo(bx + bend * 0.5, (bottom + topY) / 2, bx + bend, topY);
    gctx.stroke();
  }
  const grassTex = new THREE.CanvasTexture(gCanvas);
  grassTex.colorSpace = THREE.SRGBColorSpace;
  const grassMat = new THREE.MeshBasicMaterial({ map: grassTex, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, depthWrite: true });
  const plane = new THREE.PlaneGeometry(1.4, 1.7);
  plane.translate(0, 0.85, 0);
  const plane2 = plane.clone();
  plane2.rotateY(Math.PI / 2);
  const crossGeo = mergeGeometries([plane, plane2]);
  const GRASS_COUNT = 3600;
  windGrassMesh = new THREE.InstancedMesh(crossGeo, grassMat, GRASS_COUNT);
  const dummy2 = new THREE.Object3D();
  let gPlaced = 0, gGuard = 0;
  while (gPlaced < GRASS_COUNT && gGuard < GRASS_COUNT * 6) {
    gGuard++;
    const r = 0.02 + Math.random() * 0.9;
    const ang = Math.random() * Math.PI * 2;
    const dist = r * WORLD_RADIUS;
    const x = Math.cos(ang) * dist, z = Math.sin(ang) * dist;
    let onRoad = false;
    for (let i = 0; i < CHAPTERS.length; i++) {
      const zAng = zoneAngle(i);
      const zx = Math.cos(zAng) * ZONE_DIST, zz = Math.sin(zAng) * ZONE_DIST;
      const dx = zx, dz = zz;
      const len = Math.hypot(dx, dz);
      const t = Math.max(0, Math.min(1, ((x * dx + z * dz) / (len * len))));
      const px = dx * t, pz = dz * t;
      if (Math.hypot(x - px, z - pz) < 14 && t <= 1) { onRoad = true; break; }
    }
    if (onRoad || dist < 12) continue;
    const scale = 0.6 + Math.random() * 0.9;
    dummy2.position.set(x, 0, z);
    dummy2.rotation.y = Math.random() * Math.PI;
    const yMul = 0.7 + Math.random() * 0.6;
    dummy2.scale.set(scale, scale * yMul, scale);
    dummy2.updateMatrix();
    windGrassMesh.setMatrixAt(gPlaced, dummy2.matrix);
    windGrassData.push({ x, z, baseRotY: dummy2.rotation.y, scale, yMul, phase: Math.random() * Math.PI * 2 });
    gPlaced++;
  }
  windGrassMesh.count = gPlaced;
  windGrassMesh.instanceMatrix.needsUpdate = true;
  worldGroup.add(windGrassMesh);
}

/* ---------- 35バイオームごとの特色ある植生・構造物を散布 ---------- */
{
  function isNearRoad(x, z) {
    for (let i = 0; i < CHAPTERS.length; i++) {
      const zAng = zoneAngle(i);
      const zx = Math.cos(zAng) * ZONE_DIST, zz = Math.sin(zAng) * ZONE_DIST;
      const len = Math.hypot(zx, zz);
      const t = Math.max(0, Math.min(1, (x * zx + z * zz) / (len * len)));
      const px = zx * t, pz = zz * t;
      if (t <= 1 && Math.hypot(x - px, z - pz) < 20) return true;
    }
    return Math.hypot(x, z) < 90;
  }

  function buildPropGeoMat(category, color) {
    const c = new THREE.Color(color);
    switch (category) {
      case 'forest': {
        const trunk = new THREE.CylinderGeometry(0.25, 0.35, 2.2, 6);
        trunk.translate(0, 1.1, 0);
        const leaves = new THREE.ConeGeometry(1.6, 3.2, 7);
        leaves.translate(0, 3.4, 0);
        const geo = mergeGeometries([trunk, leaves]);
        return { geo, mat: makeToonMaterial({ color: c.clone().offsetHSL(0, 0, -0.1), emissive: 0x0a1608, emissiveIntensity: 0.15 }) };
      }
      case 'desert': {
        const body = new THREE.CylinderGeometry(0.35, 0.45, 2.6, 8);
        body.translate(0, 1.3, 0);
        const arm = new THREE.CylinderGeometry(0.2, 0.25, 1.2, 6);
        arm.translate(0.5, 1.8, 0);
        arm.rotateZ(0.5);
        const geo = mergeGeometries([body, arm]);
        return { geo, mat: makeToonMaterial({ color: c, emissive: 0x1a1204, emissiveIntensity: 0.1 }) };
      }
      case 'cyber': {
        const pole = new THREE.BoxGeometry(0.4, 3.6, 0.4);
        pole.translate(0, 1.8, 0);
        const cap = new THREE.BoxGeometry(0.9, 0.3, 0.9);
        cap.translate(0, 3.6, 0);
        const geo = mergeGeometries([pole, cap]);
        return { geo, mat: makeToonMaterial({ color: 0x1a1a22, emissive: c, emissiveIntensity: 1.1 }) };
      }
      case 'snow': {
        const geo = new THREE.IcosahedronGeometry(1.1, 0);
        geo.translate(0, 0.9, 0);
        return { geo, mat: makeToonMaterial({ color: c, emissive: 0x1a2228, emissiveIntensity: 0.2 }) };
      }
      case 'swamp': {
        const trunk = new THREE.CylinderGeometry(0.3, 0.5, 2.6, 6);
        trunk.translate(0.2, 1.3, 0);
        trunk.rotateZ(0.25);
        const geo = mergeGeometries([trunk]);
        return { geo, mat: makeToonMaterial({ color: c, emissive: 0x0c1206, emissiveIntensity: 0.15 }) };
      }
      case 'volcanic': {
        const geo = new THREE.DodecahedronGeometry(1.0, 0);
        geo.translate(0, 0.8, 0);
        return { geo, mat: makeToonMaterial({ color: 0x2a1a14, emissive: c, emissiveIntensity: 0.9 }) };
      }
      case 'crystal': {
        const geo = new THREE.OctahedronGeometry(1.3, 0);
        geo.scale(0.5, 1.8, 0.5);
        geo.translate(0, 1.4, 0);
        return { geo, mat: makeToonMaterial({ color: c, emissive: c, emissiveIntensity: 0.55, transparent: true, opacity: 0.88 }) };
      }
      default: { // wasteland
        const geo = new THREE.TetrahedronGeometry(1.2, 0);
        geo.translate(0, 0.7, 0);
        return { geo, mat: makeToonMaterial({ color: c, emissive: 0x080604, emissiveIntensity: 0.1 }) };
      }
    }
  }

  BIOME_DEFS.forEach((biome, bi) => {
    const seed = BIOME_SEEDS[bi];
    const { geo, mat } = buildPropGeoMat(biome.category, biome.color);
    const COUNT = 46;
    const mesh = new THREE.InstancedMesh(geo, mat, COUNT);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const dummy = new THREE.Object3D();
    let placed = 0, guard = 0;
    const spread = 260;
    while (placed < COUNT && guard < COUNT * 8) {
      guard++;
      const ang = Math.random() * Math.PI * 2;
      const dist = Math.random() * spread;
      const x = seed.x + Math.cos(ang) * dist;
      const z = seed.z + Math.sin(ang) * dist;
      const r = Math.hypot(x, z) / WORLD_RADIUS;
      if (r > 0.95 || isNearRoad(x, z)) continue;
      if (nearestBiome(x, z) !== bi) continue; // 自分のバイオーム領域内にのみ配置
      const scale = 0.7 + Math.random() * 0.9;
      dummy.position.set(x, 0, z);
      dummy.rotation.y = Math.random() * Math.PI * 2;
      dummy.scale.set(scale, scale * (0.8 + Math.random() * 0.4), scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(placed, dummy.matrix);
      placed++;
    }
    mesh.count = placed;
    mesh.instanceMatrix.needsUpdate = true;
    worldGroup.add(mesh);
  });
}

/* ---------- 聖域ごとの色つき地帯（バイオームパッチ） ---------- */
function buildBiomePatch(theme) {
  const size = 512;
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext('2d');
  const col = new THREE.Color(theme.color);
  const r255 = col.r * 255 | 0, g255 = col.g * 255 | 0, b255 = col.b * 255 | 0;
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, `rgba(${r255},${g255},${b255},0.8)`);
  grad.addColorStop(0.7, `rgba(${r255},${g255},${b255},0.35)`);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  // 内部にざらつきと斑点を足して、単なる均一グラデーションではなく地面と馴染む質感にする
  for (let i = 0; i < 1200; i++) {
    const ang = Math.random() * Math.PI * 2;
    const rad = Math.random() * size * 0.48;
    const x = size / 2 + Math.cos(ang) * rad, y = size / 2 + Math.sin(ang) * rad;
    const fall = 1 - rad / (size * 0.5);
    const v = Math.random() > 0.5 ? 1.25 : 0.75;
    ctx.fillStyle = `rgba(${Math.min(255, r255 * v) | 0},${Math.min(255, g255 * v) | 0},${Math.min(255, b255 * v) | 0},${0.10 * fall})`;
    ctx.beginPath();
    ctx.ellipse(x, y, 2 + Math.random() * 3, 2 + Math.random() * 3, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
}

function addBiomePatch(center, theme, radius) {
  const patch = new THREE.Mesh(new THREE.CircleGeometry(radius, 48), buildBiomePatch(theme));
  patch.rotation.x = -Math.PI / 2;
  patch.position.set(center.x, 0.05, center.z);
  worldGroup.add(patch);
}

/* ---------- 水たまり（地面の質感アクセント） ---------- */
function buildPuddleTexture() {
  const size = 128;
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(140,190,220,0.55)');
  grad.addColorStop(0.55, 'rgba(110,160,200,0.35)');
  grad.addColorStop(0.85, 'rgba(70,110,150,0.18)');
  grad.addColorStop(1, 'rgba(70,110,150,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = 'rgba(230,245,255,0.5)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.ellipse(size * 0.42, size * 0.4, size * 0.18, size * 0.08, -0.4, 0, Math.PI * 2);
  ctx.stroke();
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
const puddleTex = buildPuddleTexture();
const puddleMat = new THREE.MeshBasicMaterial({ map: puddleTex, transparent: true, depthWrite: false });
export const puddlePositions = [];
function scatterPuddles(center, spread, count) {
  for (let i = 0; i < count; i++) {
    const ang = Math.random() * Math.PI * 2;
    const dist = Math.random() * spread;
    const x = center.x + Math.cos(ang) * dist, z = center.z + Math.sin(ang) * dist;
    const r = 2 + Math.random() * 4;
    const puddle = new THREE.Mesh(new THREE.CircleGeometry(r, 20), puddleMat);
    puddle.rotation.x = -Math.PI / 2;
    puddle.rotation.z = Math.random() * Math.PI;
    puddle.position.set(x, 0.025, z);
    worldGroup.add(puddle);
    puddlePositions.push({ x, z, r });
  }
}

/* ---------- ハブ中央の光の柱 ---------- */
{
  const hubMat = makeToonMaterial({ color: 0xccbbff, emissive: 0x8866ff, emissiveIntensity: 1.4 });
  const hubPillar = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.9, 5.5, 16), hubMat);
  hubPillar.position.set(0, 2.75, 0);
  worldGroup.add(hubPillar);
  const hubLight = new THREE.PointLight(0xaa88ff, 3.5, 40, 2);
  hubLight.position.set(0, 6, 0);
  worldGroup.add(hubLight);
  addBiomePatch(new THREE.Vector3(0, 0, 0), { color: 0x5a4f7a }, 60);
  scatterPuddles(new THREE.Vector3(0, 0, 0), 55, 3);
}

/* ---------- 道（ハブ～各聖域） ---------- */
function buildRoadTexture() {
  const size = 512;
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#463a63';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 900; i++) {
    const x = Math.random() * size, y = Math.random() * size;
    const v = 50 + Math.random() * 40;
    ctx.fillStyle = `rgba(${v},${v - 6},${v + 20},${0.10 + Math.random() * 0.14})`;
    ctx.beginPath();
    ctx.ellipse(x, y, 2 + Math.random() * 3, 1.5 + Math.random() * 2, Math.random() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  for (let i = 0; i < 220; i++) {
    const x = Math.random() * size, y = Math.random() * size;
    const r = 3 + Math.random() * 5;
    ctx.fillStyle = `rgba(30,22,45,${0.15 + Math.random() * 0.15})`;
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * 0.6, Math.random() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = 'rgba(20,14,30,0.25)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(size * 0.12, 0); ctx.lineTo(size * 0.12, size);
  ctx.moveTo(size * 0.88, 0); ctx.lineTo(size * 0.88, size);
  ctx.stroke();
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return tex;
}
const roadTex = buildRoadTexture();
CHAPTERS.forEach((_, i) => {
  const local = zoneLocalPos(i);
  const segments = 24;
  const segLen = local.length() / segments;
  const roadMap = roadTex.clone();
  roadMap.needsUpdate = true;
  roadMap.repeat.set(1, Math.max(1, Math.round(segLen / 6)));
  const roadMat = makeToonMaterial({ map: roadMap, color: 0xffffff, emissive: 0x120a20, emissiveIntensity: 0.15 });
  for (let s = 0; s < segments; s++) {
    const t0 = s / segments, t1 = (s + 1) / segments;
    const midT = (t0 + t1) / 2;
    const px = local.x * midT, pz = local.z * midT;
    const seg = new THREE.Mesh(new THREE.PlaneGeometry(6, (local.length() / segments) * 1.05), roadMat);
    seg.rotation.x = -Math.PI / 2;
    seg.rotation.z = -Math.atan2(local.x, local.z);
    seg.position.set(px, 0.03, pz);
    worldGroup.add(seg);
  }
});

/* ---------- 接地感を出す簡易AOブロブ ---------- */
function buildAODecalTexture() {
  const size = 128;
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(10,8,16,0.45)');
  grad.addColorStop(0.6, 'rgba(10,8,16,0.2)');
  grad.addColorStop(1, 'rgba(10,8,16,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
const aoDecalTex = buildAODecalTexture();
const aoDecalMat = new THREE.MeshBasicMaterial({ map: aoDecalTex, transparent: true, depthWrite: false });
function addAODecal(x, z, radius) {
  const decal = new THREE.Mesh(new THREE.CircleGeometry(radius, 16), aoDecalMat);
  decal.rotation.x = -Math.PI / 2;
  decal.position.set(x, 0.02, z);
  worldGroup.add(decal);
}

const glowDecalCache = {};
function addGlowDecal(x, z, radius, color) {
  if (!glowDecalCache[color]) {
    const size = 128;
    const canvas = makeCanvas(size);
    const ctx = canvas.getContext('2d');
    const c = new THREE.Color(color);
    const r255 = c.r * 255 | 0, g255 = c.g * 255 | 0, b255 = c.b * 255 | 0;
    const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grad.addColorStop(0, `rgba(${r255},${g255},${b255},0.55)`);
    grad.addColorStop(0.5, `rgba(${r255},${g255},${b255},0.22)`);
    grad.addColorStop(1, `rgba(${r255},${g255},${b255},0)`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    glowDecalCache[color] = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  }
  const decal = new THREE.Mesh(new THREE.CircleGeometry(radius, 20), glowDecalCache[color]);
  decal.rotation.x = -Math.PI / 2;
  decal.position.set(x, 0.03, z);
  worldGroup.add(decal);
  return decal;
}

/* ---------- ゾーンごとの装飾プロップ ---------- */
function scatterProps(center, theme, chapterIndex, count = 16, spread = 40) {
  const rnd = () => Math.random() - 0.5;
  const propMat = makeToonMaterial({ color: theme.color });
  for (let i = 0; i < count; i++) {
    const ox = center.x + rnd() * spread, oz = center.z + rnd() * spread;
    addAODecal(ox, oz, 0.9 + Math.random() * 0.6);
    let mesh;
    if (chapterIndex === 0) {
      mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 2.2 + Math.random(), 8), propMat);
    } else if (chapterIndex === 1) {
      const g = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 1.6, 6), propMat);
      trunk.position.y = 0.8;
      const leaf = new THREE.Mesh(new THREE.OctahedronGeometry(0.9, 0), propMat);
      leaf.position.y = 1.9;
      g.add(trunk, leaf);
      mesh = g;
    } else if (chapterIndex === 2) {
      mesh = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.6 + Math.random(), 1.2), propMat);
    } else {
      mesh = new THREE.Mesh(new THREE.ConeGeometry(0.4, 2.4 + Math.random(), 6), propMat);
    }
    mesh.position.set(ox, 0, oz);
    mesh.rotation.y = Math.random() * Math.PI * 2;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    worldGroup.add(mesh);
    addOutline(mesh, 0x0a0816, 0.02);
  }
}

/* ---------- 簡易NPC生成ヘルパー ---------- */
function makeHumanoidMesh(bodyColor, glowColor) {
  const g = new THREE.Group();
  const mat = makeToonMaterial({ color: bodyColor, emissive: glowColor, emissiveIntensity: 0.5 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 1.1, 8, 16), mat);
  body.position.y = 1.1;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 16, 16), mat);
  head.position.y = 1.95;
  g.add(body, head);
  g.castShadow = true;
  addOutline(g, 0x0a0816, 0.02);
  return g;
}

/* ---------- 聖域マーカー（歩いて近づくと発生するトリガー） ---------- */
export const zoneMarkers = [];
export const questGivers = [];
export const fieldTargets = [];
export const explorePickups = [];
export const loreMarkers = [];
export const hiddenTreasures = [];

CHAPTERS.forEach((chapter, i) => {
  const theme = ZONE_THEME[i];
  const local = zoneLocalPos(i);

  addBiomePatch(local, theme, 55);

  const markerMat = makeToonMaterial({ color: theme.glow, emissive: theme.glow, emissiveIntensity: 1.6 });
  const marker = new THREE.Mesh(new THREE.OctahedronGeometry(0.9, 1), markerMat);
  marker.position.set(local.x, 2.2, local.z);
  worldGroup.add(marker);
  addOutline(marker, 0x0a0816, 0.03);
  addGlowDecal(local.x, local.z, 3.2, theme.glow);

  const base = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.7, 0.6, 24), makeToonMaterial({ color: theme.color }));
  base.position.set(local.x, 0.3, local.z);
  base.castShadow = true; base.receiveShadow = true;
  worldGroup.add(base);

  const markerLight = new THREE.PointLight(theme.glow, 2.5, 18, 2);
  markerLight.position.set(local.x, 3, local.z);
  worldGroup.add(markerLight);

  scatterProps(local, theme, i);
  scatterPuddles(local, 45, 2 + Math.floor(Math.random() * 2));

  zoneMarkers.push({
    chapterIndex: i,
    key: chapter.key,
    name: chapter.title,
    localPos: local,
    mesh: marker,
    light: markerLight,
    material: markerMat,
    radius: 4.2,
  });

  // ---- クエスト依頼人（討伐クエストを渡す）----
  const skirmishQuest = chapter.quests.find(q => q.type === 'battle');
  if (skirmishQuest) {
    const npcOffsetAng = zoneAngle(i) + Math.PI * 0.5;
    const npcPos = new THREE.Vector3(local.x + Math.cos(npcOffsetAng) * 5, 0, local.z + Math.sin(npcOffsetAng) * 5);
    const npc = makeHumanoidMesh(0xd8c8a0, theme.glow);
    npc.position.set(npcPos.x, 0, npcPos.z);
    worldGroup.add(npc);
    addAODecal(npcPos.x, npcPos.z, 0.7);

    // ---- 討伐目標（聖域からさらに数百m先）----
    const targetAng = zoneAngle(i) + (Math.random() - 0.5) * 0.6;
    const targetLocal = new THREE.Vector3(
      Math.cos(targetAng) * (ZONE_DIST + FIELD_TARGET_DIST),
      0,
      Math.sin(targetAng) * (ZONE_DIST + FIELD_TARGET_DIST)
    );
    addBiomePatch(targetLocal, theme, 30);
    scatterProps(targetLocal, theme, i, 8, 25);
    const targetMat = makeToonMaterial({ color: theme.color, emissive: 0xff2222, emissiveIntensity: 1.2 });
    const targetMesh = new THREE.Mesh(new THREE.IcosahedronGeometry(1.4, 0), targetMat);
    targetMesh.position.set(targetLocal.x, 1.4, targetLocal.z);
    worldGroup.add(targetMesh);
    addOutline(targetMesh, 0x0a0816, 0.03);
    addGlowDecal(targetLocal.x, targetLocal.z, 2.4, 0xff4444);
    const targetLight = new THREE.PointLight(0xff4444, 2, 16, 2);
    targetLight.position.set(targetLocal.x, 2.5, targetLocal.z);
    worldGroup.add(targetLight);

    questGivers.push({
      chapterIndex: i,
      questId: skirmishQuest.id,
      quest: skirmishQuest,
      name: `${chapter.title}の依頼人`,
      localPos: npcPos,
      radius: 3.5,
    });
    fieldTargets.push({
      chapterIndex: i,
      questId: skirmishQuest.id,
      quest: skirmishQuest,
      name: `${chapter.enemyName}の眷属`,
      localPos: targetLocal,
      mesh: targetMesh,
      light: targetLight,
      material: targetMat,
      radius: 6,
      hp: 30 + i * 12,
      distanceFromZone: FIELD_TARGET_DIST,
    });
  }

  // ---- 探索クエスト（結晶の欠片の採取ポイント）----
  const exploreQuest = chapter.quests.find(q => q.type === 'explore');
  if (exploreQuest) {
    const ang = zoneAngle(i) - Math.PI * 0.35;
    const dist = 70 + Math.random() * 60;
    const pickupLocal = new THREE.Vector3(local.x + Math.cos(ang) * dist, 0, local.z + Math.sin(ang) * dist);
    const pickupMat = makeToonMaterial({ color: 0xffe27a, emissive: 0xffcc44, emissiveIntensity: 2 });
    const pickupMesh = new THREE.Mesh(new THREE.OctahedronGeometry(0.5, 0), pickupMat);
    pickupMesh.position.set(pickupLocal.x, 1.1, pickupLocal.z);
    worldGroup.add(pickupMesh);
    addOutline(pickupMesh, 0x0a0816, 0.02);
    addGlowDecal(pickupLocal.x, pickupLocal.z, 1.6, 0xffcc44);
    const pickupLight = new THREE.PointLight(0xffcc44, 1.8, 10, 2);
    pickupLight.position.set(pickupLocal.x, 1.6, pickupLocal.z);
    worldGroup.add(pickupLight);
    explorePickups.push({ chapterIndex: i, questId: exploreQuest.id, quest: exploreQuest, localPos: pickupLocal, mesh: pickupMesh, radius: 3 });
  }

  // ---- ロアクエスト（記録の石碑）----
  const loreQuest = chapter.quests.find(q => q.type === 'lore');
  if (loreQuest) {
    const ang = zoneAngle(i) + Math.PI * 0.35;
    const dist = 70 + Math.random() * 60;
    const loreLocal = new THREE.Vector3(local.x + Math.cos(ang) * dist, 0, local.z + Math.sin(ang) * dist);
    const monuMat = makeToonMaterial({ color: 0x8899cc, emissive: 0x445588, emissiveIntensity: 1 });
    const monuMesh = new THREE.Mesh(new THREE.BoxGeometry(0.6, 2.2, 0.3), monuMat);
    monuMesh.position.set(loreLocal.x, 1.1, loreLocal.z);
    monuMesh.rotation.y = Math.random() * Math.PI;
    worldGroup.add(monuMesh);
    addOutline(monuMesh, 0x0a0816, 0.02);
    addAODecal(loreLocal.x, loreLocal.z, 0.8);
    const monuLight = new THREE.PointLight(0x8899ff, 1.4, 9, 2);
    monuLight.position.set(loreLocal.x, 2, loreLocal.z);
    worldGroup.add(monuLight);
    loreMarkers.push({ chapterIndex: i, questId: loreQuest.id, quest: loreQuest, localPos: loreLocal, mesh: monuMesh, radius: 3 });
  }

  // ---- 隠しボーナスアイテム（結晶の秘宝）----
  {
    const treasureId = `treasure_${chapter.key}`;
    const ang = zoneAngle(i) + Math.PI * (0.85 + Math.random() * 0.3);
    const dist = 90 + Math.random() * 80;
    const tLocal = new THREE.Vector3(local.x + Math.cos(ang) * dist, 0, local.z + Math.sin(ang) * dist);
    const tMat = makeToonMaterial({ color: 0xffd700, emissive: 0xffaa00, emissiveIntensity: 2.4 });
    const tMesh = new THREE.Mesh(new THREE.DodecahedronGeometry(0.55, 0), tMat);
    tMesh.position.set(tLocal.x, 1.2, tLocal.z);
    worldGroup.add(tMesh);
    addOutline(tMesh, 0x0a0816, 0.02);
    addGlowDecal(tLocal.x, tLocal.z, 1.8, 0xffd700);
    const tLight = new THREE.PointLight(0xffaa00, 2.2, 11, 2);
    tLight.position.set(tLocal.x, 1.8, tLocal.z);
    worldGroup.add(tLight);
    hiddenTreasures.push({ id: treasureId, chapterIndex: i, localPos: tLocal, mesh: tMesh, light: tLight, radius: 3, shardReward: 15 + i * 5 });
  }
});

/* ---------- 商店（ハブ、結晶の欠片で武器を購入）---------- */
export const SHOP_ITEMS = [
  { itemId: 'sword_traveler', cost: 35 },
  { itemId: 'armor_wanderer', cost: 45 },
  { itemId: 'accessory_charm', cost: 50 },
  { itemId: 'sword_thornblade', cost: 60 },
  { itemId: 'armor_archive', cost: 100 },
  { itemId: 'sword_echo', cost: 140 },
  { itemId: 'armor_eternal', cost: 220 },
  { itemId: 'accessory_starlight', cost: 200 },
  { itemId: 'sword_primecore', cost: 260 },
  { itemId: 'accessory_legend', cost: 150, requiresAchievement: 'completionist' },
];
export const shopLocalPos = new THREE.Vector3(8, 0, -4);
{
  const shopMat = makeToonMaterial({ color: 0xd4a84a, emissive: 0x5a3c10, emissiveIntensity: 0.5 });
  const shop = new THREE.Group();
  const stall = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2, 2.2), shopMat);
  stall.position.y = 1;
  const roof = new THREE.Mesh(new THREE.ConeGeometry(2.4, 1.3, 4), shopMat);
  roof.position.y = 2.5; roof.rotation.y = Math.PI / 4;
  shop.add(stall, roof);
  shop.position.set(shopLocalPos.x, 0, shopLocalPos.z);
  shop.castShadow = true;
  worldGroup.add(shop);
  addOutline(shop, 0x0a0816, 0.02);
  const shopLight = new THREE.PointLight(0xffcc66, 2, 14, 2);
  shopLight.position.set(shopLocalPos.x, 3, shopLocalPos.z);
  worldGroup.add(shopLight);
}

/* ---------- ゾーン状態の見た目更新（未到達／挑戦可／クリア済み） ---------- */
export function refreshZoneVisuals(currentChapterIndex) {
  zoneMarkers.forEach(z => {
    if (z.chapterIndex < currentChapterIndex) {
      z.material.emissiveIntensity = 0.6;
      z.light.intensity = 1.2;
    } else if (z.chapterIndex === currentChapterIndex) {
      z.material.emissiveIntensity = 2.2;
      z.light.intensity = 3.2;
    } else {
      z.material.emissiveIntensity = 0.15;
      z.light.intensity = 0.4;
    }
  });
}

export function worldToLocal(pos) {
  return pos.clone().sub(HUB_OFFSET);
}
export function localToWorld(pos) {
  return pos.clone().add(HUB_OFFSET);
}

/* ---------- 蛍・妖精火：探索エリアを漂う環境パーティクル ---------- */
const FIREFLY_COUNT = 220;
const fireflyGeo = new THREE.SphereGeometry(0.12, 6, 6);
const fireflyMat = new THREE.MeshBasicMaterial({ color: 0xbdffa0, transparent: true, opacity: 0.9 });
const fireflyMesh = new THREE.InstancedMesh(fireflyGeo, fireflyMat, FIREFLY_COUNT);
const fireflyData = [];
{
  const dummy = new THREE.Object3D();
  for (let i = 0; i < FIREFLY_COUNT; i++) {
    const r = Math.random() * WORLD_RADIUS * 0.9;
    const ang = Math.random() * Math.PI * 2;
    const baseX = Math.cos(ang) * r, baseZ = Math.sin(ang) * r;
    fireflyData.push({
      baseX, baseZ,
      baseY: 1.2 + Math.random() * 2.2,
      speed: 0.4 + Math.random() * 0.8,
      radius: 1 + Math.random() * 2.5,
      phase: Math.random() * Math.PI * 2,
    });
    dummy.position.set(baseX, fireflyData[i].baseY, baseZ);
    dummy.updateMatrix();
    fireflyMesh.setMatrixAt(i, dummy.matrix);
  }
}
fireflyMesh.instanceMatrix.needsUpdate = true;
worldGroup.add(fireflyMesh);

const fireflyDummy = new THREE.Object3D();
export function updateFireflies(t) {
  for (let i = 0; i < FIREFLY_COUNT; i++) {
    const d = fireflyData[i];
    const x = d.baseX + Math.cos(t * d.speed + d.phase) * d.radius;
    const z = d.baseZ + Math.sin(t * d.speed * 1.3 + d.phase) * d.radius;
    const y = d.baseY + Math.sin(t * d.speed * 2 + d.phase) * 0.6;
    fireflyDummy.position.set(x, y, z);
    const s = 0.7 + Math.sin(t * 3 + d.phase) * 0.4;
    fireflyDummy.scale.setScalar(Math.max(0.2, s));
    fireflyDummy.updateMatrix();
    fireflyMesh.setMatrixAt(i, fireflyDummy.matrix);
  }
  fireflyMesh.instanceMatrix.needsUpdate = true;
}

/* ---------- 空を旋回する鳥の群れ ---------- */
const BIRD_COUNT = 60;
const birdWing = new THREE.ConeGeometry(0.6, 2.2, 3);
birdWing.rotateX(Math.PI / 2);
const birdMat = new THREE.MeshBasicMaterial({ color: 0x2a2a33 });
const birdMesh = new THREE.InstancedMesh(birdWing, birdMat, BIRD_COUNT);
const birdData = [];
for (let i = 0; i < BIRD_COUNT; i++) {
  birdData.push({
    centerX: (Math.random() - 0.5) * WORLD_RADIUS * 1.4,
    centerZ: (Math.random() - 0.5) * WORLD_RADIUS * 1.4,
    radius: 60 + Math.random() * 220,
    height: 45 + Math.random() * 70,
    speed: 0.15 + Math.random() * 0.25,
    phase: Math.random() * Math.PI * 2,
  });
}
worldGroup.add(birdMesh);
const birdDummy = new THREE.Object3D();
export function updateBirds(t) {
  for (let i = 0; i < BIRD_COUNT; i++) {
    const d = birdData[i];
    const ang = t * d.speed + d.phase;
    const x = d.centerX + Math.cos(ang) * d.radius;
    const z = d.centerZ + Math.sin(ang) * d.radius;
    const y = d.height + Math.sin(t * 2 + d.phase) * 3;
    birdDummy.position.set(x, y, z);
    birdDummy.rotation.y = -ang + Math.PI / 2;
    birdDummy.rotation.x = Math.sin(t * 8 + d.phase) * 0.3;
    birdDummy.updateMatrix();
    birdMesh.setMatrixAt(i, birdDummy.matrix);
  }
  birdMesh.instanceMatrix.needsUpdate = true;
}

/* ---------- プレイヤー周辺に舞う落ち葉・花びら ---------- */
const LEAF_COUNT = 90;
const leafGeo = new THREE.PlaneGeometry(0.35, 0.35);
const leafMat = new THREE.MeshBasicMaterial({ color: 0xd7a13a, side: THREE.DoubleSide, transparent: true, opacity: 0.85 });
const leafMesh = new THREE.InstancedMesh(leafGeo, leafMat, LEAF_COUNT);
leafMesh.frustumCulled = false;
const leafData = [];
for (let i = 0; i < LEAF_COUNT; i++) {
  leafData.push({
    ox: (Math.random() - 0.5) * 30,
    oz: (Math.random() - 0.5) * 30,
    y: Math.random() * 8,
    fallSpeed: 0.4 + Math.random() * 0.6,
    swaySpeed: 0.5 + Math.random() * 1.2,
    swayRadius: 0.6 + Math.random() * 1.4,
    phase: Math.random() * Math.PI * 2,
  });
}
worldGroup.add(leafMesh);
const leafDummy = new THREE.Object3D();
export function updateLeaves(t, centerX, centerZ) {
  for (let i = 0; i < LEAF_COUNT; i++) {
    const d = leafData[i];
    let y = d.y - (t * d.fallSpeed) % 8;
    if (y < 0) y += 8;
    const x = centerX + d.ox + Math.cos(t * d.swaySpeed + d.phase) * d.swayRadius;
    const z = centerZ + d.oz + Math.sin(t * d.swaySpeed * 0.8 + d.phase) * d.swayRadius;
    leafDummy.position.set(x, y, z);
    leafDummy.rotation.set(t * d.swaySpeed, t * d.swaySpeed * 1.3, 0);
    leafDummy.updateMatrix();
    leafMesh.setMatrixAt(i, leafDummy.matrix);
  }
  leafMesh.instanceMatrix.needsUpdate = true;
}

/* ---------- 森林バイオームを跳ね回る小動物 ---------- */
const forestSeeds = BIOME_SEEDS.filter((_, i) => BIOME_DEFS[i].category === 'forest');
const CRITTER_COUNT = Math.min(140, forestSeeds.length * 4);
const critterGeo = new THREE.CapsuleGeometry(0.28, 0.35, 2, 6);
const critterMat = makeToonMaterial({ color: 0x8a6a44, emissive: 0x0c0804, emissiveIntensity: 0.15 });
const critterMesh = new THREE.InstancedMesh(critterGeo, critterMat, CRITTER_COUNT);
critterMesh.castShadow = true;
const critterData = [];
for (let i = 0; i < CRITTER_COUNT; i++) {
  const seed = forestSeeds[i % forestSeeds.length] || { x: 0, z: 0 };
  const ang0 = Math.random() * Math.PI * 2;
  const dist0 = Math.random() * 150;
  critterData.push({
    homeX: seed.x + Math.cos(ang0) * dist0,
    homeZ: seed.z + Math.sin(ang0) * dist0,
    hopSpeed: 0.7 + Math.random() * 0.6,
    roamRadius: 8 + Math.random() * 14,
    phase: Math.random() * Math.PI * 2,
  });
}
worldGroup.add(critterMesh);
const critterDummy = new THREE.Object3D();
export function updateCritters(t) {
  for (let i = 0; i < CRITTER_COUNT; i++) {
    const d = critterData[i];
    const ang = t * 0.12 + d.phase;
    const x = d.homeX + Math.cos(ang) * d.roamRadius;
    const z = d.homeZ + Math.sin(ang * 1.4) * d.roamRadius;
    const hop = Math.abs(Math.sin(t * d.hopSpeed * 4 + d.phase));
    const y = 0.3 + hop * 0.4;
    critterDummy.position.set(x, y, z);
    critterDummy.rotation.y = -ang - Math.PI / 2;
    critterDummy.scale.set(1, 0.7 + hop * 0.5, 1);
    critterDummy.updateMatrix();
    critterMesh.setMatrixAt(i, critterDummy.matrix);
  }
  critterMesh.instanceMatrix.needsUpdate = true;
}

/* ---------- 流れ星（時折プレイヤー頭上を横切る） ---------- */
const STAR_COUNT = 5;
const starGeo = new THREE.SphereGeometry(0.5, 6, 6);
const starMat = new THREE.MeshBasicMaterial({ color: 0xfff6d0 });
const starMesh = new THREE.InstancedMesh(starGeo, starMat, STAR_COUNT);
worldGroup.add(starMesh);
const starData = [];
for (let i = 0; i < STAR_COUNT; i++) {
  starData.push({ nextTrigger: 8 + Math.random() * 25, active: false, t0: 0, dir: 0, startX: 0, startZ: 0, height: 0 });
}
const starDummy = new THREE.Object3D();
export function updateShootingStars(t, dt, centerX, centerZ, isNight) {
  for (let i = 0; i < STAR_COUNT; i++) {
    const d = starData[i];
    if (!d.active) {
      d.nextTrigger -= dt;
      if (isNight && d.nextTrigger <= 0) {
        d.active = true;
        d.t0 = t;
        d.dir = Math.random() * Math.PI * 2;
        d.height = 90 + Math.random() * 60;
        d.startX = centerX + Math.cos(d.dir + Math.PI) * 200;
        d.startZ = centerZ + Math.sin(d.dir + Math.PI) * 200;
      }
      starDummy.position.set(centerX, -1000, centerZ);
      starDummy.updateMatrix();
      starMesh.setMatrixAt(i, starDummy.matrix);
      continue;
    }
    const elapsed = t - d.t0;
    const dur = 1.4;
    const progress = elapsed / dur;
    if (progress >= 1) {
      d.active = false;
      d.nextTrigger = 10 + Math.random() * 30;
      starDummy.position.set(centerX, -1000, centerZ);
      starDummy.updateMatrix();
      starMesh.setMatrixAt(i, starDummy.matrix);
      continue;
    }
    const x = d.startX + Math.cos(d.dir) * progress * 400;
    const z = d.startZ + Math.sin(d.dir) * progress * 400;
    const y = d.height - progress * 40;
    starDummy.position.set(x, y, z);
    const s = 1 - progress * 0.5;
    starDummy.scale.setScalar(Math.max(0.1, s));
    starDummy.updateMatrix();
    starMesh.setMatrixAt(i, starDummy.matrix);
  }
  starMesh.instanceMatrix.needsUpdate = true;
}

/* ---------- 草むらの風揺れ ---------- */
const windDummy = new THREE.Object3D();
export function updateGrassWind(t) {
  if (!windGrassMesh) return;
  for (let i = 0; i < windGrassData.length; i++) {
    const d = windGrassData[i];
    const sway = Math.sin(t * 1.4 + d.phase) * 0.18;
    windDummy.position.set(d.x, 0, d.z);
    windDummy.rotation.set(sway * 0.6, d.baseRotY, sway);
    windDummy.scale.set(d.scale, d.scale * d.yMul, d.scale);
    windDummy.updateMatrix();
    windGrassMesh.setMatrixAt(i, windDummy.matrix);
  }
  windGrassMesh.instanceMatrix.needsUpdate = true;
}

/* ---------- 沼地バイオームに降る雨 ---------- */
const RAIN_COUNT = 400;
const rainGeo = new THREE.CylinderGeometry(0.02, 0.02, 1.1, 3);
const rainMat = new THREE.MeshBasicMaterial({ color: 0x9fc4e0, transparent: true, opacity: 0.55 });
const rainMesh = new THREE.InstancedMesh(rainGeo, rainMat, RAIN_COUNT);
rainMesh.visible = false;
const rainData = [];
for (let i = 0; i < RAIN_COUNT; i++) {
  rainData.push({
    ox: (Math.random() - 0.5) * 60,
    oz: (Math.random() - 0.5) * 60,
    y: Math.random() * 25,
    speed: 18 + Math.random() * 8,
  });
}
worldGroup.add(rainMesh);
const rainDummy = new THREE.Object3D();
export function updateRain(t, dt, centerX, centerZ) {
  const biomeIdx = nearestBiome(centerX, centerZ);
  const cat = BIOME_DEFS[biomeIdx] ? BIOME_DEFS[biomeIdx].category : null;
  const isRaining = cat === 'swamp';
  rainMesh.visible = isRaining;
  if (!isRaining) return false;
  for (let i = 0; i < RAIN_COUNT; i++) {
    const d = rainData[i];
    d.y -= d.speed * dt;
    if (d.y < 0) d.y += 25;
    rainDummy.position.set(centerX + d.ox, d.y, centerZ + d.oz);
    rainDummy.updateMatrix();
    rainMesh.setMatrixAt(i, rainDummy.matrix);
  }
  rainMesh.instanceMatrix.needsUpdate = true;
  return true;
}

/* ---------- 雪原バイオームに降る雪 ---------- */
const SNOW_COUNT = 320;
const snowGeo = new THREE.SphereGeometry(0.08, 5, 5);
const snowMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 });
const snowMesh = new THREE.InstancedMesh(snowGeo, snowMat, SNOW_COUNT);
snowMesh.visible = false;
const snowData = [];
for (let i = 0; i < SNOW_COUNT; i++) {
  snowData.push({
    ox: (Math.random() - 0.5) * 55,
    oz: (Math.random() - 0.5) * 55,
    y: Math.random() * 20,
    speed: 2 + Math.random() * 2.5,
    swayPhase: Math.random() * Math.PI * 2,
  });
}
worldGroup.add(snowMesh);
const snowDummy = new THREE.Object3D();
export function updateSnow(t, dt, centerX, centerZ) {
  const biomeIdx = nearestBiome(centerX, centerZ);
  const cat = BIOME_DEFS[biomeIdx] ? BIOME_DEFS[biomeIdx].category : null;
  const isSnowing = cat === 'snow';
  snowMesh.visible = isSnowing;
  if (!isSnowing) return;
  for (let i = 0; i < SNOW_COUNT; i++) {
    const d = snowData[i];
    d.y -= d.speed * dt;
    if (d.y < 0) d.y += 20;
    const sway = Math.sin(t * 0.8 + d.swayPhase) * 1.2;
    snowDummy.position.set(centerX + d.ox + sway, d.y, centerZ + d.oz);
    snowDummy.updateMatrix();
    snowMesh.setMatrixAt(i, snowDummy.matrix);
  }
  snowMesh.instanceMatrix.needsUpdate = true;
}

/* ---------- 溶岩地帯に舞う火の粉 ---------- */
const EMBER_COUNT = 220;
const emberGeo = new THREE.SphereGeometry(0.09, 5, 5);
const emberMat = new THREE.MeshBasicMaterial({ color: 0xff8a2a, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending });
const emberMesh = new THREE.InstancedMesh(emberGeo, emberMat, EMBER_COUNT);
emberMesh.visible = false;
const emberData = [];
for (let i = 0; i < EMBER_COUNT; i++) {
  emberData.push({
    ox: (Math.random() - 0.5) * 50,
    oz: (Math.random() - 0.5) * 50,
    y: Math.random() * 16,
    speed: 1.5 + Math.random() * 2.5,
    swayPhase: Math.random() * Math.PI * 2,
  });
}
worldGroup.add(emberMesh);
const emberDummy = new THREE.Object3D();
export function updateEmbers(t, dt, centerX, centerZ) {
  const biomeIdx = nearestBiome(centerX, centerZ);
  const cat = BIOME_DEFS[biomeIdx] ? BIOME_DEFS[biomeIdx].category : null;
  const isVolcanic = cat === 'volcanic';
  emberMesh.visible = isVolcanic;
  if (!isVolcanic) return;
  for (let i = 0; i < EMBER_COUNT; i++) {
    const d = emberData[i];
    d.y += d.speed * dt;
    if (d.y > 16) d.y -= 16;
    const sway = Math.sin(t * 1.2 + d.swayPhase) * 1.6;
    const s = 0.5 + 0.5 * (1 - d.y / 16);
    emberDummy.position.set(centerX + d.ox + sway, d.y, centerZ + d.oz);
    emberDummy.scale.setScalar(s);
    emberDummy.updateMatrix();
    emberMesh.setMatrixAt(i, emberDummy.matrix);
  }
  emberMesh.instanceMatrix.needsUpdate = true;
}

/* ---------- 砂漠バイオームに漂う砂塵 ---------- */
const SAND_COUNT = 260;
const sandGeo = new THREE.SphereGeometry(0.12, 5, 5);
const sandMat = new THREE.MeshBasicMaterial({ color: 0xd8b168, transparent: true, opacity: 0.4 });
const sandMesh = new THREE.InstancedMesh(sandGeo, sandMat, SAND_COUNT);
sandMesh.visible = false;
const sandData = [];
for (let i = 0; i < SAND_COUNT; i++) {
  sandData.push({
    ox: (Math.random() - 0.5) * 60,
    oz: (Math.random() - 0.5) * 60,
    y: 0.2 + Math.random() * 4,
    driftSpeed: 4 + Math.random() * 6,
    phase: Math.random() * Math.PI * 2,
  });
}
worldGroup.add(sandMesh);
const sandDummy = new THREE.Object3D();
export function updateSandstorm(t, dt, centerX, centerZ) {
  const biomeIdx = nearestBiome(centerX, centerZ);
  const cat = BIOME_DEFS[biomeIdx] ? BIOME_DEFS[biomeIdx].category : null;
  const isDesert = cat === 'desert';
  sandMesh.visible = isDesert;
  if (!isDesert) return;
  for (let i = 0; i < SAND_COUNT; i++) {
    const d = sandData[i];
    const dx = (t * d.driftSpeed + d.phase * 8) % 60 - 30;
    const bob = Math.sin(t * 1.5 + d.phase) * 0.4;
    sandDummy.position.set(centerX + dx, d.y + bob, centerZ + d.oz);
    sandDummy.updateMatrix();
    sandMesh.setMatrixAt(i, sandDummy.matrix);
  }
  sandMesh.instanceMatrix.needsUpdate = true;
}

/* ---------- サイバー都市バイオームに浮かぶ光る電脳パーティクル ---------- */
const CYBER_COUNT = 260;
const cyberGeo = new THREE.BoxGeometry(0.12, 0.12, 0.12);
const cyberMat = new THREE.MeshBasicMaterial({ color: 0x66eaff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending });
const cyberMesh = new THREE.InstancedMesh(cyberGeo, cyberMat, CYBER_COUNT);
cyberMesh.visible = false;
const cyberData = [];
for (let i = 0; i < CYBER_COUNT; i++) {
  cyberData.push({
    ox: (Math.random() - 0.5) * 55,
    oz: (Math.random() - 0.5) * 55,
    y: Math.random() * 14,
    speed: 1.2 + Math.random() * 2,
    phase: Math.random() * Math.PI * 2,
  });
}
worldGroup.add(cyberMesh);
const cyberDummy = new THREE.Object3D();
export function updateCyberMotes(t, dt, centerX, centerZ) {
  const biomeIdx = nearestBiome(centerX, centerZ);
  const cat = BIOME_DEFS[biomeIdx] ? BIOME_DEFS[biomeIdx].category : null;
  const isCyber = cat === 'cyber';
  cyberMesh.visible = isCyber;
  if (!isCyber) return;
  for (let i = 0; i < CYBER_COUNT; i++) {
    const d = cyberData[i];
    d.y += d.speed * dt;
    if (d.y > 14) d.y -= 14;
    const sway = Math.sin(t * 2 + d.phase) * 0.8;
    cyberDummy.position.set(centerX + d.ox + sway, d.y, centerZ + d.oz);
    cyberDummy.rotation.set(t * 2 + d.phase, t * 1.5, 0);
    cyberDummy.updateMatrix();
    cyberMesh.setMatrixAt(i, cyberDummy.matrix);
  }
  cyberMesh.instanceMatrix.needsUpdate = true;
}

/* ---------- 結晶バイオームにきらめく光の粒子 ---------- */
const SPARKLE_COUNT = 200;
const sparkleGeo = new THREE.OctahedronGeometry(0.1, 0);
const sparkleMat = new THREE.MeshBasicMaterial({ color: 0xd0b0ff, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending });
const sparkleMesh = new THREE.InstancedMesh(sparkleGeo, sparkleMat, SPARKLE_COUNT);
sparkleMesh.visible = false;
const sparkleData = [];
for (let i = 0; i < SPARKLE_COUNT; i++) {
  sparkleData.push({
    ox: (Math.random() - 0.5) * 50,
    oz: (Math.random() - 0.5) * 50,
    baseY: 0.3 + Math.random() * 6,
    bobSpeed: 0.6 + Math.random() * 1.2,
    phase: Math.random() * Math.PI * 2,
  });
}
worldGroup.add(sparkleMesh);
const sparkleDummy = new THREE.Object3D();
export function updateCrystalSparkles(t, dt, centerX, centerZ) {
  const biomeIdx = nearestBiome(centerX, centerZ);
  const cat = BIOME_DEFS[biomeIdx] ? BIOME_DEFS[biomeIdx].category : null;
  const isCrystal = cat === 'crystal';
  sparkleMesh.visible = isCrystal;
  if (!isCrystal) return;
  for (let i = 0; i < SPARKLE_COUNT; i++) {
    const d = sparkleData[i];
    const y = d.baseY + Math.sin(t * d.bobSpeed + d.phase) * 0.8;
    const twinkle = 0.6 + Math.abs(Math.sin(t * 4 + d.phase)) * 0.6;
    sparkleDummy.position.set(centerX + d.ox, y, centerZ + d.oz);
    sparkleDummy.rotation.set(t * d.bobSpeed, t * d.bobSpeed * 1.4, 0);
    sparkleDummy.scale.setScalar(twinkle);
    sparkleDummy.updateMatrix();
    sparkleMesh.setMatrixAt(i, sparkleDummy.matrix);
  }
  sparkleMesh.instanceMatrix.needsUpdate = true;
}

/* ---------- 荒野バイオームに舞う灰 ---------- */
const ASH_COUNT = 220;
const ashGeo = new THREE.PlaneGeometry(0.15, 0.15);
const ashMat = new THREE.MeshBasicMaterial({ color: 0x9a9284, transparent: true, opacity: 0.55, side: THREE.DoubleSide });
const ashMesh = new THREE.InstancedMesh(ashGeo, ashMat, ASH_COUNT);
ashMesh.visible = false;
const ashData = [];
for (let i = 0; i < ASH_COUNT; i++) {
  ashData.push({
    ox: (Math.random() - 0.5) * 55,
    oz: (Math.random() - 0.5) * 55,
    y: Math.random() * 10,
    fallSpeed: 0.3 + Math.random() * 0.5,
    swaySpeed: 0.4 + Math.random() * 0.8,
    phase: Math.random() * Math.PI * 2,
  });
}
worldGroup.add(ashMesh);
const ashDummy = new THREE.Object3D();
export function updateAsh(t, dt, centerX, centerZ) {
  const biomeIdx = nearestBiome(centerX, centerZ);
  const cat = BIOME_DEFS[biomeIdx] ? BIOME_DEFS[biomeIdx].category : null;
  const isWasteland = cat === 'wasteland';
  ashMesh.visible = isWasteland;
  if (!isWasteland) return;
  for (let i = 0; i < ASH_COUNT; i++) {
    const d = ashData[i];
    d.y -= d.fallSpeed * dt;
    if (d.y < 0) d.y += 10;
    const sway = Math.sin(t * d.swaySpeed + d.phase) * 1.4;
    ashDummy.position.set(centerX + d.ox + sway, d.y, centerZ + d.oz);
    ashDummy.rotation.set(t * d.swaySpeed, t * d.swaySpeed * 1.2, 0);
    ashDummy.updateMatrix();
    ashMesh.setMatrixAt(i, ashDummy.matrix);
  }
  ashMesh.instanceMatrix.needsUpdate = true;
}

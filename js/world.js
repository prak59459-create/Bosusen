import * as THREE from 'three';
import { scene, makeToonMaterial, addOutline } from './scene.js';
import { CHAPTERS } from './data.js';
import { makeCanvas } from './utils.js';

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

/* ---------- 地面（広域タイル張りテクスチャ） ---------- */
function buildTileTexture() {
  const size = 1024;
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#bfe0a0';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 5000; i++) {
    const x = Math.random() * size, y = Math.random() * size;
    const v = 140 + Math.random() * 60;
    ctx.fillStyle = `rgba(${v * 0.7},${v},${v * 0.55},${0.08 + Math.random() * 0.12})`;
    ctx.fillRect(x, y, 2 + Math.random() * 3, 2 + Math.random() * 3);
  }
  for (let i = 0; i < 30; i++) {
    ctx.strokeStyle = 'rgba(120,150,90,0.25)';
    ctx.lineWidth = 1 + Math.random() * 2;
    ctx.beginPath();
    let x = Math.random() * size, y = Math.random() * size;
    ctx.moveTo(x, y);
    for (let j = 0; j < 5; j++) { x += (Math.random() - 0.5) * 90; y += (Math.random() - 0.5) * 90; ctx.lineTo(x, y); }
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(WORLD_RADIUS / 4, WORLD_RADIUS / 4);
  return tex;
}

const groundTex = buildTileTexture();
const groundMat = makeToonMaterial({ map: groundTex, color: 0xffffff });
const ground = new THREE.Mesh(new THREE.PlaneGeometry(WORLD_RADIUS * 2, WORLD_RADIUS * 2, 1, 1), groundMat);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
worldGroup.add(ground);

// 世界の果ての結晶壁
const boundaryMat = makeToonMaterial({ color: 0x3a2f55, emissive: 0x1c1030, emissiveIntensity: 0.6 });
const boundary = new THREE.Mesh(new THREE.TorusGeometry(WORLD_RADIUS - 4, 6, 8, 128), boundaryMat);
boundary.rotation.x = Math.PI / 2;
boundary.position.y = 2;
worldGroup.add(boundary);

/* ---------- 聖域ごとの色つき地帯（バイオームパッチ） ---------- */
function buildBiomePatch(theme) {
  const size = 512;
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext('2d');
  const col = new THREE.Color(theme.color);
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, `rgba(${col.r*255|0},${col.g*255|0},${col.b*255|0},0.8)`);
  grad.addColorStop(0.7, `rgba(${col.r*255|0},${col.g*255|0},${col.b*255|0},0.35)`);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
}

function addBiomePatch(center, theme, radius) {
  const patch = new THREE.Mesh(new THREE.CircleGeometry(radius, 48), buildBiomePatch(theme));
  patch.rotation.x = -Math.PI / 2;
  patch.position.set(center.x, 0.05, center.z);
  worldGroup.add(patch);
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
}

/* ---------- 道（ハブ～各聖域） ---------- */
CHAPTERS.forEach((_, i) => {
  const local = zoneLocalPos(i);
  const segments = 24;
  const roadMat = makeToonMaterial({ color: 0x4a3f6a, emissive: 0x120a20, emissiveIntensity: 0.3 });
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

/* ---------- ゾーンごとの装飾プロップ ---------- */
function scatterProps(center, theme, chapterIndex, count = 16, spread = 40) {
  const rnd = () => Math.random() - 0.5;
  const propMat = makeToonMaterial({ color: theme.color });
  for (let i = 0; i < count; i++) {
    const ox = center.x + rnd() * spread, oz = center.z + rnd() * spread;
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

  const base = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.7, 0.6, 24), makeToonMaterial({ color: theme.color }));
  base.position.set(local.x, 0.3, local.z);
  base.castShadow = true; base.receiveShadow = true;
  worldGroup.add(base);

  const markerLight = new THREE.PointLight(theme.glow, 2.5, 18, 2);
  markerLight.position.set(local.x, 3, local.z);
  worldGroup.add(markerLight);

  scatterProps(local, theme, i);

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

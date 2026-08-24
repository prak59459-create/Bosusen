import * as THREE from 'three';
import { scene, TEX_SIZE, makeToonMaterial, addOutline } from './scene.js';
import { makeCanvas, noise2D } from './utils.js';

function makeSkinTextures(baseHex) {
  const size = TEX_SIZE;
  const albedoCanvas = makeCanvas(size);
  const ctx = albedoCanvas.getContext('2d');
  const base = new THREE.Color(baseHex);
  ctx.fillStyle = `rgb(${base.r * 255 | 0},${base.g * 255 | 0},${base.b * 255 | 0})`;
  ctx.fillRect(0, 0, size, size);
  const rnd = noise2D(3.1);
  for (let i = 0; i < 5000; i++) {
    const x = Math.random() * size, y = Math.random() * size;
    const v = rnd(x * 0.04, y * 0.04);
    const dark = v > 0.55;
    ctx.fillStyle = dark ? 'rgba(10,0,0,0.12)' : 'rgba(255,120,80,0.08)';
    const r = 1.5 + Math.random() * 4;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.strokeStyle = 'rgba(40,0,0,0.35)';
  for (let i = 0; i < 40; i++) {
    ctx.lineWidth = 0.6 + Math.random() * 1.2;
    let x = Math.random() * size, y = Math.random() * size;
    ctx.beginPath(); ctx.moveTo(x, y);
    for (let j = 0; j < 5; j++) { x += (Math.random() - 0.5) * 40; y += (Math.random() - 0.5) * 40; ctx.lineTo(x, y); }
    ctx.stroke();
  }

  const albedo = new THREE.CanvasTexture(albedoCanvas);
  albedo.colorSpace = THREE.SRGBColorSpace;
  albedo.wrapS = albedo.wrapT = THREE.RepeatWrapping;
  albedo.repeat.set(2, 2);
  return { albedo };
}

function makeBoss(def) {
  def = Object.assign({
    skinColor: 0x5c2436, emissive: 0x220000,
    hornColor: 0x141414, eyeColor: 0xff0000, legColor: 0x220d13,
    scale: 1.0,
  }, def || {});
  const group = new THREE.Group();
  const skin = makeSkinTextures(def.skinColor);
  const bodyMat = makeToonMaterial({
    map: skin.albedo, color: 0xffffff,
    emissive: def.emissive, emissiveIntensity: 0.6,
  });
  const hornMat = makeToonMaterial({ color: def.hornColor });
  const eyeMat = new THREE.MeshBasicMaterial({ color: def.eyeColor });
  // MeshBasicMaterial（非lit）はemissiveIntensityを持たないため、毎フレームの発光強弱は
  // 素のcolorを基準色から底上げして表現する（main.jsのアニメーションループ側で使用）
  eyeMat.userData.baseColor = eyeMat.color.clone();
  const legMat = makeToonMaterial({ color: def.legColor });

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(1.05, 1.7, 12, 28), bodyMat);
  torso.position.y = 2.55; torso.castShadow = true; torso.receiveShadow = true;
  group.add(torso);

  const chest = new THREE.Mesh(new THREE.SphereGeometry(0.95, 28, 28), bodyMat);
  chest.position.set(0, 3.15, 0.25);
  chest.scale.set(1, 0.85, 0.8);
  chest.castShadow = true;
  group.add(chest);

  for (let i = 0; i < 6; i++) {
    const s = 1 - i * 0.08;
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.16 * s, 0.75 * s, 10), hornMat);
    spike.position.set(0, 2.0 + i * 0.42, -1.05 + i * 0.03);
    spike.rotation.x = -0.35;
    spike.castShadow = true;
    group.add(spike);
  }

  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.65, 0.5, 16), bodyMat);
  neck.position.y = 3.85;
  group.add(neck);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.82, 32, 32), bodyMat);
  head.position.y = 4.35; head.castShadow = true;
  head.scale.set(1, 1.05, 1.1);
  group.add(head);

  const jaw = new THREE.Mesh(new THREE.SphereGeometry(0.5, 20, 20), bodyMat);
  jaw.position.set(0, 3.98, 0.55);
  jaw.scale.set(0.9, 0.55, 0.75);
  group.add(jaw);

  const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 16), eyeMat);
  eyeL.position.set(-0.3, 4.45, 0.72);
  group.add(eyeL);
  const eyeR = new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 16), eyeMat);
  eyeR.position.set(0.3, 4.45, 0.72);
  group.add(eyeR);
  group.userData.eyes = [eyeL, eyeR];

  const hornGeo = new THREE.ConeGeometry(0.14, 1.0, 12);
  const hornL = new THREE.Mesh(hornGeo, hornMat);
  hornL.position.set(-0.48, 5.05, 0); hornL.rotation.z = 0.45; hornL.castShadow = true;
  group.add(hornL);
  const hornR = new THREE.Mesh(hornGeo, hornMat);
  hornR.position.set(0.48, 5.05, 0); hornR.rotation.z = -0.45; hornR.castShadow = true;
  group.add(hornR);

  const armUpperGeo = new THREE.CapsuleGeometry(0.32, 1.1, 10, 20);
  const armLowerGeo = new THREE.CapsuleGeometry(0.27, 1.0, 10, 20);

  function makeArm(sign) {
    const armGroup = new THREE.Group();
    const upper = new THREE.Mesh(armUpperGeo, bodyMat);
    upper.position.set(sign * 1.55, 3.0, 0);
    upper.rotation.z = sign * 0.55;
    upper.castShadow = true;
    armGroup.add(upper);
    const lower = new THREE.Mesh(armLowerGeo, bodyMat);
    lower.position.set(sign * 2.15, 1.95, 0.15);
    lower.rotation.z = sign * 0.75;
    lower.castShadow = true;
    armGroup.add(lower);
    const claw = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.5, 8), hornMat);
    claw.position.set(sign * 2.55, 1.35, 0.35);
    claw.rotation.z = sign * 0.9;
    claw.rotation.x = 0.6;
    armGroup.add(claw);
    return armGroup;
  }
  const armR = makeArm(1);
  const armL = makeArm(-1);
  group.add(armR, armL);
  group.userData.armR = armR;
  group.userData.armL = armL;

  const legGeo = new THREE.CapsuleGeometry(0.42, 1.3, 10, 20);
  const legL = new THREE.Mesh(legGeo, legMat);
  legL.position.set(-0.62, 1.05, 0); legL.castShadow = true; legL.receiveShadow = true;
  group.add(legL);
  const legR = new THREE.Mesh(legGeo, legMat);
  legR.position.set(0.62, 1.05, 0); legR.castShadow = true; legR.receiveShadow = true;
  group.add(legR);

  const footGeo = new THREE.SphereGeometry(0.4, 16, 16);
  [-0.62, 0.62].forEach(x => {
    const foot = new THREE.Mesh(footGeo, legMat);
    foot.position.set(x, 0.32, 0.25);
    foot.scale.set(1, 0.6, 1.4);
    foot.castShadow = true; foot.receiveShadow = true;
    group.add(foot);
  });

  group.userData.body = bodyMat;
  group.position.set(3, 0, -3);
  group.rotation.y = -0.5;
  group.scale.setScalar(def.scale);
  addOutline(group, 0x0c0a16, 0.025);
  return group;
}

function disposeObject(obj) {
  obj.traverse(c => {
    if (c.geometry) c.geometry.dispose();
    if (c.material) {
      const mats = Array.isArray(c.material) ? c.material : [c.material];
      mats.forEach(m => {
        if (m.map) m.map.dispose();
        if (m.bumpMap) m.bumpMap.dispose();
        m.dispose();
      });
    }
  });
}

export let boss = null;
export function spawnEnemy(def) {
  if (boss) { scene.remove(boss); disposeObject(boss); }
  boss = makeBoss(def);
  scene.add(boss);
  return boss;
}

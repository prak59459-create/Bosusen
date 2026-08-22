import * as THREE from 'three';
import { GLTFLoader } from 'gltfloader';
import { scene, toonifyMaterial, addOutline } from './scene.js';
import { state } from './state.js';
import { showToast } from './ui.js';

export const player = new THREE.Group();
player.position.set(-2.6, 0, -1.2);
player.rotation.y = 0.35;
scene.add(player);

export let playerMixer = null;
export let playerActions = {};
export let playerModel = null;
export let playerReady = false;

export function loadPlayerModel(onProgress) {
  return new Promise((resolve) => {
    const loader = new GLTFLoader();
    loader.load(
      'assets/models/Soldier.glb',
      (gltf) => {
        const model = gltf.scene;
        const box = new THREE.Box3().setFromObject(model);
        const size = new THREE.Vector3();
        box.getSize(size);
        const targetHeight = 1.85;
        const scale = targetHeight / size.y;
        model.scale.setScalar(scale);
        const box2 = new THREE.Box3().setFromObject(model);
        model.position.y -= box2.min.y;

        model.traverse(c => {
          if (c.isMesh) {
            c.castShadow = true;
            c.receiveShadow = true;
            if (c.material) {
              c.material = toonifyMaterial(c.material);
            }
          }
        });

        player.add(model);
        addOutline(model, 0x0a0812, 0.012);
        playerModel = model;
        playerMixer = new THREE.AnimationMixer(model);
        gltf.animations.forEach(clip => {
          playerActions[clip.name] = playerMixer.clipAction(clip);
        });
        if (playerActions.Idle) playerActions.Idle.play();
        playerReady = true;
        resolve();
      },
      (evt) => {
        if (onProgress && evt.total) onProgress(evt.loaded / evt.total);
      },
      (err) => {
        console.error('プレイヤーモデルの読み込みに失敗', err);
        resolve();
      }
    );
  });
}

export function crossfadeTo(name, duration = 0.25) {
  if (!playerActions[name] || !playerMixer) return;
  Object.values(playerActions).forEach(a => a.fadeOut(duration));
  playerActions[name].reset().fadeIn(duration).play();
}

export function playerMotionBeat(kind = 'attack') {
  if (kind === 'heavy') crossfadeTo('Run', 0.12);
  else crossfadeTo('Walk', 0.15);
  setTimeout(() => crossfadeTo('Idle', 0.3), kind === 'heavy' ? 480 : 320);
}

/* ---------- 探索時にプレイヤーを追従する光の妖精 ---------- */
const companionGeo = new THREE.SphereGeometry(0.22, 10, 10);
const companionMat = new THREE.MeshBasicMaterial({ color: 0x9fe0ff, transparent: true, opacity: 0.9 });
export const companionOrb = new THREE.Group();
const companionCore = new THREE.Mesh(companionGeo, companionMat);
companionOrb.add(companionCore);
const companionLight = new THREE.PointLight(0x9fe0ff, 1.2, 6, 2);
companionOrb.add(companionLight);
companionOrb.visible = false;
scene.add(companionOrb);
const companionTrail = new THREE.Vector3();
export function setCompanionVisible(v) { companionOrb.visible = v; }
let companionTier = -1;
function companionTierFor() {
  if ((state.achievements || []).includes('completionist')) return 3;
  const count = (state.achievements || []).length;
  if (count >= 20) return 2;
  if (count >= 10) return 1;
  return 0;
}
const COMPANION_TIER_COLOR = [0x9fe0ff, 0xcd7f32, 0xc0c0c0, 0xffd700];
export function updateCompanion(t, dt, sensingTreasure = false) {
  if (!companionOrb.visible) return;
  const tier = companionTierFor();
  if (tier !== companionTier) {
    const wasInitialized = companionTier !== -1;
    companionTier = tier;
    const color = COMPANION_TIER_COLOR[tier];
    companionMat.color.setHex(color);
    companionLight.color.setHex(color);
    if (wasInitialized && tier > 0) {
      const tierNames = ['', '銅', '銀', '金'];
      showToast(`${state.companionName || 'イリス'}が${tierNames[tier]}色に輝き始めた`, 'quest');
    }
  }
  const targetX = player.position.x - Math.sin(player.rotation.y) * 1.6;
  const targetZ = player.position.z - Math.cos(player.rotation.y) * 1.6;
  const targetY = player.position.y + 1.9 + Math.sin(t * 2) * 0.25;
  companionTrail.set(targetX, targetY, targetZ);
  companionOrb.position.lerp(companionTrail, Math.min(1, dt * 4));
  const pulseSpeed = sensingTreasure ? 12 : 5;
  const pulseAmp = sensingTreasure ? 0.28 : 0.12;
  companionCore.scale.setScalar(1 + Math.sin(t * pulseSpeed) * pulseAmp);
  companionLight.intensity = sensingTreasure ? 1.6 + Math.sin(t * pulseSpeed) * 0.5 : 1.2;
}

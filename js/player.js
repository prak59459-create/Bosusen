import * as THREE from 'three';
import { GLTFLoader } from 'gltfloader';
import { scene, toonifyMaterial, addOutline } from './scene.js';

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

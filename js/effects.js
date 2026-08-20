import * as THREE from 'three';
import { scene, camera } from './scene.js';
import { rand } from './utils.js';
import { state } from './state.js';

function worldToScreen(vec3) {
  const v = vec3.clone().project(camera);
  return {
    x: (v.x * 0.5 + 0.5) * window.innerWidth,
    y: (-v.y * 0.5 + 0.5) * window.innerHeight,
  };
}

export function spawnDamageNumber(worldPos, text, color, big = false) {
  const p = worldToScreen(worldPos);
  const el = document.createElement('div');
  el.className = 'dmg-float';
  el.textContent = text;
  el.style.left = p.x + 'px';
  el.style.top = p.y + 'px';
  el.style.color = color;
  el.style.fontSize = big ? '36px' : '22px';
  document.getElementById('ui').appendChild(el);
  const t0 = performance.now();
  function step(t) {
    const dt = Math.min(1, (t - t0) / 900);
    const y = -60 * dt;
    el.style.transform = `translate(-50%, calc(-50% + ${y}px))`;
    el.style.opacity = 1 - dt;
    if (dt < 1) requestAnimationFrame(step);
    else el.remove();
  }
  requestAnimationFrame(step);
}

const particles = [];
export function spawnParticles(pos, color, count = 14) {
  const mat = new THREE.SpriteMaterial({ color, transparent: true, opacity: 1, blending: THREE.AdditiveBlending });
  for (let i = 0; i < count; i++) {
    const sprite = new THREE.Sprite(mat.clone());
    sprite.scale.set(0.18, 0.18, 0.18);
    sprite.position.copy(pos);
    scene.add(sprite);
    const vel = new THREE.Vector3(rand(-1, 1), rand(0.2, 1.5), rand(-1, 1)).multiplyScalar(2.5);
    particles.push({ sprite, vel, life: 0, maxLife: rand(0.4, 0.8) });
  }
  mat.dispose();
}
export function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life += dt;
    if (p.life >= p.maxLife) {
      scene.remove(p.sprite);
      p.sprite.material.dispose();
      particles.splice(i, 1);
      continue;
    }
    p.sprite.position.addScaledVector(p.vel, dt);
    p.vel.y -= dt * 4;
    p.sprite.material.opacity = 1 - p.life / p.maxLife;
  }
}

const shakeState = { time: 0, mag: 0 };
export function triggerShake(mag, dur) {
  if (state.screenShake === false) return;
  shakeState.mag = mag; shakeState.time = dur;
}
export function updateShakeAndApplyCamera(dt, camFittedPos) {
  if (shakeState.time > 0) {
    shakeState.time -= dt;
    const s = shakeState.mag;
    camera.position.set(
      camFittedPos.x + rand(-s, s),
      camFittedPos.y + rand(-s, s),
      camFittedPos.z + rand(-s, s)
    );
  } else {
    camera.position.copy(camFittedPos);
  }
}

export function animateSwing(part, duration = 300, magnitude = 1.2) {
  const startRot = part.rotation.z;
  const t0 = performance.now();
  function step(t) {
    const p = Math.min(1, (t - t0) / duration);
    const swing = Math.sin(p * Math.PI) * -magnitude;
    part.rotation.z = startRot + swing;
    if (p < 1) requestAnimationFrame(step);
    else part.rotation.z = startRot;
  }
  requestAnimationFrame(step);
}

export function animateLunge(obj, dir, dist, duration = 300) {
  const startPos = obj.position.clone();
  const target = startPos.clone().addScaledVector(dir, dist);
  const t0 = performance.now();
  function step(t) {
    const p = Math.min(1, (t - t0) / duration);
    const e = p < 0.5 ? p * 2 : 2 - p * 2;
    obj.position.lerpVectors(startPos, target, Math.sin(e * Math.PI / 2) * 0.5);
    if (p < 1) requestAnimationFrame(step);
    else obj.position.copy(startPos);
  }
  requestAnimationFrame(step);
}

export function flashHit(mesh) {
  mesh.traverse(c => {
    if (c.material && c.material.emissive) {
      const orig = c.material.emissive.getHex();
      c.material.emissive.setHex(0xffffff);
      setTimeout(() => { if (c.material) c.material.emissive.setHex(orig); }, 120);
    }
  });
}

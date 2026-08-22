import * as THREE from 'three';
import { camera, scene, setCameraMode, renderer } from './scene.js';
import { player, crossfadeTo } from './player.js';
import { spawnParticles } from './effects.js';
import { HUB_OFFSET, WORLD_RADIUS, HUB_SPAWN, zoneMarkers, questGivers, fieldTargets,
  explorePickups, loreMarkers, hiddenTreasures, shopLocalPos, refreshZoneVisuals, biomeNameAt, biomeCategoryAt, puddlePositions, collectNearbyFireflies, collectNearbyButterflies } from './world.js';
import { CHAPTERS } from './data.js';
import { state, isQuestDone, completeQuest, addShards, addItem,
  fieldQuestState, acceptFieldQuest, saveGame, checkAchievements } from './state.js';
import { showToast, renderQuestTracker } from './ui.js';
import { sfx, startAmbientWind, stopAmbientWind } from './audio.js';
import { startSkirmish, isSkirmishActive } from './skirmish.js';

/* ============================================================
   オープンワールド探索 ―― WASD/仮想スティック移動＋三人称追従カメラ
   ============================================================ */
export let exploreActive = false;
let mapOpen = false;
export function setMapOpen(v) { mapOpen = v; }

const localPos = new THREE.Vector3(HUB_SPAWN.x, 0, HUB_SPAWN.z);

/* ---------- 足跡デカール ---------- */
const footprintGeo = new THREE.PlaneGeometry(0.22, 0.4);
const footprintMat = new THREE.MeshBasicMaterial({ color: 0x3a2a18, transparent: true, opacity: 0.35, depthWrite: false });
const footprints = [];
let footSide = 1;
function spawnFootprint(pos, rotY) {
  const mat = footprintMat.clone();
  const mesh = new THREE.Mesh(footprintGeo, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.rotation.z = rotY;
  footSide *= -1;
  mesh.position.set(
    pos.x + Math.cos(rotY) * 0.18 * footSide,
    0.015,
    pos.z - Math.sin(rotY) * 0.18 * footSide
  );
  scene.add(mesh);
  footprints.push({ mesh, life: 0, maxLife: 6 });
}
function updateFootprints(dt) {
  for (let i = footprints.length - 1; i >= 0; i--) {
    const f = footprints[i];
    f.life += dt;
    f.mesh.material.opacity = 0.35 * Math.max(0, 1 - f.life / f.maxLife);
    if (f.life >= f.maxLife) {
      scene.remove(f.mesh);
      f.mesh.material.dispose();
      footprints.splice(i, 1);
    }
  }
}
let facing = Math.PI; // 進行方向(ラジアン)
const WALK_SPEED = 14;
const SPRINT_SPEED = 34;
const camOffset = new THREE.Vector3(0, 20, 42);
const CAM_ZOOM_MIN = 20, CAM_ZOOM_MAX = 90, CAM_ZOOM_BASE = 42;
let camZoomDist = CAM_ZOOM_BASE;
window.addEventListener('wheel', (e) => {
  if (!exploreActive) return;
  camZoomDist = Math.max(CAM_ZOOM_MIN, Math.min(CAM_ZOOM_MAX, camZoomDist + e.deltaY * 0.05));
  const zoomRatio = camZoomDist / CAM_ZOOM_BASE;
  camOffset.y = 20 * zoomRatio;
  camOffset.z = camZoomDist;
}, { passive: true });

let camOrbitYaw = 0, camOrbitPitch = 0.42;
let orbitDragging = false, orbitLastX = 0, orbitLastY = 0;
window.addEventListener('mousedown', (e) => {
  if (!exploreActive || e.button !== 2) return;
  orbitDragging = true;
  orbitLastX = e.clientX; orbitLastY = e.clientY;
});
window.addEventListener('mouseup', () => { orbitDragging = false; });
window.addEventListener('mousemove', (e) => {
  if (!orbitDragging) return;
  camOrbitYaw -= (e.clientX - orbitLastX) * 0.005;
  camOrbitPitch = Math.max(0.05, Math.min(1.2, camOrbitPitch - (e.clientY - orbitLastY) * 0.004));
  orbitLastX = e.clientX; orbitLastY = e.clientY;
});
window.addEventListener('contextmenu', (e) => {
  if (exploreActive) e.preventDefault();
});
const camCurrentPos = new THREE.Vector3();
const camLookTarget = new THREE.Vector3();
let stepTimer = 0;
let speedTrailTimer = 0;
let gpJumpHeld = false;
let gpDashHeld = false;
let gpMapHeld = false;
let gpCamResetHeld = false;
let fireflyCheckTimer = 0;
let camInit = false;
let objectiveTimer = 0;
let jumpVelY = 0;
let isJumping = false;
let jumpsUsed = 0;
const MAX_JUMPS = 2;
let spinning = false;
let spinProgress = 0;
const SPIN_DURATION = 0.4;
const GRAVITY = 32;
const JUMP_SPEED = 11;
let currentBiomeName = '';
let exploreStamina = 100;
const STAMINA_MAX = 100;
const STAMINA_DRAIN = 22;
const STAMINA_REGEN = 14;

const EXPLORE_FOG = { near: 260, far: 3200 };
const BATTLE_FOG = { near: 34, far: 80 };

const keys = { forward: false, back: false, left: false, right: false, sprint: false };
let joyVec = { x: 0, y: 0 }; // タッチ用ベクトル(-1..1)
let sprintLock = false;
let dashCooldown = 0;
let dashTimer = 0;
const DASH_DURATION = 0.18;
const DASH_SPEED = 70;
const DASH_COOLDOWN = 2.2;
const DASH_STAMINA_COST = 30;

function toggleSprintLock() {
  sprintLock = !sprintLock;
  keys.sprint = sprintLock;
  const ind = document.getElementById('sprint-lock-indicator');
  if (ind) ind.style.display = sprintLock ? 'block' : 'none';
  const btn = document.getElementById('sprint-lock-btn');
  if (btn) btn.classList.toggle('active', sprintLock);
}

function doDash() {
  if (dashCooldown > 0 || exploreStamina < DASH_STAMINA_COST) return;
  dashTimer = DASH_DURATION;
  dashCooldown = DASH_COOLDOWN;
  exploreStamina -= DASH_STAMINA_COST;
  sfx.dodgeSuccess();
  spawnParticles(player.position.clone().add(new THREE.Vector3(0, 1, 0)), 0x9fe0ff, 12);
}

function doJump() {
  if (jumpsUsed >= MAX_JUMPS) return;
  isJumping = true;
  jumpVelY = JUMP_SPEED * (jumpsUsed === 0 ? 1 : 0.85);
  jumpsUsed++;
  sfx.footstep();
  if (jumpsUsed > 1) {
    spawnParticles(player.position.clone().add(new THREE.Vector3(0, 0.6, 0)), 0xbfe0ff, 8);
    spinProgress = 0;
    spinning = true;
  }
}

function pingDirection(candidates, label, emptyMsg) {
  if (candidates.length === 0) {
    showToast(emptyMsg, 'info');
  } else {
    let nearest = null, nearestDist = Infinity;
    candidates.forEach(c => {
      const d = Math.hypot(c.localPos.x - localPos.x, c.localPos.z - localPos.z);
      if (d < nearestDist) { nearestDist = d; nearest = c; }
    });
    const dx = nearest.localPos.x - localPos.x, dz = nearest.localPos.z - localPos.z;
    const angDeg = ((Math.atan2(dx, dz) * 180 / Math.PI) + 360) % 360;
    const dirNames = ['北', '北東', '東', '南東', '南', '南西', '西', '北西'];
    const dirIdx = Math.round(angDeg / 45) % 8;
    showToast(`最も近い${label}: ${dirNames[dirIdx]}方向へ約${Math.round(nearestDist)}m`, 'quest');
  }
  sfx.uiClick();
}

window.addEventListener('keydown', (e) => {
  if (!exploreActive) return;
  if (e.code === 'KeyW' || e.code === 'ArrowUp') keys.forward = true;
  if (e.code === 'KeyS' || e.code === 'ArrowDown') keys.back = true;
  if (e.code === 'KeyA' || e.code === 'ArrowLeft') keys.left = true;
  if (e.code === 'KeyD' || e.code === 'ArrowRight') keys.right = true;
  if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') keys.sprint = true;
  if (e.code === 'KeyM' && onToggleMap) onToggleMap();
  if (e.code === 'KeyR' && !e.repeat) toggleSprintLock();
  if (e.code === 'KeyC' && !e.repeat) { camOrbitYaw = 0; camOrbitPitch = 0.42; }
  if (e.code === 'KeyT' && !e.repeat) {
    const unfound = hiddenTreasures.filter(tr => !state.foundTreasures.includes(tr.id));
    pingDirection(unfound, '未発見の秘宝', 'すべての秘宝を発見済みです');
  }
  if (e.code === 'KeyG' && !e.repeat) {
    const active = fieldTargets.filter(f => !(isQuestDone(CHAPTERS[f.chapterIndex].key, f.questId) || fieldQuestState(f.questId) === 'ready_turnin'));
    pingDirection(active, '討伐目標', '現在受注中の討伐目標はありません');
  }
  if (e.code === 'KeyQ' && !e.repeat) {
    const undone = questGivers.filter(g => !isQuestDone(CHAPTERS[g.chapterIndex].key, g.questId));
    pingDirection(undone, 'クエスト依頼人', 'すべての依頼人のクエストを達成済みです');
  }
  if (e.code === 'KeyZ' && !e.repeat) {
    const unfinished = zoneMarkers.filter(z => z.chapterIndex >= state.chapterIndex);
    pingDirection(unfinished, '聖域', 'すべての聖域を制覇済みです');
  }
  if (e.code === 'KeyE' && !e.repeat) doDash();
  if (e.code === 'KeyF' && !e.repeat) {
    sfx.achievement();
    const colors = [0xffd700, 0xff6a9f, 0x66eaff, 0x9fff7a];
    colors.forEach((c, i) => {
      spawnParticles(player.position.clone().add(new THREE.Vector3(0, 1.6 + i * 0.15, 0)), c, 10);
    });
  }
  if (e.code === 'KeyP' && !e.repeat) {
    try {
      const dataUrl = renderer.domElement.toDataURL('image/png');
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = `bosusen-${Date.now()}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      sfx.uiClick();
    } catch (err) {
      console.error('スクリーンショットの保存に失敗', err);
    }
  }
  if (e.code === 'Space' && !e.repeat) doJump();
});
window.addEventListener('keyup', (e) => {
  if (e.code === 'KeyW' || e.code === 'ArrowUp') keys.forward = false;
  if (e.code === 'KeyS' || e.code === 'ArrowDown') keys.back = false;
  if (e.code === 'KeyA' || e.code === 'ArrowLeft') keys.left = false;
  if (e.code === 'KeyD' || e.code === 'ArrowRight') keys.right = false;
  if ((e.code === 'ShiftLeft' || e.code === 'ShiftRight') && !sprintLock) keys.sprint = false;
});

/* ---------- 仮想スティック(モバイル/マウスドラッグ両対応) ---------- */
let joyBase = null, joyKnob = null, joyPointerId = null, joyOrigin = { x: 0, y: 0 };
export function initJoystick() {
  joyBase = document.getElementById('joy-base');
  joyKnob = document.getElementById('joy-knob');
  const sprintBtn = document.getElementById('sprint-lock-btn');
  if (sprintBtn) sprintBtn.addEventListener('click', () => { if (exploreActive) toggleSprintLock(); });
  if (!joyBase || !joyKnob) return;

  const onDown = (e) => {
    if (!exploreActive) return;
    joyPointerId = e.pointerId;
    const rect = joyBase.getBoundingClientRect();
    joyOrigin = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    joyBase.setPointerCapture(e.pointerId);
    updateJoy(e.clientX, e.clientY);
  };
  const onMove = (e) => {
    if (joyPointerId !== e.pointerId) return;
    updateJoy(e.clientX, e.clientY);
  };
  const onUp = (e) => {
    if (joyPointerId !== e.pointerId) return;
    joyPointerId = null;
    joyVec = { x: 0, y: 0 };
    joyKnob.style.transform = 'translate(-50%, -50%)';
  };
  function updateJoy(cx, cy) {
    const maxR = 42;
    let dx = cx - joyOrigin.x, dy = cy - joyOrigin.y;
    const dist = Math.min(maxR, Math.hypot(dx, dy));
    const ang = Math.atan2(dy, dx);
    dx = Math.cos(ang) * dist; dy = Math.sin(ang) * dist;
    joyVec = { x: dx / maxR, y: dy / maxR };
    joyKnob.style.transform = `translate(${dx - 21}px, ${dy - 21}px)`;
  }
  joyBase.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
}

/* ---------- コールバック ---------- */
let onEnterZone = null;
export function setOnEnterZone(fn) { onEnterZone = fn; }
let onOpenShop = null;
export function setOnOpenShop(fn) { onOpenShop = fn; }
let onToggleMap = null;
export function setOnToggleMap(fn) { onToggleMap = fn; }

export function enterExploreMode(spawnLocal) {
  exploreActive = true;
  setCameraMode('explore');
  camera.far = 6000;
  camera.updateProjectionMatrix();
  scene.fog.near = EXPLORE_FOG.near;
  scene.fog.far = EXPLORE_FOG.far;
  if (spawnLocal) localPos.copy(spawnLocal);
  jumpVelY = 0;
  isJumping = false;
  jumpsUsed = 0;
  dashCooldown = 0;
  dashTimer = 0;
  exploreStamina = STAMINA_MAX;
  player.position.set(HUB_OFFSET.x + localPos.x, 0, HUB_OFFSET.z + localPos.z);
  player.rotation.y = facing + Math.PI;
  crossfadeTo('Idle', 0.2);
  refreshZoneVisuals(state.chapterIndex);
  explorePickups.forEach(p => {
    const pDone = isQuestDone(CHAPTERS[p.chapterIndex].key, p.questId);
    if (pDone) p.mesh.visible = false;
    if (p.beam) p.beam.visible = !pDone;
  });
  hiddenTreasures.forEach(t => {
    const found = state.foundTreasures.includes(t.id);
    t.mesh.visible = !found;
    if (t.beam) t.beam.visible = !found;
  });
  fieldTargets.forEach(t => {
    const done = isQuestDone(CHAPTERS[t.chapterIndex].key, t.questId) || fieldQuestState(t.questId) === 'ready_turnin';
    if (done) {
      t.material.emissiveIntensity = 0.1;
      t.light.intensity = 0.2;
    }
    if (t.beam) t.beam.visible = !done;
  });
  questGivers.forEach(g => {
    if (g.beam) g.beam.visible = !isQuestDone(CHAPTERS[g.chapterIndex].key, g.questId);
  });
  loreMarkers.forEach(m => {
    if (m.beam) m.beam.visible = !isQuestDone(CHAPTERS[m.chapterIndex].key, m.questId);
  });
  camInit = false;
  document.getElementById('explore-hud').style.display = 'flex';
  document.getElementById('ui').classList.add('exploring');
  startAmbientWind();
}

export function exitExploreMode() {
  exploreActive = false;
  stopAmbientWind();
  setCameraMode('battle');
  camera.far = 200;
  camera.updateProjectionMatrix();
  scene.fog.near = BATTLE_FOG.near;
  scene.fog.far = BATTLE_FOG.far;
  keys.forward = keys.back = keys.left = keys.right = keys.sprint = false;
  sprintLock = false;
  const ind = document.getElementById('sprint-lock-indicator');
  if (ind) ind.style.display = 'none';
  const btn = document.getElementById('sprint-lock-btn');
  if (btn) btn.classList.remove('active');
  const objEl = document.getElementById('nearest-objective');
  if (objEl) objEl.style.display = 'none';
  joyVec = { x: 0, y: 0 };
  const hud = document.getElementById('explore-hud');
  if (hud) hud.style.display = 'none';
  document.getElementById('ui').classList.remove('exploring');
}

let wasMoving = false;
let zoneHintShown = null;
let npcHintShown = null;
let targetHintShown = null;
let loreHintShown = null;
let shopHintShown = false;

function tryTurnInOrAccept(giver) {
  const chapterKey = CHAPTERS[giver.chapterIndex].key;
  const fState = fieldQuestState(giver.questId);
  if (isQuestDone(chapterKey, giver.questId)) {
    showToast(`${giver.name}：「もう十分だ、ありがとう」`, 'info');
    return;
  }
  if (fState === 'ready_turnin') {
    completeQuest(chapterKey, giver.questId);
    addShards(giver.quest.reward.shards);
    if (giver.quest.reward.itemId) addItem(giver.quest.reward.itemId);
    sfx.questDone();
    showToast(`クエスト達成: ${giver.quest.title}（結晶の欠片 +${giver.quest.reward.shards}）`, 'quest');
    checkAchievements(hiddenTreasures.length).forEach(a => { sfx.achievement(); showToast(`実績解除: ${a.name}（欠片+${a.reward || 0}）`, 'quest'); spawnParticles(player.position.clone().add(new THREE.Vector3(0, 1.6, 0)), 0xffd700, 18); });
    if (giver.beam) giver.beam.visible = false;
    renderQuestTracker();
    saveGame();
  } else if (fState === 'accepted') {
    showToast(`${giver.name}：「まだ討伐が済んでいないようだ」`, 'info');
  } else {
    acceptFieldQuest(giver.questId);
    showToast(`受注: ${giver.quest.title}｜${giver.quest.desc}`, 'quest');
    saveGame();
  }
}

function tryDefeatTarget(target) {
  const chapterKey = CHAPTERS[target.chapterIndex].key;
  if (isQuestDone(chapterKey, target.questId)) return;
  const fState = fieldQuestState(target.questId);
  if (fState === 'accepted') {
    startSkirmish(target);
  } else if (fState === 'ready_turnin') {
    showToast('依頼人の元へ戻って報告しよう', 'info');
  } else {
    showToast('まずは依頼人から討伐を受注しよう', 'info');
  }
}

function tryCollectPickup(pickup) {
  const chapterKey = CHAPTERS[pickup.chapterIndex].key;
  if (isQuestDone(chapterKey, pickup.questId)) return;
  completeQuest(chapterKey, pickup.questId);
  addShards(pickup.quest.reward.shards);
  if (pickup.quest.reward.itemId) addItem(pickup.quest.reward.itemId);
  sfx.shardGet();
  showToast(`クエスト達成: ${pickup.quest.title}｜${pickup.quest.result}`, 'quest');
  checkAchievements(hiddenTreasures.length).forEach(a => { sfx.achievement(); showToast(`実績解除: ${a.name}（欠片+${a.reward || 0}）`, 'quest'); spawnParticles(player.position.clone().add(new THREE.Vector3(0, 1.6, 0)), 0xffd700, 18); });
  pickup.mesh.visible = false;
  if (pickup.beam) pickup.beam.visible = false;
  renderQuestTracker();
  saveGame();
}

function tryCollectTreasure(t) {
  if (state.foundTreasures.includes(t.id)) return;
  state.foundTreasures.push(t.id);
  addShards(t.shardReward);
  sfx.shardGet();
  showToast(`結晶の秘宝を発見！ 結晶の欠片 +${t.shardReward}`, 'quest');
  t.mesh.visible = false;
  if (t.beam) t.beam.visible = false;
  checkAchievements(hiddenTreasures.length).forEach(a => { sfx.achievement(); showToast(`実績解除: ${a.name}（欠片+${a.reward || 0}）`, 'quest'); spawnParticles(player.position.clone().add(new THREE.Vector3(0, 1.6, 0)), 0xffd700, 18); });
  saveGame();
}

function tryReadLore(monu) {
  const chapterKey = CHAPTERS[monu.chapterIndex].key;
  if (isQuestDone(chapterKey, monu.questId)) return;
  completeQuest(chapterKey, monu.questId);
  addShards(monu.quest.reward.shards);
  sfx.questDone();
  showToast(`クエスト達成: ${monu.quest.title}｜${monu.quest.result}`, 'quest');
  checkAchievements(hiddenTreasures.length).forEach(a => { sfx.achievement(); showToast(`実績解除: ${a.name}（欠片+${a.reward || 0}）`, 'quest'); spawnParticles(player.position.clone().add(new THREE.Vector3(0, 1.6, 0)), 0xffd700, 18); });
  if (monu.beam) monu.beam.visible = false;
  renderQuestTracker();
  saveGame();
}

export function updateExplore(dt) {
  updateFootprints(dt);
  if (!exploreActive) return;
  if (isSkirmishActive()) return;
  if (mapOpen) return;

  let mx = 0, mz = 0;
  if (keys.forward) mz -= 1;
  if (keys.back) mz += 1;
  if (keys.left) mx -= 1;
  if (keys.right) mx += 1;
  mx += joyVec.x;
  mz += joyVec.y;

  const gp = navigator.getGamepads ? navigator.getGamepads()[0] : null;
  if (gp) {
    const gx = gp.axes[0] || 0, gy = gp.axes[1] || 0;
    const deadzone = 0.15;
    if (Math.abs(gx) > deadzone) mx += gx;
    if (Math.abs(gy) > deadzone) mz += gy;
    if (gp.buttons[0] && gp.buttons[0].pressed && !gpJumpHeld) { gpJumpHeld = true; doJump(); }
    if (!(gp.buttons[0] && gp.buttons[0].pressed)) gpJumpHeld = false;
    if (gp.buttons[1] && gp.buttons[1].pressed && !gpDashHeld) { gpDashHeld = true; doDash(); }
    if (!(gp.buttons[1] && gp.buttons[1].pressed)) gpDashHeld = false;
    keys.sprint = keys.sprint || (gp.buttons[10] && gp.buttons[10].pressed);
    const rx = gp.axes[2] || 0, ry = gp.axes[3] || 0;
    if (Math.abs(rx) > 0.2) camOrbitYaw -= rx * dt * 2.5;
    if (Math.abs(ry) > 0.2) camOrbitPitch = Math.max(0.05, Math.min(1.2, camOrbitPitch + ry * dt * 2));
    if (gp.buttons[9] && gp.buttons[9].pressed && !gpMapHeld) { gpMapHeld = true; if (onToggleMap) onToggleMap(); }
    if (!(gp.buttons[9] && gp.buttons[9].pressed)) gpMapHeld = false;
    if (gp.buttons[3] && gp.buttons[3].pressed && !gpCamResetHeld) { gpCamResetHeld = true; camOrbitYaw = 0; camOrbitPitch = 0.42; }
    if (!(gp.buttons[3] && gp.buttons[3].pressed)) gpCamResetHeld = false;
  }

  dashCooldown = Math.max(0, dashCooldown - dt);
  const dashing = dashTimer > 0;
  if (dashing) dashTimer -= dt;

  let len = Math.hypot(mx, mz);
  let moving = len > 0.08;
  if (dashing && !moving) {
    mx = Math.sin(facing); mz = Math.cos(facing);
    len = 1;
    moving = true;
  }
  const sprinting = keys.sprint && exploreStamina > 0.5 && moving && !dashing;
  const speed = dashing ? DASH_SPEED : (sprinting ? SPRINT_SPEED : WALK_SPEED);
  if (sprinting) {
    exploreStamina = Math.max(0, exploreStamina - STAMINA_DRAIN * dt);
  } else {
    exploreStamina = Math.min(STAMINA_MAX, exploreStamina + STAMINA_REGEN * dt);
  }
  const staminaEl = document.getElementById('explore-stamina-fill');
  if (staminaEl) {
    const pct = (exploreStamina / STAMINA_MAX) * 100;
    staminaEl.style.width = pct + '%';
    staminaEl.classList.toggle('low', pct < 30);
  }
  const dashIconEl = document.getElementById('dash-cooldown-icon');
  if (dashIconEl) dashIconEl.classList.toggle('ready', dashCooldown <= 0 && exploreStamina >= DASH_STAMINA_COST);
  if (moving) {
    mx /= len; mz /= len;
    const moveAng = Math.atan2(mx, mz);
    facing = moveAng;
    localPos.x += Math.sin(moveAng) * speed * dt;
    localPos.z += Math.cos(moveAng) * speed * dt;
    state.totalDistanceTraveled = (state.totalDistanceTraveled || 0) + speed * dt;
    const r = Math.hypot(localPos.x, localPos.z);
    if (r > WORLD_RADIUS - 4) {
      const s = (WORLD_RADIUS - 4) / r;
      localPos.x *= s; localPos.z *= s;
    }
    player.position.set(HUB_OFFSET.x + localPos.x, player.position.y, HUB_OFFSET.z + localPos.z);
    player.rotation.y = facing + Math.PI;
    stepTimer -= dt;
    if (stepTimer <= 0) {
      const inPuddle = puddlePositions.some(p => Math.hypot(localPos.x - p.x, localPos.z - p.z) < p.r);
      if (inPuddle) {
        sfx.footstepWater();
        spawnParticles(player.position.clone().add(new THREE.Vector3(0, 0.05, 0)), 0x9fc4e0, 8);
      } else {
        const cat = biomeCategoryAt(localPos.x, localPos.z);
        if (cat === 'desert') sfx.footstepSand();
        else if (cat === 'snow') sfx.footstepSnow();
        else if (cat === 'cyber') sfx.footstepMetal();
        else sfx.footstep();
        spawnParticles(player.position.clone().add(new THREE.Vector3(0, 0.05, 0)), 0xcabf9a, 4);
        spawnFootprint(player.position, facing);
      }
      stepTimer = sprinting ? 0.22 : 0.36;
    }
    if (sprinting || dashing) {
      speedTrailTimer -= dt;
      if (speedTrailTimer <= 0) {
        const behindX = player.position.x + Math.sin(facing) * 0.5;
        const behindZ = player.position.z + Math.cos(facing) * 0.5;
        spawnParticles(new THREE.Vector3(behindX, player.position.y + 0.5, behindZ), dashing ? 0x9fe0ff : 0xffffff, 3);
        speedTrailTimer = 0.05;
      }
    }
  } else {
    stepTimer = 0;
    player.position.set(HUB_OFFSET.x + localPos.x, player.position.y, HUB_OFFSET.z + localPos.z);
  }
  if (isJumping) {
    jumpVelY -= GRAVITY * dt;
    let ny = player.position.y + jumpVelY * dt;
    if (ny <= 0) {
      ny = 0;
      isJumping = false;
      jumpVelY = 0;
      jumpsUsed = 0;
      spinning = false;
      player.rotation.x = 0;
      spawnParticles(player.position.clone().set(player.position.x, 0.05, player.position.z), 0xcabf9a, 10);
    }
    player.position.y = ny;
  }
  if (spinning) {
    spinProgress += dt;
    player.rotation.x = Math.min(1, spinProgress / SPIN_DURATION) * Math.PI * 2;
    if (spinProgress >= SPIN_DURATION) { spinning = false; player.rotation.x = 0; }
  }
  if (moving && !wasMoving) crossfadeTo('Walk', 0.15);
  if (!moving && wasMoving) crossfadeTo('Idle', 0.25);
  wasMoving = moving;

  fireflyCheckTimer -= dt;
  if (fireflyCheckTimer <= 0) {
    fireflyCheckTimer = 0.3;
    const caught = collectNearbyFireflies(localPos.x, localPos.z, 2.5);
    if (caught > 0) {
      addShards(caught * 2);
      state.firefliesCaught = (state.firefliesCaught || 0) + caught;
      sfx.shardGet();
      spawnParticles(player.position.clone().add(new THREE.Vector3(0, 1.2, 0)), 0xbdffa0, 6 * caught);
      showToast(`蛍を捕まえた！ 結晶の欠片 +${caught * 2}`, 'quest');
      checkAchievements(hiddenTreasures.length).forEach(a => { sfx.achievement(); showToast(`実績解除: ${a.name}（欠片+${a.reward || 0}）`, 'quest'); });
      saveGame();
    }
    const caughtB = collectNearbyButterflies(localPos.x, localPos.z, 2.2);
    if (caughtB > 0) {
      addShards(caughtB);
      state.butterfliesCaught = (state.butterfliesCaught || 0) + caughtB;
      sfx.shardGet();
      spawnParticles(player.position.clone().add(new THREE.Vector3(0, 1.2, 0)), 0xff9fd0, 5 * caughtB);
      showToast(`蝶を捕まえた！ 結晶の欠片 +${caughtB}`, 'quest');
      checkAchievements(hiddenTreasures.length).forEach(a => { sfx.achievement(); showToast(`実績解除: ${a.name}（欠片+${a.reward || 0}）`, 'quest'); });
      saveGame();
    }
  }

  if (moving) {
    const name = biomeNameAt(localPos.x, localPos.z);
    if (name && name !== currentBiomeName) {
      currentBiomeName = name;
      const isNew = !state.discoveredBiomes.includes(name);
      if (isNew) {
        state.discoveredBiomes.push(name);
        addShards(5);
        sfx.questDone();
        [0xffd700, 0x9fe0ff, 0xff9fd0, 0x9fff7a].forEach((c, i) => {
          spawnParticles(player.position.clone().add(new THREE.Vector3(0, 1.4 + i * 0.15, 0)), c, 8);
        });
        showToast(`新しいバイオーム発見: ${name}（${state.discoveredBiomes.length}/35） 結晶の欠片+5`, 'quest');
        checkAchievements(hiddenTreasures.length).forEach(a => { sfx.achievement(); showToast(`実績解除: ${a.name}（欠片+${a.reward || 0}）`, 'quest'); });
        saveGame();
      } else {
        showToast(`${name} に入った`, 'quest');
      }
    }
  }

  // 三人称追従カメラ（右クリックドラッグで自由に見回せる）
  const behindAng = facing + camOrbitYaw;
  const pitchHeight = Math.sin(camOrbitPitch) * camOffset.z;
  const pitchDist = Math.cos(camOrbitPitch) * camOffset.z;
  const desiredCamPos = new THREE.Vector3(
    player.position.x - Math.sin(behindAng) * pitchDist,
    player.position.y + pitchHeight,
    player.position.z - Math.cos(behindAng) * pitchDist
  );
  if (!camInit) { camCurrentPos.copy(desiredCamPos); camInit = true; }
  camCurrentPos.lerp(desiredCamPos, Math.min(1, dt * 5));
  camera.position.copy(camCurrentPos);
  camLookTarget.set(player.position.x, player.position.y + 1.6, player.position.z);
  camera.lookAt(camLookTarget);

  // ゾーン接近判定
  let nearZone = null;
  for (const z of zoneMarkers) {
    if (Math.hypot(localPos.x - z.localPos.x, localPos.z - z.localPos.z) < z.radius) { nearZone = z; break; }
  }
  if (nearZone && zoneHintShown !== nearZone.key) {
    zoneHintShown = nearZone.key;
    if (nearZone.chapterIndex < state.chapterIndex) {
      showToast(`${nearZone.name}：すでに平定済みの聖域だ`, 'info');
    } else if (nearZone.chapterIndex > state.chapterIndex) {
      showToast('まだこの先には進めない……', 'info');
    } else if (onEnterZone) {
      onEnterZone(nearZone.chapterIndex);
    }
  } else if (!nearZone) {
    zoneHintShown = null;
  }

  // クエスト依頼人
  let nearNpc = null;
  for (const g of questGivers) {
    if (Math.hypot(localPos.x - g.localPos.x, localPos.z - g.localPos.z) < g.radius) { nearNpc = g; break; }
  }
  if (nearNpc && npcHintShown !== nearNpc.questId) {
    npcHintShown = nearNpc.questId;
    tryTurnInOrAccept(nearNpc);
  } else if (!nearNpc) {
    npcHintShown = null;
  }

  // 討伐目標
  let nearTarget = null;
  for (const tgt of fieldTargets) {
    if (Math.hypot(localPos.x - tgt.localPos.x, localPos.z - tgt.localPos.z) < tgt.radius) { nearTarget = tgt; break; }
  }
  if (nearTarget && targetHintShown !== nearTarget.questId) {
    targetHintShown = nearTarget.questId;
    tryDefeatTarget(nearTarget);
  } else if (!nearTarget) {
    targetHintShown = null;
  }

  // 探索クエスト（採取ポイント）
  for (const p of explorePickups) {
    if (p.mesh.visible && Math.hypot(localPos.x - p.localPos.x, localPos.z - p.localPos.z) < p.radius) {
      tryCollectPickup(p);
    }
  }

  // 隠しボーナスアイテム（結晶の秘宝）
  for (const t of hiddenTreasures) {
    if (t.mesh.visible && Math.hypot(localPos.x - t.localPos.x, localPos.z - t.localPos.z) < t.radius) {
      tryCollectTreasure(t);
    }
  }

  // ロアクエスト（石碑）
  let nearLore = null;
  for (const m of loreMarkers) {
    if (Math.hypot(localPos.x - m.localPos.x, localPos.z - m.localPos.z) < m.radius) { nearLore = m; break; }
  }
  if (nearLore && loreHintShown !== nearLore.questId) {
    loreHintShown = nearLore.questId;
    tryReadLore(nearLore);
  } else if (!nearLore) {
    loreHintShown = null;
  }

  // 商店
  const nearShop = Math.hypot(localPos.x - shopLocalPos.x, localPos.z - shopLocalPos.z) < 4;
  if (nearShop && !shopHintShown) {
    shopHintShown = true;
    if (onOpenShop) onOpenShop();
  } else if (!nearShop) {
    shopHintShown = false;
  }

  objectiveTimer -= dt;
  if (objectiveTimer <= 0) {
    objectiveTimer = 0.5;
    updateNearestObjective();
    checkAchievements(hiddenTreasures.length).forEach(a => { sfx.achievement(); showToast(`実績解除: ${a.name}（欠片+${a.reward || 0}）`, 'quest'); spawnParticles(player.position.clone().add(new THREE.Vector3(0, 1.6, 0)), 0xffd700, 18); });
  }
}

function updateNearestObjective() {
  const el = document.getElementById('nearest-objective');
  if (!el) return;
  if (state.showObjectiveHint === false) { el.style.display = 'none'; return; }
  const candidates = [];
  fieldTargets.forEach(t => {
    const chapterKey = CHAPTERS[t.chapterIndex].key;
    if (fieldQuestState(t.questId) === 'accepted' && !isQuestDone(chapterKey, t.questId)) {
      candidates.push({ name: `討伐: ${t.name}`, pos: t.localPos });
    }
  });
  questGivers.forEach(g => {
    const chapterKey = CHAPTERS[g.chapterIndex].key;
    if (!isQuestDone(chapterKey, g.questId) && fieldQuestState(g.questId) !== 'accepted') {
      candidates.push({ name: `依頼人: ${g.name}`, pos: g.localPos });
    }
  });
  explorePickups.forEach(p => {
    if (p.mesh.visible) candidates.push({ name: '採取物', pos: p.localPos });
  });
  loreMarkers.forEach(m => {
    const chapterKey = CHAPTERS[m.chapterIndex].key;
    if (!isQuestDone(chapterKey, m.questId)) candidates.push({ name: '石碑', pos: m.localPos });
  });
  hiddenTreasures.forEach(t => {
    if (t.mesh.visible) candidates.push({ name: '結晶の秘宝', pos: t.localPos });
  });
  if (candidates.length === 0) { el.style.display = 'none'; return; }
  let nearest = null, nearestDist = Infinity;
  candidates.forEach(c => {
    const d = Math.hypot(localPos.x - c.pos.x, localPos.z - c.pos.z);
    if (d < nearestDist) { nearestDist = d; nearest = c; }
  });
  el.style.display = 'block';
  el.textContent = `${nearest.name}（残り${Math.round(nearestDist)}m）`;
}

export function getExploreLocalPos() { return localPos; }
export function setExploreLocalPos(v) { localPos.copy(v); }
export function getPlayerLocalPos() { return localPos; }
export function getZoneMarkersRef() { return zoneMarkers; }

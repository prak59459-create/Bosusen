import * as THREE from 'three';
import { camera, scene, setCameraMode } from './scene.js';
import { player, crossfadeTo } from './player.js';
import { spawnParticles } from './effects.js';
import { HUB_OFFSET, WORLD_RADIUS, HUB_SPAWN, zoneMarkers, questGivers, fieldTargets,
  explorePickups, loreMarkers, hiddenTreasures, shopLocalPos, refreshZoneVisuals } from './world.js';
import { CHAPTERS } from './data.js';
import { state, isQuestDone, completeQuest, addShards, addItem,
  fieldQuestState, acceptFieldQuest, saveGame, checkAchievements } from './state.js';
import { showToast, renderQuestTracker } from './ui.js';
import { sfx } from './audio.js';
import { startSkirmish, isSkirmishActive } from './skirmish.js';

/* ============================================================
   オープンワールド探索 ―― WASD/仮想スティック移動＋三人称追従カメラ
   ============================================================ */
export let exploreActive = false;
let mapOpen = false;
export function setMapOpen(v) { mapOpen = v; }

const localPos = new THREE.Vector3(HUB_SPAWN.x, 0, HUB_SPAWN.z);
let facing = Math.PI; // 進行方向(ラジアン)
const WALK_SPEED = 14;
const SPRINT_SPEED = 34;
const camOffset = new THREE.Vector3(0, 20, 42);
const camCurrentPos = new THREE.Vector3();
const camLookTarget = new THREE.Vector3();
let stepTimer = 0;
let camInit = false;
let objectiveTimer = 0;
let jumpVelY = 0;
let isJumping = false;
const GRAVITY = 32;
const JUMP_SPEED = 11;
let exploreStamina = 100;
const STAMINA_MAX = 100;
const STAMINA_DRAIN = 22;
const STAMINA_REGEN = 14;

const EXPLORE_FOG = { near: 260, far: 3200 };
const BATTLE_FOG = { near: 34, far: 80 };

const keys = { forward: false, back: false, left: false, right: false, sprint: false };
let joyVec = { x: 0, y: 0 }; // タッチ用ベクトル(-1..1)
let sprintLock = false;

function toggleSprintLock() {
  sprintLock = !sprintLock;
  keys.sprint = sprintLock;
  const ind = document.getElementById('sprint-lock-indicator');
  if (ind) ind.style.display = sprintLock ? 'block' : 'none';
  const btn = document.getElementById('sprint-lock-btn');
  if (btn) btn.classList.toggle('active', sprintLock);
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
  if (e.code === 'Space' && !isJumping) { isJumping = true; jumpVelY = JUMP_SPEED; sfx.footstep(); }
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
  exploreStamina = STAMINA_MAX;
  player.position.set(HUB_OFFSET.x + localPos.x, 0, HUB_OFFSET.z + localPos.z);
  player.rotation.y = facing + Math.PI;
  crossfadeTo('Idle', 0.2);
  refreshZoneVisuals(state.chapterIndex);
  explorePickups.forEach(p => {
    if (isQuestDone(CHAPTERS[p.chapterIndex].key, p.questId)) p.mesh.visible = false;
  });
  hiddenTreasures.forEach(t => {
    t.mesh.visible = !state.foundTreasures.includes(t.id);
  });
  fieldTargets.forEach(t => {
    if (isQuestDone(CHAPTERS[t.chapterIndex].key, t.questId) || fieldQuestState(t.questId) === 'ready_turnin') {
      t.material.emissiveIntensity = 0.1;
      t.light.intensity = 0.2;
    }
  });
  camInit = false;
  document.getElementById('explore-hud').style.display = 'flex';
  document.getElementById('ui').classList.add('exploring');
}

export function exitExploreMode() {
  exploreActive = false;
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
  renderQuestTracker();
  saveGame();
}

export function updateExplore(dt) {
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

  const len = Math.hypot(mx, mz);
  const moving = len > 0.08;
  const sprinting = keys.sprint && exploreStamina > 0.5 && moving;
  const speed = sprinting ? SPRINT_SPEED : WALK_SPEED;
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
      sfx.footstep();
      spawnParticles(player.position.clone().add(new THREE.Vector3(0, 0.05, 0)), 0xcabf9a, 4);
      stepTimer = sprinting ? 0.22 : 0.36;
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
      spawnParticles(player.position.clone().set(player.position.x, 0.05, player.position.z), 0xcabf9a, 10);
    }
    player.position.y = ny;
  }
  if (moving && !wasMoving) crossfadeTo('Walk', 0.15);
  if (!moving && wasMoving) crossfadeTo('Idle', 0.25);
  wasMoving = moving;

  // 三人称追従カメラ
  const behindAng = facing;
  const desiredCamPos = new THREE.Vector3(
    player.position.x - Math.sin(behindAng) * camOffset.z,
    player.position.y + camOffset.y,
    player.position.z - Math.cos(behindAng) * camOffset.z
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

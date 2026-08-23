import * as THREE from 'three';
import { camera, scene, setCameraMode, renderer, setPhotoFilter, PHOTO_FILTERS, setFovKick, isNightTime, getTimeOfDayLabel } from './scene.js';
import { player, crossfadeTo } from './player.js';
import { spawnParticles } from './effects.js';
import { HUB_OFFSET, WORLD_RADIUS, HUB_SPAWN, zoneMarkers, questGivers, fieldTargets,
  explorePickups, loreMarkers, hiddenTreasures, shopLocalPos, refreshZoneVisuals, biomeNameAt, biomeCategoryAt, puddlePositions, collectNearbyFireflies, collectNearbyButterflies, collectNearbySpirits, updateCampfires, nearestCampfire, BIOME_NAMES, undiscoveredBiomeSpots } from './world.js';
import { CHAPTERS, EMOTES } from './data.js';
import { state, isQuestDone, completeQuest, addShards, addItem,
  fieldQuestState, acceptFieldQuest, saveGame, checkAchievements, equipItem, unequipSlot, ngPlusShardMult, isFieldTargetHuntable, registerCollect, collectComboMult, COLLECT_COMBO_WINDOW_MS, currentWeather } from './state.js';
import { showToast, renderQuestTracker, showCenterMsg, addScreenshotToGallery, copyImageToClipboard } from './ui.js';
import { sfx, startAmbientWind, stopAmbientWind } from './audio.js';
import { startSkirmish, isSkirmishActive, scheduleHuntRespawn } from './skirmish.js';

/* ============================================================
   オープンワールド探索 ―― WASD/仮想スティック移動＋三人称追従カメラ
   ============================================================ */
export let exploreActive = false;
let mapOpen = false;
export function setMapOpen(v) { mapOpen = v; }

const DUST_COLOR_BY_CATEGORY = {
  forest: 0x9ab26a, desert: 0xd8b168, cyber: 0x66ccff, snow: 0xffffff,
  swamp: 0x6a8a4a, volcanic: 0xff8844, crystal: 0xd0a0ff, wasteland: 0x9a9284,
};

const localPos = new THREE.Vector3(HUB_SPAWN.x, 0, HUB_SPAWN.z);

/* ---------- 足跡デカール ---------- */
const footprintGeo = new THREE.PlaneGeometry(0.22, 0.4);
const footprintMat = new THREE.MeshBasicMaterial({ color: 0x3a2a18, transparent: true, opacity: 0.35, depthWrite: false });
const footprints = [];
let footSide = 1;
const FOOTPRINT_COLOR_BY_CATEGORY = {
  desert: 0x8a6a3a, snow: 0xaacfe0, cyber: 0x2a3a4a, volcanic: 0x1a0f08,
};
function spawnFootprint(pos, rotY, category) {
  const mat = footprintMat.clone();
  if (FOOTPRINT_COLOR_BY_CATEGORY[category]) mat.color.setHex(FOOTPRINT_COLOR_BY_CATEGORY[category]);
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
  const maxLife = category === 'snow' ? 16 : (category === 'volcanic' ? 3 : 6);
  footprints.push({ mesh, life: 0, maxLife });
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
let photoFilterMode = 0;
let orbitDragging = false, orbitLastX = 0, orbitLastY = 0;
window.addEventListener('mousedown', (e) => {
  if (!exploreActive || e.button !== 2) return;
  orbitDragging = true;
  orbitLastX = e.clientX; orbitLastY = e.clientY;
});
window.addEventListener('mouseup', () => { orbitDragging = false; });
window.addEventListener('mousemove', (e) => {
  if (!orbitDragging) return;
  const sens = state.cameraSensitivity || 1;
  camOrbitYaw -= (e.clientX - orbitLastX) * 0.005 * sens;
  const pitchDelta = (e.clientY - orbitLastY) * 0.004 * sens * (state.invertCameraY ? -1 : 1);
  camOrbitPitch = Math.max(0.05, Math.min(1.2, camOrbitPitch - pitchDelta));
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
let gpFilterHeld = false;
let gpHubReturnHeld = false;
let gpEmoteHeld = false;
let gpLoadoutHeld = false;
let gpMuteHeld = false;
let gpPhotoGridHeld = false;
let fireflyCheckTimer = 0;

/**
 * 蛍・蝶・精霊球の採取処理。3種で欠片量・音・色以外は同じ扱いなので一本化する。
 * 連続して採取するとコンボが伸び、獲得欠片に倍率がかかる。
 * @param {number} count 捕まえた数（0 なら何もしない）
 * @param {{label:string, per:number, counter:string, color:number, height:number, particles:number, sound:function}} opt
 */
/** 焚き火のそばで休む。探索スタミナを満タンにして記録を残す */
function restAtCampfire() {
  const here = nearestCampfire(localPos.x, localPos.z, 4);
  if (!here) { showToast('近くに焚き火がありません', 'info'); return; }
  if (exploreStamina >= exploreStaminaMax() - 0.5) {
    showToast('十分に休んでいる', 'info');
    return;
  }
  exploreStamina = exploreStaminaMax();
  state.campfireRests = (state.campfireRests || 0) + 1;
  sfx.heal();
  spawnParticles(player.position.clone().add(new THREE.Vector3(0, 1.2, 0)), 0xffa03c, 14);
  showToast('焚き火で休んだ。探索スタミナが回復した', 'quest');
  checkAchievements(hiddenTreasures.length).forEach(a => { sfx.achievement(); showToast(`実績解除: ${a.name}（欠片+${a.reward || 0}）`, 'quest'); });
  saveGame();
}

/** 採取コンボの残り猶予と倍率を HUD に反映する（コンボが無いときは隠す） */
function updateComboHud() {
  const el = document.getElementById('collect-combo');
  if (!el) return;
  const left = COLLECT_COMBO_WINDOW_MS - (Date.now() - (state.collectComboAt || 0));
  if (!state.collectCombo || left <= 0) {
    if (el.style.display !== 'none') el.style.display = 'none';
    return;
  }
  el.style.display = '';
  const mult = collectComboMult();
  el.classList.toggle('hot', mult > 1);
  document.getElementById('collect-combo-text').textContent = `コンボ ${state.collectCombo} ×${mult.toFixed(1)}`;
  document.getElementById('collect-combo-fill').style.width = `${(left / COLLECT_COMBO_WINDOW_MS) * 100}%`;
}

function harvest(count, opt) {
  if (count <= 0) return;
  const { combo, mult } = registerCollect(count);
  // 雨や霧の日は採取量が増える
  const weather = currentWeather();
  const gain = Math.max(1, Math.round(count * opt.per * mult * weather.shardMult));
  addShards(gain);
  state[opt.counter] = (state[opt.counter] || 0) + count;
  opt.sound();
  spawnParticles(player.position.clone().add(new THREE.Vector3(0, opt.height, 0)), opt.color, opt.particles * count);
  const comboTag = mult > 1 ? `（コンボ${combo} ×${mult.toFixed(1)}）` : '';
  const weatherTag = weather.shardMult > 1 ? `［${weather.icon}${weather.name}の恵み］` : '';
  showToast(`${opt.label}！ 結晶の欠片 +${gain}${comboTag}${weatherTag}`, 'quest');
  checkAchievements(hiddenTreasures.length).forEach((a, i) => { sfx.achievement(); showToast(`実績解除: ${a.name}（欠片+${a.reward || 0}）`, 'quest'); setTimeout(() => showCenterMsg(`実績解除: ${a.name}`, '#ffd75e', 1600), i * 300); });
  saveGame();
}
let chatterTimer = 0;
let periodicAchCheckTimer = 30;
const AMBIENT_LINES = [
  '「今日はいい天気だ」', '「気をつけて行くんだぞ」', '「何か困ったことがあれば言ってくれ」',
  '「この辺りも随分変わったものだ」', '「結晶獣の噂は聞いているかい？」', '「無理はしないようにな」',
];
const AMBIENT_LINES_DONE = [
  '「お前のおかげでこの聖域も救われたよ、ありがとう」', '「あの時の働き、忘れないさ」',
  '「また何かあれば頼らせてもらうよ」', '「英雄殿、今日も息災で何より」',
];
const AMBIENT_LINES_PENDING = [
  '「頼んだ討伐、まだかい？」', '「あの結晶獣、油断せず倒してくれよ」', '「待っているぞ」',
];
const AMBIENT_LINES_NIGHT = [
  '「こんな夜更けに出歩くとは、感心しないな」', '「夜の聖域は昼間と違う顔を見せる」', '「星がきれいな夜だ」',
];
const AMBIENT_LINES_RAIN = [
  '「今日は雨か、足元に気をつけて」', '「雨宿りしていくかい？」', '「雨の音も悪くないものだ」',
];
const AMBIENT_LINES_SNOW = [
  '「この雪原は美しいが、油断すると凍えるぞ」', '「暖かい格好をしてきたか？」', '「雪解けはまだ先だな」',
];
const AMBIENT_LINES_VOLCANIC = [
  '「この熱気には慣れたものだが、お前は大丈夫か？」', '「溶岩には近づきすぎるなよ」', '「灰が舞う日は特に注意しろ」',
];
const AMBIENT_LINES_DESERT = [
  '「水は十分に持ってきたか？」', '「この砂漠は昼と夜で顔つきが変わる」', '「砂嵐には気をつけろよ」',
];
const AMBIENT_LINES_SWAMP = [
  '「この沼地はぬかるみが深い、足元によく気をつけろ」', '「蛙の声が心地よい夜だ」', '「霧が出る日は迷いやすいから注意しろ」',
];
const AMBIENT_LINES_WASTELAND = [
  '「この荒野で生き延びるのは容易じゃない」', '「灰色の空はもう見慣れたものさ」', '「カラスの鳴き声が聞こえるな」',
];
const AMBIENT_LINES_CYBER = [
  '「このネオンの光、目がチカチカするだろう」', '「ドローンの巡回には気をつけろ」', '「電子音が絶えない街だな」',
];
const AMBIENT_LINES_CRYSTAL = [
  '「結晶の共鳴音が聞こえるか？」', '「この場所は神秘的な力に満ちている」', '「精霊たちの気配を感じるよ」',
];
const npcChatterCooldown = new WeakMap();
const COMPANION_CHATTER_LINES = [
  'ここは静かな場所ですね', '何か気になるものはありますか？', '無理はしないでくださいね',
  '結晶の欠片、集まってきましたか？', '少し休んでもいいんですよ', 'この先に何かある予感がします',
];
const COMPANION_CHATTER_NIGHT = [
  '夜は星の光がよく見えますね', '静かな夜ですね……少し眠くなってきました', '夜行性の生き物には気をつけて',
];
const COMPANION_CHATTER_RAIN = [
  '雨、冷たくないですか？', '雨上がりには虹が見えるかもしれません', '足元が滑りやすいので気をつけて',
];
let companionChatterTimer = 40 + Math.random() * 40;
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
const exploreStaminaMax = () => state.exploreStaminaMax || 100;
const STAMINA_DRAIN = 22;
const STAMINA_REGEN = 14;

const EXPLORE_FOG = { near: 260, far: 3200 };
const BATTLE_FOG = { near: 34, far: 80 };

const keys = { forward: false, back: false, left: false, right: false, sprint: false };
let joyVec = { x: 0, y: 0 }; // タッチ用ベクトル(-1..1)
let sprintLock = false;
let dashCooldown = 0;
let dashTimer = 0;
let dashTrailTimer = 0;
let fovKickCur = 0;
let emoteIdx = 0;
// 操作ヒントを自動的に消すためのタイマー
let exploreHintTimer = null;
let lastHubReturnAt = -Infinity;
function playEmote(idx) {
  const emote = EMOTES[idx];
  if (!emote) return;
  sfx.achievement();
  emote.colors.forEach((c, i) => {
    spawnParticles(player.position.clone().add(new THREE.Vector3(0, 1.6 + i * 0.15, 0)), c, 10);
  });
  showToast(emote.label, 'info');
  if (!state.emotesUsedSet) state.emotesUsedSet = [];
  if (!state.emotesUsedSet.includes(idx)) {
    state.emotesUsedSet.push(idx);
    checkAchievements().forEach(a => { sfx.achievement(); showCenterMsg(`実績解除: ${a.name}`, '#ffd700', 2000); });
    saveGame();
  }
}
let staminaWasEmpty = false;
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
  if (btn) {
    btn.classList.toggle('active', sprintLock);
    btn.setAttribute('aria-pressed', String(sprintLock));
  }
}

function doDash() {
  if (dashCooldown > 0 || exploreStamina < DASH_STAMINA_COST) return;
  dashTimer = DASH_DURATION;
  dashCooldown = DASH_COOLDOWN;
  exploreStamina -= DASH_STAMINA_COST;
  sfx.dodgeSuccess();
  spawnParticles(player.position.clone().add(new THREE.Vector3(0, 1, 0)), 0x9fe0ff, 12);
}

function returnToHub() {
  const now = performance.now();
  if (now - lastHubReturnAt < 5000) { showToast('拠点帰還はクールダウン中', 'info'); return; }
  lastHubReturnAt = now;
  localPos.set(HUB_SPAWN.x, 0, HUB_SPAWN.z);
  spawnParticles(player.position.clone().add(new THREE.Vector3(0, 1, 0)), 0x9fe0ff, 16);
  sfx.uiClick();
  showToast('拠点へ帰還した', 'quest');
  const teleportFlash = document.getElementById('lightning-flash');
  if (teleportFlash && !state.reduceFlashing) {
    teleportFlash.style.background = '#9fe0ff';
    teleportFlash.classList.add('flash');
    setTimeout(() => {
      teleportFlash.classList.remove('flash');
      teleportFlash.style.background = '';
    }, 200);
  }
}

let activeLoadoutKey = 'a';
export function setActiveLoadoutKey(key) {
  if (key === 'a' || key === 'b') activeLoadoutKey = key;
}
function quickSwapLoadout() {
  const nextKey = activeLoadoutKey === 'a' ? 'b' : 'a';
  const loadout = state.savedLoadouts && state.savedLoadouts[nextKey];
  if (!loadout) { showToast(`セット${nextKey.toUpperCase()}はまだ記憶されていません（装備タブで記憶できます）`, 'info'); return; }
  const slotNames = ['weapon', 'armor', 'accessory'];
  let missing = 0;
  slotNames.forEach(slot => {
    const id = loadout[slot];
    if (id && state.inventory.includes(id)) equipItem(id);
    else if (!id) unequipSlot(slot);
    else missing++;
  });
  activeLoadoutKey = nextKey;
  sfx.uiClick();
  showToast(missing > 0
    ? `装備セット${nextKey.toUpperCase()}に切り替えた（${missing}枠は所持していないため据え置き）`
    : `装備セット${nextKey.toUpperCase()}に切り替えた`, 'quest');
  saveGame();
}

function doJump() {
  if (jumpsUsed >= MAX_JUMPS) return;
  isJumping = true;
  jumpVelY = JUMP_SPEED * (jumpsUsed === 0 ? 1 : 0.85);
  jumpsUsed++;
  if (state.footstepSounds !== false) sfx.footstep();
  if (jumpsUsed > 1) {
    spawnParticles(player.position.clone().add(new THREE.Vector3(0, 0.6, 0)), 0xbfe0ff, 8);
    spinProgress = 0;
    spinning = true;
  }
}

const DIR_NAMES = ['北', '北東', '東', '南東', '南', '南西', '西', '北西'];
// ミニマップ・大陸図はいずれも画面 y = z（+z が下）で描画し、北を上に表示する。
// つまり北は -z 方向。atan2 に -dz を渡して地図の向きと一致させる。
function directionName(dx, dz) {
  const angDeg = ((Math.atan2(dx, -dz) * 180 / Math.PI) + 360) % 360;
  return DIR_NAMES[Math.round(angDeg / 45) % 8];
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
    const dir = directionName(nearest.localPos.x - localPos.x, nearest.localPos.z - localPos.z);
    showToast(`最も近い${label}: ${dir}方向へ約${Math.round(nearestDist)}m`, 'quest');
  }
  sfx.uiClick();
}

// クエストトラッカーから呼ぶ、指定クエストの現在の目的地を指す処理。
// 討伐クエストは進行状況によって行き先が依頼人／討伐目標と入れ替わる。
export function pingQuestObjective(questId, type) {
  let target = null;
  let label = '目標';
  if (type === 'battle') {
    const fState = fieldQuestState(questId);
    if (fState === 'accepted') {
      target = fieldTargets.find(t => t.questId === questId);
      label = '討伐目標';
    } else {
      target = questGivers.find(g => g.questId === questId);
      label = fState === 'ready_turnin' ? '報告先の依頼人' : '依頼人';
    }
  } else if (type === 'lore') {
    target = loreMarkers.find(m => m.questId === questId);
    label = '伝承の石碑';
  } else {
    target = explorePickups.find(p => p.questId === questId);
    label = '採取物';
  }
  if (!target) { showToast('目的地が見つかりませんでした', 'info'); return; }
  pingDirection([target], label, '');
}

window.addEventListener('gamepadconnected', (e) => {
  showToast(`ゲームパッドを接続しました: ${e.gamepad.id}`, 'info');
});
window.addEventListener('gamepaddisconnected', () => {
  showToast('ゲームパッドが切断されました', 'info');
});

window.addEventListener('keydown', (e) => {
  if (!exploreActive) return;
  if (mapOpen && e.code !== 'KeyM' && e.code !== 'Escape') return;
  if (e.code === 'KeyW' || e.code === 'ArrowUp') keys.forward = true;
  if (e.code === 'KeyS' || e.code === 'ArrowDown') keys.back = true;
  if (e.code === 'KeyA' || e.code === 'ArrowLeft') keys.left = true;
  if (e.code === 'KeyD' || e.code === 'ArrowRight') keys.right = true;
  if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') keys.sprint = true;
  if (e.code === 'KeyM' && onToggleMap) onToggleMap();
  if (e.code === 'KeyR' && !e.repeat) toggleSprintLock();
  if (e.code === 'KeyC' && !e.repeat) resetCameraAngle();
  if (e.code === 'KeyV' && !e.repeat) {
    cyclePhotoFilter();
  }
  if (e.code === 'KeyN' && !e.repeat) returnToHub();
  if (e.code === 'KeyL' && !e.repeat) quickSwapLoadout();
  if (e.code === 'KeyT' && !e.repeat) {
    const unfound = hiddenTreasures.filter(tr => !state.foundTreasures.includes(tr.id));
    pingDirection(unfound, '未発見の秘宝', 'すべての秘宝を発見済みです');
  }
  if (e.code === 'KeyG' && !e.repeat) {
    const active = fieldTargets.filter(isFieldTargetHuntable);
    pingDirection(active, '討伐目標', '今戦える討伐目標はありません');
  }
  if (e.code === 'KeyQ' && !e.repeat) {
    const undone = questGivers.filter(g => !isQuestDone(CHAPTERS[g.chapterIndex].key, g.questId));
    pingDirection(undone, 'クエスト依頼人', 'すべての依頼人のクエストを達成済みです');
  }
  if (e.code === 'KeyX' && !e.repeat) {
    pingDirection(undiscoveredBiomeSpots(state.discoveredBiomes), '未発見のバイオーム', 'すべてのバイオームを発見済みです');
  }
  if (e.code === 'KeyZ' && !e.repeat) {
    const unfinished = zoneMarkers.filter(z => z.chapterIndex >= state.chapterIndex);
    pingDirection(unfinished, '聖域', 'すべての聖域を制覇済みです');
  }
  if (e.code === 'KeyE' && !e.repeat) doDash();
  if (e.code === 'KeyF' && !e.repeat) cycleEmote();
  if (e.code === 'KeyJ' && !e.repeat) restAtCampfire();
  // 数字キーは EMOTES の数に追従させる（種類を増やしても割り当てが漏れない）
  if (/^Digit[1-9]$/.test(e.code) && !e.repeat && parseInt(e.code.slice(-1), 10) <= EMOTES.length) {
    playEmote(parseInt(e.code.slice(-1), 10) - 1);
  }
  if (e.code === 'KeyO' && !e.repeat) togglePhotoGrid();
  if (e.code === 'KeyP' && !e.repeat) takeScreenshot();
  if (e.code === 'Space' && !e.repeat) doJump();
});

// カメラリセットとエモート送りも複数の入力経路から呼ばれるため共通化する
function resetCameraAngle() {
  camOrbitYaw = 0;
  camOrbitPitch = 0.42;
  sfx.uiClick();
}

function cycleEmote() {
  playEmote(emoteIdx % EMOTES.length);
  emoteIdx++;
}

// フィルター切替はキーボードとゲームパッドの両方から呼ばれるため一箇所にまとめる
function cyclePhotoFilter() {
  photoFilterMode = (photoFilterMode + 1) % PHOTO_FILTERS.length;
  state.photoFilterMode = photoFilterMode;
  setPhotoFilter(photoFilterMode);
  showToast(`フィルター: ${PHOTO_FILTERS[photoFilterMode]}`, 'info');
  sfx.uiClick();
  saveGame();
}

function togglePhotoGrid() {
  const gridEl = document.getElementById('photo-grid-overlay');
  if (!gridEl) return;
  const showing = gridEl.style.display === 'block';
  gridEl.style.display = showing ? 'none' : 'block';
  const gridBtn = document.getElementById('photo-grid-btn');
  if (gridBtn) gridBtn.setAttribute('aria-pressed', String(!showing));
  showToast(showing ? '構図グリッドを非表示' : '構図グリッドを表示（三分割法）', 'info');
}

function takeScreenshot() {
  const hud = document.getElementById('explore-hud');
  const hadHidden = hud && hud.classList.contains('hidden');
  if (hud && !hadHidden) hud.classList.add('photo-capture-hide');
  const gridEl = document.getElementById('photo-grid-overlay');
  const gridWasShown = gridEl && gridEl.style.display === 'block';
  if (gridWasShown) gridEl.style.display = 'none';
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      try {
        let dataUrl;
        if (state.screenshotWatermark !== false) {
          const src = renderer.domElement;
          const tmp = document.createElement('canvas');
          tmp.width = src.width; tmp.height = src.height;
          const tctx = tmp.getContext('2d');
          tctx.drawImage(src, 0, 0);
          const bName = biomeNameAt(localPos.x, localPos.z) || '';
          const dayNum = Math.floor(currentAbsTime / ((Math.PI * 2) / 0.015)) + 1;
          const label = `${new Date().toLocaleDateString('ja-JP')}｜Day ${dayNum}｜${bName}`;
          tctx.font = `${Math.round(tmp.height * 0.018)}px sans-serif`;
          tctx.textAlign = 'right';
          tctx.textBaseline = 'bottom';
          const pad = tmp.height * 0.02;
          tctx.fillStyle = 'rgba(0,0,0,0.5)';
          const textW = tctx.measureText(label).width;
          tctx.fillRect(tmp.width - textW - pad * 2, tmp.height - pad * 2.4, textW + pad * 1.5, pad * 1.8);
          tctx.fillStyle = '#fff';
          tctx.fillText(label, tmp.width - pad, tmp.height - pad * 1.4);
          dataUrl = tmp.toDataURL('image/png');
        } else {
          dataUrl = renderer.domElement.toDataURL('image/png');
        }
        const link = document.createElement('a');
        link.href = dataUrl;
        link.download = `bosusen-${Date.now()}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        sfx.uiClick();
        addScreenshotToGallery(dataUrl);
        const previewEl = document.getElementById('screenshot-preview');
        if (previewEl) {
          previewEl.src = dataUrl;
          previewEl.classList.add('show');
          clearTimeout(previewEl._hideTimer);
          previewEl._hideTimer = setTimeout(() => previewEl.classList.remove('show'), 2500);
          if (!previewEl._clickBound) {
            previewEl._clickBound = true;
            previewEl.title = 'クリックで別タブ表示、右クリックでコピー';
            previewEl.addEventListener('click', () => {
              const w = window.open();
              if (w) w.document.write(`<img src="${previewEl.src}" style="max-width:100%;">`);
            });
            previewEl.addEventListener('contextmenu', (e) => {
              e.preventDefault();
              copyImageToClipboard(previewEl.src);
            });
          }
        }
        const timeLabel = getTimeOfDayLabel(currentAbsTime);
        if (timeLabel === '明け方' || timeLabel === '夕暮れ') {
          addShards(10);
          showToast(`ゴールデンアワーの一枚！ 結晶の欠片+10`, 'quest');
          state.gotGoldenHourPhoto = true;
        } else {
          showToast('スクリーンショットを保存しました', 'info');
        }
        state.screenshotsTaken = (state.screenshotsTaken || 0) + 1;
        checkAchievements().forEach(a => { sfx.achievement(); showCenterMsg(`実績解除: ${a.name}`, '#ffd700', 2000); });
        saveGame();
        const flashEl = document.getElementById('lightning-flash');
        if (flashEl && !state.reduceFlashing) {
          flashEl.classList.add('flash');
          setTimeout(() => flashEl.classList.remove('flash'), 90);
        }
      } catch (err) {
        console.error('スクリーンショットの保存に失敗', err);
      } finally {
        if (hud && !hadHidden) hud.classList.remove('photo-capture-hide');
        if (gridWasShown) gridEl.style.display = 'block';
      }
    });
  });
}
window.addEventListener('keyup', (e) => {
  if (e.code === 'KeyW' || e.code === 'ArrowUp') keys.forward = false;
  if (e.code === 'KeyS' || e.code === 'ArrowDown') keys.back = false;
  if (e.code === 'KeyA' || e.code === 'ArrowLeft') keys.left = false;
  if (e.code === 'KeyD' || e.code === 'ArrowRight') keys.right = false;
  if ((e.code === 'ShiftLeft' || e.code === 'ShiftRight') && !sprintLock) keys.sprint = false;
});
window.addEventListener('blur', () => {
  keys.forward = false;
  keys.back = false;
  keys.left = false;
  keys.right = false;
  if (!sprintLock) keys.sprint = false;
  joyVec = { x: 0, y: 0 };
  orbitDragging = false;
});

/* ---------- 仮想スティック(モバイル/マウスドラッグ両対応) ---------- */
let joyBase = null, joyKnob = null, joyPointerId = null, joyOrigin = { x: 0, y: 0 };
export function initJoystick() {
  joyBase = document.getElementById('joy-base');
  joyKnob = document.getElementById('joy-knob');
  const sprintBtn = document.getElementById('sprint-lock-btn');
  if (sprintBtn) sprintBtn.addEventListener('click', () => { if (exploreActive) toggleSprintLock(); });
  const jumpBtn = document.getElementById('jump-btn');
  if (jumpBtn) jumpBtn.addEventListener('click', () => { if (exploreActive) doJump(); });
  const dashBtn = document.getElementById('dash-btn');
  if (dashBtn) dashBtn.addEventListener('click', () => { if (exploreActive) doDash(); });
  const emoteBtn = document.getElementById('emote-btn');
  if (emoteBtn) emoteBtn.addEventListener('click', () => { if (exploreActive) cycleEmote(); });
  const screenshotBtn = document.getElementById('screenshot-btn');
  if (screenshotBtn) screenshotBtn.addEventListener('click', () => { if (exploreActive) takeScreenshot(); });
  const hubReturnBtn = document.getElementById('hub-return-btn');
  if (hubReturnBtn) hubReturnBtn.addEventListener('click', () => { if (exploreActive) returnToHub(); });
  const loadoutSwapBtn = document.getElementById('loadout-swap-btn');
  if (loadoutSwapBtn) loadoutSwapBtn.addEventListener('click', () => { if (exploreActive) quickSwapLoadout(); });
  const photoGridBtn = document.getElementById('photo-grid-btn');
  if (photoGridBtn) photoGridBtn.addEventListener('click', () => { if (exploreActive) togglePhotoGrid(); });
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
let onReplayZone = null;
export function setOnReplayZone(fn) { onReplayZone = fn; }
let onOpenShop = null;
export function setOnOpenShop(fn) { onOpenShop = fn; }
let onToggleMap = null;
export function setOnToggleMap(fn) { onToggleMap = fn; }
let onToggleMute = null;
export function setOnToggleMute(fn) { onToggleMute = fn; }

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
  exploreStamina = exploreStaminaMax();
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
    // 探索へ戻るたびに見た目を現在の状態へ合わせる
    // （再討伐が可能になっている的を暗いままにしない）
    const huntable = isFieldTargetHuntable(t);
    if (t.baseEmissive === undefined) {
      t.baseEmissive = t.material.emissiveIntensity;
      t.baseLight = t.light.intensity;
    }
    t.material.emissiveIntensity = huntable ? t.baseEmissive : 0.1;
    t.light.intensity = huntable ? t.baseLight : 0.2;
    if (t.beam) t.beam.visible = huntable;
  });
  questGivers.forEach(g => {
    if (g.beam) g.beam.visible = !isQuestDone(CHAPTERS[g.chapterIndex].key, g.questId);
  });
  loreMarkers.forEach(m => {
    if (m.beam) m.beam.visible = !isQuestDone(CHAPTERS[m.chapterIndex].key, m.questId);
  });
  camInit = false;
  document.getElementById('explore-hud').style.display = 'flex';
  // 常時表示だと画面上部を占有し続けるため、しばらくしたら消す（詳細は H キーのヘルプへ）
  const hintEl = document.getElementById('explore-hint');
  if (hintEl) {
    hintEl.classList.remove('faded');
    clearTimeout(exploreHintTimer);
    exploreHintTimer = setTimeout(() => hintEl.classList.add('faded'), 12000);
  }
  document.getElementById('ui').classList.add('exploring');
  startAmbientWind();
  photoFilterMode = state.photoFilterMode || 0;
  setPhotoFilter(photoFilterMode);
  if (!state.seenExploreTutorial) {
    state.seenExploreTutorial = true;
    const tips = [
      'WASD / 矢印キーで移動しよう',
      'Spaceでジャンプ、空中でもう一度押すと2段ジャンプ',
      'Shiftでスプリント、Eでダッシュ（スタミナを消費）',
      '困ったらHキーでいつでも操作方法を確認できるよ',
    ];
    tips.forEach((tip, i) => {
      setTimeout(() => showToast(tip, 'info'), 1500 + i * 2600);
    });
    saveGame();
  }
}

export function exitExploreMode() {
  exploreActive = false;
  cinematicIdleTime = 0;
  const hudEl = document.getElementById('explore-hud');
  if (hudEl) hudEl.classList.remove('cinematic-fade');
  stopAmbientWind();
  setCameraMode('battle');
  fovKickCur = 0;
  setFovKick(0);
  camera.far = 200;
  camera.updateProjectionMatrix();
  scene.fog.near = BATTLE_FOG.near;
  scene.fog.far = BATTLE_FOG.far;
  keys.forward = keys.back = keys.left = keys.right = keys.sprint = false;
  sprintLock = false;
  const ind = document.getElementById('sprint-lock-indicator');
  if (ind) ind.style.display = 'none';
  const btn = document.getElementById('sprint-lock-btn');
  if (btn) {
    btn.classList.remove('active');
    btn.setAttribute('aria-pressed', 'false');
  }
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
    const giverReward = Math.round(giver.quest.reward.shards * ngPlusShardMult());
    addShards(giverReward);
    if (giver.quest.reward.itemId) addItem(giver.quest.reward.itemId);
    sfx.questDone();
    showToast(`クエスト達成: ${giver.quest.title}（結晶の欠片 +${giverReward}）`, 'quest');
    checkAchievements(hiddenTreasures.length).forEach((a, i) => { sfx.achievement(); showToast(`実績解除: ${a.name}（欠片+${a.reward || 0}）`, 'quest'); spawnParticles(player.position.clone().add(new THREE.Vector3(0, 1.6, 0)), 0xffd700, 18); setTimeout(() => showCenterMsg(`実績解除: ${a.name}`, '#ffd75e', 1600), i * 300); });
    checkChapterQuestCelebration(giver.chapterIndex);
    if (giver.beam) giver.beam.visible = false;
    // 納品を終えた討伐目標は再挑戦できるので、輝きを戻して狙えることを示す
    const doneTarget = fieldTargets.find(t => t.questId === giver.questId);
    if (doneTarget) { doneTarget.huntReadyAt = 0; scheduleHuntRespawn(doneTarget); }
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
  // 依頼を果たした後も再び挑める（クエストは再達成されず、討伐数と報酬のみ）。
  // フィールドの討伐目標は各章1体しかなく、これが無いと討伐系の実績が
  // 周回を何度も重ねないと到達できない目標になってしまう。
  if (isQuestDone(chapterKey, target.questId)) {
    const readyAt = target.huntReadyAt || 0;
    if (Date.now() < readyAt) {
      const left = Math.ceil((readyAt - Date.now()) / 1000);
      showToast(`この結晶獣はまだ力を取り戻していない（あと${left}秒）`, 'info');
      return;
    }
    startSkirmish(target, true);
    return;
  }
  const fState = fieldQuestState(target.questId);
  if (fState === 'accepted') {
    startSkirmish(target);
  } else if (fState === 'ready_turnin') {
    showToast('依頼人の元へ戻って報告しよう', 'info');
  } else {
    showToast('まずは依頼人から討伐を受注しよう', 'info');
  }
}

function checkChapterQuestCelebration(chapterIndex) {
  const chapter = CHAPTERS[chapterIndex];
  const chapterKey = chapter.key;
  if (chapter.quests.every(q => isQuestDone(chapterKey, q.id))) {
    sfx.achievement();
    showCenterMsg(`${chapter.sanctuaryLabel} 全クエスト達成！`, '#ffd75e', 2000);
    [0xffd700, 0x9fe0ff, 0xff9fd0, 0x9fff7a].forEach((c, i) => {
      setTimeout(() => spawnParticles(player.position.clone().add(new THREE.Vector3(0, 1.6 + i * 0.15, 0)), c, 10), i * 120);
    });
  }
}

function tryCollectPickup(pickup) {
  const chapterKey = CHAPTERS[pickup.chapterIndex].key;
  if (isQuestDone(chapterKey, pickup.questId)) return;
  completeQuest(chapterKey, pickup.questId);
  addShards(Math.round(pickup.quest.reward.shards * ngPlusShardMult()));
  if (pickup.quest.reward.itemId) addItem(pickup.quest.reward.itemId);
  sfx.shardGet();
  showToast(`クエスト達成: ${pickup.quest.title}｜${pickup.quest.result}`, 'quest');
  checkAchievements(hiddenTreasures.length).forEach((a, i) => { sfx.achievement(); showToast(`実績解除: ${a.name}（欠片+${a.reward || 0}）`, 'quest'); spawnParticles(player.position.clone().add(new THREE.Vector3(0, 1.6, 0)), 0xffd700, 18); setTimeout(() => showCenterMsg(`実績解除: ${a.name}`, '#ffd75e', 1600), i * 300); });
  checkChapterQuestCelebration(pickup.chapterIndex);
  pickup.mesh.visible = false;
  if (pickup.beam) pickup.beam.visible = false;
  renderQuestTracker();
  saveGame();
}

function tryCollectTreasure(t) {
  if (state.foundTreasures.includes(t.id)) return;
  state.foundTreasures.push(t.id);
  const treasureReward = Math.round(t.shardReward * ngPlusShardMult());
  addShards(treasureReward);
  sfx.shardGet();
  showToast(`結晶の秘宝を発見！ 結晶の欠片 +${treasureReward}`, 'quest');
  t.mesh.visible = false;
  if (t.beam) t.beam.visible = false;
  checkAchievements(hiddenTreasures.length).forEach((a, i) => { sfx.achievement(); showToast(`実績解除: ${a.name}（欠片+${a.reward || 0}）`, 'quest'); spawnParticles(player.position.clone().add(new THREE.Vector3(0, 1.6, 0)), 0xffd700, 18); setTimeout(() => showCenterMsg(`実績解除: ${a.name}`, '#ffd75e', 1600), i * 300); });
  saveGame();
}

function tryReadLore(monu) {
  const chapterKey = CHAPTERS[monu.chapterIndex].key;
  if (isQuestDone(chapterKey, monu.questId)) return;
  completeQuest(chapterKey, monu.questId);
  addShards(Math.round(monu.quest.reward.shards * ngPlusShardMult()));
  sfx.questDone();
  showToast(`クエスト達成: ${monu.quest.title}｜${monu.quest.result}`, 'quest');
  if (!state.collectedLore) state.collectedLore = [];
  state.collectedLore.push({ title: monu.quest.title, text: monu.quest.result, foundAt: Date.now() });
  checkAchievements(hiddenTreasures.length).forEach((a, i) => { sfx.achievement(); showToast(`実績解除: ${a.name}（欠片+${a.reward || 0}）`, 'quest'); spawnParticles(player.position.clone().add(new THREE.Vector3(0, 1.6, 0)), 0xffd700, 18); setTimeout(() => showCenterMsg(`実績解除: ${a.name}`, '#ffd75e', 1600), i * 300); });
  checkChapterQuestCelebration(monu.chapterIndex);
  if (monu.beam) monu.beam.visible = false;
  renderQuestTracker();
  saveGame();
}

let currentAbsTime = 0;
let cinematicIdleTime = 0;
export function updateExplore(dt, absTime = 0, isRaining = false) {
  currentAbsTime = absTime;
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
    if (gp.buttons[4] && gp.buttons[4].pressed && !gpLoadoutHeld) { gpLoadoutHeld = true; quickSwapLoadout(); }
    if (!(gp.buttons[4] && gp.buttons[4].pressed)) gpLoadoutHeld = false;
    if (gp.buttons[5] && gp.buttons[5].pressed && !gpMuteHeld) { gpMuteHeld = true; if (onToggleMute) onToggleMute(); }
    if (!(gp.buttons[5] && gp.buttons[5].pressed)) gpMuteHeld = false;
    if (gp.buttons[8] && gp.buttons[8].pressed && !gpPhotoGridHeld) { gpPhotoGridHeld = true; togglePhotoGrid(); }
    if (!(gp.buttons[8] && gp.buttons[8].pressed)) gpPhotoGridHeld = false;
    keys.sprint = keys.sprint || (gp.buttons[10] && gp.buttons[10].pressed);
    const rx = gp.axes[2] || 0, ry = gp.axes[3] || 0;
    const gpSens = state.cameraSensitivity || 1;
    if (Math.abs(rx) > 0.2) camOrbitYaw -= rx * dt * 2.5 * gpSens;
    if (Math.abs(ry) > 0.2) camOrbitPitch = Math.max(0.05, Math.min(1.2, camOrbitPitch + ry * dt * 2 * gpSens * (state.invertCameraY ? -1 : 1)));
    if (gp.buttons[9] && gp.buttons[9].pressed && !gpMapHeld) { gpMapHeld = true; if (onToggleMap) onToggleMap(); }
    if (!(gp.buttons[9] && gp.buttons[9].pressed)) gpMapHeld = false;
    if (gp.buttons[3] && gp.buttons[3].pressed && !gpCamResetHeld) { gpCamResetHeld = true; resetCameraAngle(); }
    if (!(gp.buttons[3] && gp.buttons[3].pressed)) gpCamResetHeld = false;
    if (gp.buttons[2] && gp.buttons[2].pressed && !gpEmoteHeld) { gpEmoteHeld = true; cycleEmote(); }
    if (!(gp.buttons[2] && gp.buttons[2].pressed)) gpEmoteHeld = false;
    if (gp.buttons[12] && gp.buttons[12].pressed && !gpFilterHeld) {
      gpFilterHeld = true;
      cyclePhotoFilter();
    }
    if (!(gp.buttons[12] && gp.buttons[12].pressed)) gpFilterHeld = false;
    if (gp.buttons[13] && gp.buttons[13].pressed && !gpHubReturnHeld) { gpHubReturnHeld = true; returnToHub(); }
    if (!(gp.buttons[13] && gp.buttons[13].pressed)) gpHubReturnHeld = false;
  }

  dashCooldown = Math.max(0, dashCooldown - dt);
  const dashing = dashTimer > 0;
  if (dashing) {
    dashTimer -= dt;
    dashTrailTimer -= dt;
    if (dashTrailTimer <= 0) {
      dashTrailTimer = 0.04;
      const trailColor = (state.achievements || []).includes('completionist') ? 0xffd700 : 0x9fe0ff;
      spawnParticles(player.position.clone().add(new THREE.Vector3(0, 0.9, 0)), trailColor, 2);
    }
  }

  let len = Math.hypot(mx, mz);
  let moving = len > 0.08;
  if (dashing && !moving) {
    mx = Math.sin(facing); mz = Math.cos(facing);
    len = 1;
    moving = true;
  }
  if (state.cinematicAutoHide) {
    if (moving || dashing) {
      cinematicIdleTime = 0;
      const hudEl = document.getElementById('explore-hud');
      if (hudEl) hudEl.classList.remove('cinematic-fade');
    } else {
      cinematicIdleTime += dt;
      if (cinematicIdleTime > 8) {
        const hudEl = document.getElementById('explore-hud');
        if (hudEl) hudEl.classList.add('cinematic-fade');
      }
    }
  }
  const sprinting = keys.sprint && exploreStamina > 0.5 && moving && !dashing;
  const speed = dashing ? DASH_SPEED : (sprinting ? SPRINT_SPEED : WALK_SPEED);
  const targetFovKick = state.reduceFlashing ? 0 : (dashing ? 10 : (sprinting ? 5 : 0));
  fovKickCur += (targetFovKick - fovKickCur) * Math.min(1, dt * 6);
  setFovKick(fovKickCur);
  if (sprinting) {
    exploreStamina = Math.max(0, exploreStamina - STAMINA_DRAIN * dt);
  } else {
    exploreStamina = Math.min(exploreStaminaMax(), exploreStamina + STAMINA_REGEN * dt);
  }
  const staminaEl = document.getElementById('explore-stamina-fill');
  if (staminaEl) {
    const pct = (exploreStamina / exploreStaminaMax()) * 100;
    staminaEl.style.width = pct + '%';
    staminaEl.classList.toggle('low', pct < 30);
  }
  if (exploreStamina <= 0 && !staminaWasEmpty) {
    staminaWasEmpty = true;
    sfx.dodgeFail();
    showToast('スタミナ切れ！', 'info');
  } else if (exploreStamina > 0) {
    staminaWasEmpty = false;
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
        if (state.footstepSounds !== false) sfx.footstepWater();
        spawnParticles(player.position.clone().add(new THREE.Vector3(0, 0.05, 0)), 0x9fc4e0, 8);
      } else {
        const cat = biomeCategoryAt(localPos.x, localPos.z);
        if (state.footstepSounds !== false) {
          if (cat === 'desert') sfx.footstepSand();
          else if (cat === 'snow') sfx.footstepSnow();
          else if (cat === 'cyber') sfx.footstepMetal();
          else if (cat === 'swamp') sfx.footstepSwamp();
          else if (cat === 'crystal') sfx.footstepCrystal();
          else if (cat === 'volcanic') sfx.footstepVolcanic();
          else if (cat === 'wasteland') sfx.footstepAsh();
          else sfx.footstep();
        }
        spawnParticles(player.position.clone().add(new THREE.Vector3(0, 0.05, 0)), DUST_COLOR_BY_CATEGORY[cat] || 0xcabf9a, 4);
        spawnFootprint(player.position, facing, cat);
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
      const landCat = biomeCategoryAt(localPos.x, localPos.z);
      spawnParticles(player.position.clone().set(player.position.x, 0.05, player.position.z), DUST_COLOR_BY_CATEGORY[landCat] || 0xcabf9a, 10);
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

  periodicAchCheckTimer -= dt;
  if (periodicAchCheckTimer <= 0) {
    periodicAchCheckTimer = 30;
    checkAchievements(hiddenTreasures.length).forEach((a, i) => { sfx.achievement(); showToast(`実績解除: ${a.name}（欠片+${a.reward || 0}）`, 'quest'); setTimeout(() => showCenterMsg(`実績解除: ${a.name}`, '#ffd75e', 1600), i * 300); });
    saveGame();
  }

  if (!state.reduceNpcChatter) {
    companionChatterTimer -= dt;
    if (companionChatterTimer <= 0) {
      companionChatterTimer = 60 + Math.random() * 60;
      const pool = isRaining ? COMPANION_CHATTER_RAIN : (isNightTime(absTime) ? COMPANION_CHATTER_NIGHT : COMPANION_CHATTER_LINES);
      const line = pool[Math.floor(Math.random() * pool.length)];
      showToast(`${state.companionName || 'イリス'}：「${line}」`, 'info');
    }
  }

  chatterTimer -= dt;
  if (chatterTimer <= 0) {
    chatterTimer = 1.2;
    for (const g of questGivers) {
      const d = Math.hypot(localPos.x - g.localPos.x, localPos.z - g.localPos.z);
      if (d < 8) {
        const lastSaid = npcChatterCooldown.get(g) || 0;
        const chatterCooldownMs = state.reduceNpcChatter ? 60000 : 25000;
        const chatterChance = state.reduceNpcChatter ? 0.12 : 0.35;
        if (performance.now() - lastSaid > chatterCooldownMs && Math.random() < chatterChance) {
          npcChatterCooldown.set(g, performance.now());
          const done = isQuestDone(CHAPTERS[g.chapterIndex].key, g.questId);
          const pending = !done && fieldQuestState(g.questId) === 'accepted';
          const gCat = biomeCategoryAt(g.localPos.x, g.localPos.z);
          const CAT_LINES = { snow: AMBIENT_LINES_SNOW, volcanic: AMBIENT_LINES_VOLCANIC, desert: AMBIENT_LINES_DESERT, swamp: AMBIENT_LINES_SWAMP, wasteland: AMBIENT_LINES_WASTELAND, cyber: AMBIENT_LINES_CYBER, crystal: AMBIENT_LINES_CRYSTAL };
          const pool = done ? AMBIENT_LINES_DONE : (pending ? AMBIENT_LINES_PENDING : (CAT_LINES[gCat] || (isRaining ? AMBIENT_LINES_RAIN : (isNightTime(absTime) ? AMBIENT_LINES_NIGHT : AMBIENT_LINES))));
          const line = pool[Math.floor(Math.random() * pool.length)];
          showToast(`${g.name}：${line}`, 'info');
        }
        break;
      }
    }
  }

  updateComboHud();
  updateCampfires(absTime);
  {
    // 焚き火のそばでは休めることを知らせる（満タンなら出さない）
    const promptEl = document.getElementById('campfire-prompt');
    if (promptEl) {
      const near = nearestCampfire(localPos.x, localPos.z, 4) && exploreStamina < exploreStaminaMax() - 0.5;
      promptEl.style.display = near ? '' : 'none';
    }
  }

  fireflyCheckTimer -= dt;
  if (fireflyCheckTimer <= 0) {
    fireflyCheckTimer = 0.3;
    harvest(collectNearbyFireflies(localPos.x, localPos.z, 2.5), {
      label: '蛍を捕まえた', per: 2, counter: 'firefliesCaught',
      color: 0xbdffa0, height: 1.2, particles: 6, sound: () => sfx.shardGet(),
    });
    harvest(collectNearbySpirits(localPos.x, localPos.z, 2.8), {
      label: '精霊球を集めた', per: 5 * ngPlusShardMult(), counter: 'spiritsCaught',
      color: 0xd0a0ff, height: 1.4, particles: 8, sound: () => sfx.spiritChime(),
    });
    harvest(collectNearbyButterflies(localPos.x, localPos.z, 2.2), {
      label: '蝶を捕まえた', per: 1, counter: 'butterfliesCaught',
      color: 0xff9fd0, height: 1.2, particles: 5, sound: () => sfx.shardGet(),
    });
  }

  if (moving) {
    const name = biomeNameAt(localPos.x, localPos.z);
    if (name && name !== currentBiomeName) {
      currentBiomeName = name;
      const isNew = !state.discoveredBiomes.includes(name);
      if (isNew) {
        state.discoveredBiomes.push(name);
        if (!state.biomeDiscoveredAt) state.biomeDiscoveredAt = {};
        state.biomeDiscoveredAt[name] = Date.now();
        addShards(5);
        sfx.questDone();
        [0xffd700, 0x9fe0ff, 0xff9fd0, 0x9fff7a].forEach((c, i) => {
          spawnParticles(player.position.clone().add(new THREE.Vector3(0, 1.4 + i * 0.15, 0)), c, 8);
        });
        showToast(`新しいバイオーム発見: ${name}（${state.discoveredBiomes.length}/${BIOME_NAMES.length}） 結晶の欠片+5`, 'quest');
        checkAchievements(hiddenTreasures.length).forEach((a, i) => { sfx.achievement(); showToast(`実績解除: ${a.name}（欠片+${a.reward || 0}）`, 'quest'); setTimeout(() => showCenterMsg(`実績解除: ${a.name}`, '#ffd75e', 1600), i * 300); });
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
      if (onReplayZone) onReplayZone(nearZone.chapterIndex, nearZone.name);
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
    const newlyUnlocked = checkAchievements(hiddenTreasures.length);
    newlyUnlocked.forEach((a, i) => { sfx.achievement(); showToast(`実績解除: ${a.name}（欠片+${a.reward || 0}）`, 'quest'); spawnParticles(player.position.clone().add(new THREE.Vector3(0, 1.6, 0)), 0xffd700, 18); setTimeout(() => showCenterMsg(`実績解除: ${a.name}`, '#ffd75e', 1600), i * 300); });
    if (newlyUnlocked.length > 0) saveGame();
  }
}

function updateNearestObjective() {
  const el = document.getElementById('nearest-objective');
  if (!el) return;
  if (state.showObjectiveHint === false) { el.style.display = 'none'; return; }
  const candidates = [];
  fieldTargets.forEach(t => {
    if (isFieldTargetHuntable(t)) {
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
  const dir = directionName(nearest.pos.x - localPos.x, nearest.pos.z - localPos.z);
  el.textContent = `${nearest.name}（${dir} ${Math.round(nearestDist)}m）`;
}

export function getExploreLocalPos() { return localPos; }
export function setExploreLocalPos(v) { localPos.copy(v); }
export function getPlayerLocalPos() { return localPos; }
export function getPlayerFacing() { return facing; }
export function getZoneMarkersRef() { return zoneMarkers; }

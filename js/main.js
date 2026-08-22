import * as THREE from 'three';
import { camera, composer, camFittedPos, camLookAt, mountRenderer, torchFires, bossGlow, setQualityPreset, updateDayNightCycle, isNightTime } from './scene.js';
import { player, loadPlayerModel, playerMixer, playerReady } from './player.js';
import * as EnemyModule from './enemy.js';
import { spawnEnemy } from './enemy.js';
import { updateParticles, updateShakeAndApplyCamera, triggerShake, spawnParticles } from './effects.js';
import { resumeAudio, sfx, setMasterVolume } from './audio.js';
import { CHAPTERS, ITEMS } from './data.js';
import { state, saveGame, loadGame, hasSaveGame, chapterQuestsDone, ownsItem, addItem, spendShards, computeStats, isQuestDone, fieldQuestState, checkAchievements, checkDailyLogin, difficultyMult } from './state.js';
import { els, updateBars, log, setLoadingProgress, hideLoadingScreen, renderQuestBoard,
  renderQuestTracker, initMenu, refreshAllMenuTabs, showToast, syncSettingsUI, openMenu, closeMenu } from './ui.js';
import { setupChapterBattle, startBattlePhase, playerAction, setCombatCallbacks, cancelDodgeQTE } from './combat.js';
import { HUB_SPAWN, zoneLocalPos, zoneMarkers, questGivers, fieldTargets, shopLocalPos, SHOP_ITEMS, explorePickups, loreMarkers, updateFireflies, hiddenTreasures, updateBirds, updateLeaves, updateCritters, updateShootingStars, updateGrassWind, updateRain, updateSnow, updateEmbers } from './world.js';
import { enterExploreMode, exitExploreMode, updateExplore, initJoystick, setOnEnterZone,
  setOnOpenShop, setOnToggleMap, getPlayerLocalPos, exploreActive, setMapOpen } from './explore.js';
import { initSkirmishUI, resetSkirmish } from './skirmish.js';

mountRenderer();
initJoystick();
initSkirmishUI();

const BATTLE_SPAWN_POS = { x: -2.6, y: 0, z: -1.2 };
const BATTLE_SPAWN_ROT_Y = 0.35;

/* ============================================================
   物語の進行（タイトル → 探索 → ストーリー → クエスト → 戦闘 → 結果）
   ============================================================ */
let pendingPrependText = null;

function showStory(chapterIndex, prependText) {
  exitExploreMode();
  player.position.set(BATTLE_SPAWN_POS.x, BATTLE_SPAWN_POS.y, BATTLE_SPAWN_POS.z);
  player.rotation.y = BATTLE_SPAWN_ROT_Y;
  const chapter = CHAPTERS[chapterIndex];
  els.storyChapterTag.textContent = chapter.sanctuaryLabel;
  els.storyTitle.textContent = chapter.title;
  els.storyText.textContent = prependText ? (prependText + '\n\n―――\n\n' + chapter.storyBefore) : chapter.storyBefore;
  const doneCount = chapterQuestsDone(chapter.key);
  const clearCount = state.chapterClearCounts[chapter.key] || 0;
  const bossHpPreview = Math.round(chapter.hp * difficultyMult().hp * (1 + (state.newGamePlus || 0) * 0.25));
  els.questPreview.textContent = `この聖域のクエスト: ${doneCount}/${chapter.quests.length} 達成済み${clearCount > 0 ? `｜結晶獣 撃破回数: ${clearCount}` : ''}｜${chapter.enemyName}（HP ${bossHpPreview}）`;
  setupChapterBattle(chapterIndex);
  document.getElementById('start-screen').style.display = 'none';
  document.getElementById('quest-board-screen').style.display = 'none';
  document.getElementById('shop-screen').style.display = 'none';
  document.getElementById('map-screen').style.display = 'none';
  els.endScreen.style.display = 'none';
  els.storyScreen.style.display = 'flex';
  saveGame();
}

function goExplore(spawnChapterIndex) {
  document.getElementById('start-screen').style.display = 'none';
  document.getElementById('story-screen').style.display = 'none';
  document.getElementById('quest-board-screen').style.display = 'none';
  els.endScreen.style.display = 'none';
  if (spawnChapterIndex != null) {
    const zonePos = zoneLocalPos(spawnChapterIndex);
    enterExploreMode({ x: zonePos.x * 0.7, y: 0, z: zonePos.z * 0.7 });
  } else {
    enterExploreMode(HUB_SPAWN);
  }
}

setOnEnterZone((chapterIndex) => {
  showStory(chapterIndex, pendingPrependText);
  pendingPrependText = null;
});

/* ============================================================
   商店（結晶の欠片で武器・防具を購入）
   ============================================================ */
const shopScreen = document.getElementById('shop-screen');
const shopItemList = document.getElementById('shop-item-list');
const shopShardsEl = document.getElementById('shop-shards');

function renderShop() {
  shopItemList.innerHTML = '';
  const ownedCount = SHOP_ITEMS.filter(e => ownsItem(e.itemId)).length;
  const shopProgressFill = document.getElementById('shop-progress-fill');
  if (shopProgressFill) shopProgressFill.style.width = `${Math.round((ownedCount / SHOP_ITEMS.length) * 100)}%`;
  SHOP_ITEMS.forEach(entry => {
    const item = ITEMS[entry.itemId];
    const owned = ownsItem(entry.itemId);
    const locked = entry.requiresAchievement && !state.achievements.includes(entry.requiresAchievement);
    const canBuy = !owned && !locked && state.shards >= entry.cost;
    const statParts = [];
    if (item.atk) statParts.push(`攻撃+${item.atk}`);
    if (item.def) statParts.push(`防御+${item.def}`);
    if (item.hp) statParts.push(`HP+${item.hp}`);
    if (item.mp) statParts.push(`エーテル+${item.mp}`);
    if (item.crit) statParts.push(`クリ+${item.crit}%`);
    const card = document.createElement('div');
    card.className = 'shop-item-card';
    card.innerHTML = `
      <div>
        <div class="shop-item-name">${locked ? '🔒 ' : ''}${item.name}<span class="item-slot-tag">${statParts.join(' / ')}</span></div>
        <div class="shop-item-desc">${locked ? '実績「エーテリアの伝説」の解除が必要' : item.desc}</div>
      </div>
      <button class="shop-buy-btn" ${owned || !canBuy ? 'disabled' : ''}>${owned ? '所持済み' : (locked ? 'ロック中' : `${entry.cost} 欠片`)}</button>
    `;
    const btn = card.querySelector('.shop-buy-btn');
    btn.addEventListener('click', () => {
      if (owned || locked || state.shards < entry.cost) return;
      if (!spendShards(entry.cost)) return;
      addItem(entry.itemId);
      sfx.shardGet();
      showToast(`${item.name} を購入した`, 'quest');
      checkAchievements(undefined, undefined, SHOP_ITEMS.filter(e => !e.requiresAchievement).map(e => e.itemId)).forEach(a => { sfx.achievement(); showToast(`実績解除: ${a.name}（欠片+${a.reward || 0}）`, 'quest'); });
      saveGame();
      renderShop();
    });
    shopItemList.appendChild(card);
  });
  shopShardsEl.textContent = `所持している結晶の欠片: ${state.shards}`;
}

function openShop() {
  renderShop();
  shopScreen.style.display = 'flex';
  setMapOpen(true);
}
function closeShop() {
  shopScreen.style.display = 'none';
  setMapOpen(false);
}
document.getElementById('shop-close-btn').addEventListener('click', closeShop);
setOnOpenShop(openShop);

/* ============================================================
   大陸図（マップ）
   ============================================================ */
const mapScreen = document.getElementById('map-screen');
const mapCanvas = document.getElementById('map-canvas');
const mapCtx = mapCanvas.getContext('2d');

function drawMap() {
  const w = mapCanvas.width, h = mapCanvas.height;
  const contentRadius = Math.max(...fieldTargets.map(t => Math.hypot(t.localPos.x, t.localPos.z)), 500) * 1.15;
  const scale = (Math.min(w, h) / 2 - 20) / contentRadius;
  const cx = w / 2, cy = h / 2;
  mapCtx.fillStyle = '#ece2fb';
  mapCtx.fillRect(0, 0, w, h);
  mapCtx.strokeStyle = 'rgba(120,80,200,0.25)';
  for (let ring = 500; ring < contentRadius; ring += 500) {
    mapCtx.beginPath();
    mapCtx.arc(cx, cy, ring * scale, 0, Math.PI * 2);
    mapCtx.stroke();
  }

  zoneMarkers.forEach(z => {
    const x = cx + z.localPos.x * scale, y = cy + z.localPos.z * scale;
    mapCtx.beginPath();
    mapCtx.arc(x, y, 7, 0, Math.PI * 2);
    mapCtx.fillStyle = z.chapterIndex === state.chapterIndex ? '#ffe27a' : (z.chapterIndex < state.chapterIndex ? '#5fd35f' : '#555');
    mapCtx.fill();
    mapCtx.fillStyle = '#2a1f3d';
    mapCtx.font = '11px sans-serif';
    mapCtx.textAlign = 'center';
    mapCtx.fillText(z.name, x, y - 12);
  });

  fieldTargets.forEach(t => {
    const chapterKey = CHAPTERS[t.chapterIndex].key;
    const defeated = isQuestDone(chapterKey, t.questId) || fieldQuestState(t.questId) === 'ready_turnin';
    const x = cx + t.localPos.x * scale, y = cy + t.localPos.z * scale;
    mapCtx.beginPath();
    mapCtx.arc(x, y, 4, 0, Math.PI * 2);
    mapCtx.fillStyle = defeated ? 'rgba(255,85,85,0.3)' : '#ff5555';
    mapCtx.fill();
  });
  questGivers.forEach(g => {
    const chapterKey = CHAPTERS[g.chapterIndex].key;
    const done = isQuestDone(chapterKey, g.questId);
    const x = cx + g.localPos.x * scale, y = cy + g.localPos.z * scale;
    mapCtx.beginPath();
    mapCtx.arc(x, y, 4, 0, Math.PI * 2);
    mapCtx.fillStyle = done ? 'rgba(255,215,94,0.3)' : '#ffd75e';
    mapCtx.fill();
  });

  explorePickups.forEach(p => {
    if (!p.mesh.visible) return;
    const x = cx + p.localPos.x * scale, y = cy + p.localPos.z * scale;
    mapCtx.beginPath();
    mapCtx.arc(x, y, 3.5, 0, Math.PI * 2);
    mapCtx.fillStyle = '#8fd35f';
    mapCtx.fill();
  });
  loreMarkers.forEach(m => {
    const chapterKey = CHAPTERS[m.chapterIndex].key;
    if (isQuestDone(chapterKey, m.questId)) return;
    const x = cx + m.localPos.x * scale, y = cy + m.localPos.z * scale;
    mapCtx.beginPath();
    mapCtx.arc(x, y, 3.5, 0, Math.PI * 2);
    mapCtx.fillStyle = '#b39ddb';
    mapCtx.fill();
  });

  hiddenTreasures.forEach(t => {
    if (!t.mesh.visible) return;
    const x = cx + t.localPos.x * scale, y = cy + t.localPos.z * scale;
    mapCtx.beginPath();
    mapCtx.arc(x, y, 3.5, 0, Math.PI * 2);
    mapCtx.fillStyle = '#ffd700';
    mapCtx.fill();
  });

  const sx = cx + shopLocalPos.x * scale, sy = cy + shopLocalPos.z * scale;
  mapCtx.beginPath();
  mapCtx.arc(sx, sy, 5, 0, Math.PI * 2);
  mapCtx.fillStyle = '#d4a84a';
  mapCtx.fill();

  const p = getPlayerLocalPos();
  const px = cx + p.x * scale, py = cy + p.z * scale;
  mapCtx.beginPath();
  mapCtx.arc(px, py, 6, 0, Math.PI * 2);
  mapCtx.fillStyle = '#1a6fd4';
  mapCtx.strokeStyle = '#2a1f3d';
  mapCtx.lineWidth = 1.5;
  mapCtx.fill();
  mapCtx.stroke();
}

function openMap() {
  drawMap();
  mapScreen.style.display = 'flex';
  setMapOpen(true);
}
function closeMap() {
  mapScreen.style.display = 'none';
  setMapOpen(false);
}
document.getElementById('map-btn').addEventListener('click', openMap);
document.getElementById('map-close-btn').addEventListener('click', closeMap);
setOnToggleMap(() => {
  if (mapScreen.style.display === 'flex') closeMap(); else openMap();
});

function showQuestBoard(chapterIndex) {
  els.storyScreen.style.display = 'none';
  renderQuestBoard(chapterIndex, () => {
    renderQuestTracker();
    saveGame();
  });
  document.getElementById('quest-board-screen').style.display = 'flex';
}

els.storyBtn.addEventListener('click', () => {
  sfx.uiClick();
  showQuestBoard(state.chapterIndex);
});

els.qbFightBtn.addEventListener('click', () => {
  document.getElementById('quest-board-screen').style.display = 'none';
  startBattlePhase();
});

els.startBtn.addEventListener('click', () => {
  if (!playerReady) return;
  resumeAudio();
  Object.assign(state, {
    chapterIndex: 0, level: 1, xp: 0, shards: 0, totalShardsEarned: 0, bossesDefeated: 0, lifetimeBestCombo: 0, newGamePlus: 0, chapterClearCounts: {},
    equipment: { weapon: null, armor: null, accessory: null },
    inventory: [], unlockedSkills: [], foundTreasures: [], achievements: [], questProgress: {}, fieldQuests: {}, usedRevive: false,
  });
  goExplore(null);
  showToast('光る結晶の目印に近づいて、崩壊の古城へ入ろう', 'info');
  const login = checkDailyLogin();
  if (login) {
    showToast(`ログインボーナス（${login.streak}日連続） 結晶の欠片 +${login.reward}`, 'quest');
    saveGame();
  }
});

els.continueBtn.addEventListener('click', () => {
  if (!playerReady) return;
  resumeAudio();
  loadGame();
  setMasterVolume(state.masterVolume);
  setQualityPreset(state.quality);
  syncSettingsUI();
  const stats = computeStats();
  state.playerMaxHP = stats.maxHP; state.playerHP = stats.maxHP;
  state.playerMaxMP = stats.maxMP; state.playerMP = stats.maxMP;
  state.playerMaxStam = stats.maxStam; state.playerStam = stats.maxStam;
  goExplore(state.chapterIndex);
  renderQuestTracker();
  updateBars();
  const login = checkDailyLogin();
  if (login) {
    showToast(`ログインボーナス（${login.streak}日連続） 結晶の欠片 +${login.reward}`, 'quest');
    checkAchievements().forEach(a => { sfx.achievement(); showToast(`実績解除: ${a.name}（欠片+${a.reward || 0}）`, 'quest'); spawnParticles(player.position.clone().add(new THREE.Vector3(0, 1.6, 0)), 0xffd700, 18); });
    saveGame();
  }
});

els.nextBtn.addEventListener('click', () => {
  const prevChapter = CHAPTERS[state.chapterIndex];
  els.endScreen.style.display = 'none';
  const nextIndex = state.chapterIndex + 1;
  state.chapterIndex = nextIndex;
  pendingPrependText = prevChapter.storyAfter;
  goExplore(nextIndex);
  showToast(`「${CHAPTERS[nextIndex].title}」への道が開かれた`, 'info');
});

els.retryBtn.addEventListener('click', () => {
  const isFinalWin = els.retryBtn.textContent === 'もう一度最初から';
  els.endScreen.style.display = 'none';
  if (isFinalWin) {
    Object.assign(state, {
      chapterIndex: 0, level: 1, xp: 0, shards: 0, totalShardsEarned: 0, bossesDefeated: 0, lifetimeBestCombo: 0, newGamePlus: 0, chapterClearCounts: {},
      equipment: { weapon: null, armor: null, accessory: null },
      inventory: [], unlockedSkills: [], foundTreasures: [], achievements: [], questProgress: {}, fieldQuests: {}, usedRevive: false,
    });
    document.getElementById('start-screen').style.display = 'flex';
  } else {
    setupChapterBattle(state.chapterIndex);
    startBattlePhase();
  }
});

els.ngPlusBtn.addEventListener('click', () => {
  els.endScreen.style.display = 'none';
  state.newGamePlus = (state.newGamePlus || 0) + 1;
  Object.assign(state, {
    chapterIndex: 0,
    questProgress: {}, fieldQuests: {}, foundTreasures: [], usedRevive: false,
  });
  showToast(`周回+${state.newGamePlus} を開始！ 装備・スキル・実績は引き継がれる。結晶獣がより強くなる。`, 'info');
  goExplore(null);
  checkAchievements().forEach(a => { sfx.achievement(); showToast(`実績解除: ${a.name}（欠片+${a.reward || 0}）`, 'quest'); spawnParticles(player.position.clone().add(new THREE.Vector3(0, 1.6, 0)), 0xffd700, 18); });
  saveGame();
});

setCombatCallbacks({
  onWin: () => { saveGame(); },
  onLose: () => {},
});

/* ============================================================
   戦闘ボタン
   ============================================================ */
document.getElementById('btn-attack').addEventListener('click', () => playerAction('attack'));
document.getElementById('btn-heavy').addEventListener('click', () => playerAction('heavy'));
document.getElementById('btn-skill').addEventListener('click', () => playerAction('skill'));
document.getElementById('btn-guard').addEventListener('click', () => playerAction('guard'));
document.getElementById('btn-heal').addEventListener('click', () => playerAction('heal'));

const BATTLE_KEY_ACTIONS = { '1': 'attack', '2': 'heavy', '3': 'skill', '4': 'guard', '5': 'heal' };
window.addEventListener('keydown', (e) => {
  if (!state.playing || exploreActive) return;
  if (e.repeat) return;
  const dodgeZoneOpen = document.getElementById('dodge-zone').style.display === 'flex';
  if (dodgeZoneOpen && (e.key === ' ' || e.code === 'Space')) {
    e.preventDefault();
    els.dodgeBtn.click();
    return;
  }
  const action = BATTLE_KEY_ACTIONS[e.key];
  if (action) playerAction(action);
});

/* ============================================================
   メニュー（ステータス／装備／スキル／所持品／設定）
   ============================================================ */
initMenu(
  () => {},
  () => {
    els.menuOverlay.classList.remove('open');
    saveGame();
    resetSkirmish();
    cancelDodgeQTE();
    exitExploreMode();
    document.getElementById('start-screen').style.display = 'flex';
    state.playing = false;
    document.getElementById('story-screen').style.display = 'none';
    document.getElementById('quest-board-screen').style.display = 'none';
    document.getElementById('shop-screen').style.display = 'none';
    document.getElementById('map-screen').style.display = 'none';
    els.endScreen.style.display = 'none';
  }
);

/* ============================================================
   モデル読み込み ＆ タイトル初期化
   ============================================================ */
spawnEnemy(CHAPTERS[0].enemyDef);
state.bossHP = CHAPTERS[0].hp;
state.bossMaxHP = CHAPTERS[0].hp;
updateBars();

els.startBtn.textContent = '読み込み中...';
els.startBtn.style.opacity = '0.5';
els.startBtn.style.pointerEvents = 'none';
setLoadingProgress(0.05, '結晶データを読み込み中...');

loadPlayerModel((frac) => {
  setLoadingProgress(0.1 + frac * 0.85, `アッシュの記憶を再構築中... ${Math.round(frac * 100)}%`);
}).then(() => {
  if (!playerReady) {
    setLoadingProgress(1, '読み込みに失敗しました。ページを再読み込みしてください。');
    els.startBtn.textContent = '読み込み失敗';
    return;
  }
  setLoadingProgress(1, '準備完了');
  els.startBtn.textContent = '物語を始める';
  els.startBtn.style.opacity = '1';
  els.startBtn.style.pointerEvents = 'auto';
  if (hasSaveGame()) {
    els.continueBtn.style.display = 'inline-block';
  }
  setTimeout(hideLoadingScreen, 300);
});

/* ============================================================
   アイドルアニメーション & レンダリングループ
   ============================================================ */
let t = 0;
let lastTime = performance.now();
function animate() {
  requestAnimationFrame(animate);
  const now = performance.now();
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;
  t += dt;

  if (playerMixer) playerMixer.update(dt);

  const boss = EnemyModule.boss;
  if (boss) {
    boss.position.y = Math.sin(t * 0.8) * 0.06;
    boss.rotation.y = (state.playing ? -0.5 : boss.rotation.y) + Math.sin(t * 0.3) * 0.05;
    bossGlow.intensity = (state.phase2 ? 5.0 : 3.2) + Math.sin(t * 2) * 0.6;
    boss.userData.eyes.forEach(e => e.material.emissiveIntensity = (state.phase2 ? 5 : 3) + Math.sin(t * 3) * 0.8);
  }

  torchFires.forEach((f, i) => {
    f.rotation.y = t * 0.6 + i;
    f.scale.setScalar(1 + Math.sin(t * 8 + i) * 0.15);
  });

  updateParticles(dt);
  updateFireflies(t);
  updateBirds(t);
  updateCritters(t);
  updateGrassWind(t);
  if (exploreActive) {
    updateDayNightCycle(t);
    const lp = getPlayerLocalPos();
    updateLeaves(t, lp.x, lp.z);
    updateShootingStars(t, dt, lp.x, lp.z, isNightTime(t));
    updateRain(t, dt, lp.x, lp.z);
    updateSnow(t, dt, lp.x, lp.z);
    updateEmbers(t, dt, lp.x, lp.z);
  }
  if (exploreActive) {
    updateExplore(dt);
  } else {
    updateShakeAndApplyCamera(dt, camFittedPos);
    camera.lookAt(camLookAt);
  }

  composer.render();
}
animate();

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && (exploreActive || state.playing)) saveGame();
});

window.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (shopScreen.style.display === 'flex') closeShop();
  else if (mapScreen.style.display === 'flex') closeMap();
  else if (!els.menuOverlay.classList.contains('open') && state.playing && document.getElementById('dodge-zone').style.display !== 'flex') openMenu();
});

window.addEventListener('keydown', (e) => {
  if (e.repeat || !exploreActive || e.key !== 'Tab') return;
  e.preventDefault();
  if (els.menuOverlay.classList.contains('open')) closeMenu(); else openMenu();
});

window.addEventListener('keydown', (e) => {
  if (e.repeat || e.key !== 'Enter') return;
  const active = document.activeElement;
  if (active && (active.tagName === 'INPUT' || active.tagName === 'SELECT' || active.tagName === 'BUTTON')) return;
  if (document.getElementById('story-screen').style.display === 'flex') { e.preventDefault(); els.storyBtn.click(); }
  else if (document.getElementById('quest-board-screen').style.display === 'flex') { e.preventDefault(); els.qbFightBtn.click(); }
  else if (els.endScreen.style.display === 'flex' && els.nextBtn.style.display !== 'none') { e.preventDefault(); els.nextBtn.click(); }
  else if (els.endScreen.style.display === 'flex' && els.retryBtn.style.display !== 'none') { e.preventDefault(); els.retryBtn.click(); }
});

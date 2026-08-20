import { camera, composer, camFittedPos, camLookAt, mountRenderer, torchFires, bossGlow } from './scene.js';
import { player, loadPlayerModel, playerMixer, playerReady } from './player.js';
import * as EnemyModule from './enemy.js';
import { spawnEnemy } from './enemy.js';
import { updateParticles, updateShakeAndApplyCamera, triggerShake } from './effects.js';
import { resumeAudio, sfx, setMasterVolume } from './audio.js';
import { CHAPTERS, ITEMS } from './data.js';
import { state, saveGame, loadGame, hasSaveGame, chapterQuestsDone, ownsItem, addItem, spendShards } from './state.js';
import { els, updateBars, log, setLoadingProgress, hideLoadingScreen, renderQuestBoard,
  renderQuestTracker, initMenu, refreshAllMenuTabs, showToast } from './ui.js';
import { setupChapterBattle, startBattlePhase, playerAction, setCombatCallbacks } from './combat.js';
import { HUB_SPAWN, zoneLocalPos, zoneMarkers, questGivers, fieldTargets, shopLocalPos, SHOP_ITEMS } from './world.js';
import { enterExploreMode, exitExploreMode, updateExplore, initJoystick, setOnEnterZone,
  setOnOpenShop, setOnToggleMap, getPlayerLocalPos, exploreActive, setMapOpen } from './explore.js';
import { initSkirmishUI } from './skirmish.js';

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
  els.questPreview.textContent = `この聖域のクエスト: ${doneCount}/${chapter.quests.length} 達成済み`;
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
  SHOP_ITEMS.forEach(entry => {
    const item = ITEMS[entry.itemId];
    const owned = ownsItem(entry.itemId);
    const canBuy = !owned && state.shards >= entry.cost;
    const card = document.createElement('div');
    card.className = 'shop-item-card';
    card.innerHTML = `
      <div>
        <div class="shop-item-name">${item.name}</div>
        <div class="shop-item-desc">${item.desc}</div>
      </div>
      <button class="shop-buy-btn" ${owned || !canBuy ? 'disabled' : ''}>${owned ? '所持済み' : `${entry.cost} 欠片`}</button>
    `;
    const btn = card.querySelector('.shop-buy-btn');
    btn.addEventListener('click', () => {
      if (owned || state.shards < entry.cost) return;
      if (!spendShards(entry.cost)) return;
      addItem(entry.itemId);
      sfx.shardGet();
      showToast(`${item.name} を購入した`, 'quest');
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
document.getElementById('shop-close-btn').addEventListener('click', () => {
  shopScreen.style.display = 'none';
  setMapOpen(false);
});
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
    const x = cx + t.localPos.x * scale, y = cy + t.localPos.z * scale;
    mapCtx.beginPath();
    mapCtx.arc(x, y, 4, 0, Math.PI * 2);
    mapCtx.fillStyle = '#ff5555';
    mapCtx.fill();
  });
  questGivers.forEach(g => {
    const x = cx + g.localPos.x * scale, y = cy + g.localPos.z * scale;
    mapCtx.beginPath();
    mapCtx.arc(x, y, 4, 0, Math.PI * 2);
    mapCtx.fillStyle = '#ffd75e';
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
    chapterIndex: 0, level: 1, xp: 0, shards: 0, totalShardsEarned: 0,
    equipment: { weapon: null, armor: null, accessory: null },
    inventory: [], unlockedSkills: [], questProgress: {}, fieldQuests: {}, usedRevive: false,
  });
  goExplore(null);
  showToast('光る結晶の目印に近づいて、崩壊の古城へ入ろう', 'info');
});

els.continueBtn.addEventListener('click', () => {
  if (!playerReady) return;
  resumeAudio();
  loadGame();
  setMasterVolume(state.masterVolume);
  goExplore(state.chapterIndex);
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
      chapterIndex: 0, level: 1, xp: 0, shards: 0, totalShardsEarned: 0,
      equipment: { weapon: null, armor: null, accessory: null },
      inventory: [], unlockedSkills: [], questProgress: {}, fieldQuests: {}, usedRevive: false,
    });
    document.getElementById('start-screen').style.display = 'flex';
  } else {
    setupChapterBattle(state.chapterIndex);
    startBattlePhase();
  }
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

/* ============================================================
   メニュー（ステータス／装備／スキル／所持品／設定）
   ============================================================ */
initMenu(
  () => {},
  () => {
    els.menuOverlay.classList.remove('open');
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
  if (exploreActive) {
    updateExplore(dt);
  } else {
    updateShakeAndApplyCamera(dt, camFittedPos);
    camera.lookAt(camLookAt);
  }

  composer.render();
}
animate();

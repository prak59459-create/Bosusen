import * as THREE from 'three';
import { camera, composer, camFittedPos, camLookAt, mountRenderer, torchFires, bossGlow, setQualityPreset, updateDayNightCycle, isNightTime, isLowQuality, getDayCount, getTimeOfDayLabel } from './scene.js';
import { player, loadPlayerModel, playerMixer, playerReady, setCompanionVisible, updateCompanion } from './player.js';
import * as EnemyModule from './enemy.js';
import { spawnEnemy } from './enemy.js';
import { updateParticles, updateShakeAndApplyCamera, triggerShake, spawnParticles, rumble, triggerCritFlash } from './effects.js';
import { resumeAudio, sfx, setMasterVolume, setRainIntensity, setBiomeDrone } from './audio.js';
import { CHAPTERS, ITEMS } from './data.js';
import { state, saveGame, loadGame, hasSaveGame, chapterQuestsDone, ownsItem, addItem, spendShards, addShards, computeStats, isQuestDone, fieldQuestState, checkAchievements, checkDailyLogin, difficultyMult, totalQuestsDone, totalQuestsAll, peekSaveSummary } from './state.js';
import { els, updateBars, log, setLoadingProgress, hideLoadingScreen, renderQuestBoard,
  renderQuestTracker, initMenu, refreshAllMenuTabs, showToast, showCenterMsg, syncSettingsUI, openMenu, closeMenu, BIOME_CATEGORY_ICON, SLOT_ICON, itemScore } from './ui.js';
import { setupChapterBattle, startBattlePhase, playerAction, setCombatCallbacks, cancelDodgeQTE } from './combat.js';
import { HUB_SPAWN, zoneLocalPos, zoneMarkers, questGivers, fieldTargets, shopLocalPos, SHOP_ITEMS, explorePickups, loreMarkers, updateFireflies, hiddenTreasures, updateBirds, updateLeaves, updateCritters, updateShootingStars, updateGrassWind, updateRain, updateSnow, updateEmbers, updateSandstorm, updateCyberMotes, updateCrystalSparkles, updateAsh, biomeCategoryAt, biomeNameAt, triggerLightning, updateLightning, updateButterflies, updateScorpions, updateFoxes, updateFrogs, updateCrows, updateSalamanders, updateDrones, updateSpirits, triggerRainbow, updateRainbow, updateHubSparks, updateGuideBeams } from './world.js';
import { enterExploreMode, exitExploreMode, updateExplore, initJoystick, setOnEnterZone,
  setOnOpenShop, setOnToggleMap, setOnToggleMute, getPlayerLocalPos, exploreActive, setMapOpen, setExploreLocalPos, getPlayerFacing } from './explore.js';
import { initSkirmishUI, resetSkirmish } from './skirmish.js';

mountRenderer();

function toggleHelpOverlay() {
  const el = document.getElementById('help-overlay');
  if (el) el.classList.toggle('show');
  sfx.uiClick();
}
document.getElementById('help-btn').addEventListener('click', toggleHelpOverlay);
document.getElementById('help-close-btn').addEventListener('click', toggleHelpOverlay);
document.getElementById('help-overlay').addEventListener('click', (e) => {
  if (e.target.id === 'help-overlay') toggleHelpOverlay();
});
window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyH' && !e.repeat) toggleHelpOverlay();
  if (e.code === 'KeyB' && !e.repeat && exploreActive) cycleRadarZoom();
  if (e.code === 'F3' && !e.repeat) {
    e.preventDefault();
    debugOverlayVisible = !debugOverlayVisible;
    const debugEl = document.getElementById('debug-overlay');
    if (debugEl) debugEl.style.display = debugOverlayVisible ? 'block' : 'none';
  }
  if (e.code === 'F4' && !e.repeat) {
    e.preventDefault();
    const order = ['high', 'medium', 'low'];
    const idx = order.indexOf(state.quality || 'high');
    state.quality = order[(idx + 1) % order.length];
    setQualityPreset(state.quality);
    const qSelect = document.getElementById('opt-quality');
    if (qSelect) qSelect.value = state.quality;
    showToast(`グラフィック品質: ${state.quality.toUpperCase()}`, 'info');
    saveGame();
  }
  if (e.code === 'F5' && !e.repeat && (exploreActive || state.playing)) {
    e.preventDefault();
    if (saveGame()) { sfx.uiClick(); showToast('クイックセーブしました', 'info'); }
  }
});
let debugOverlayVisible = false;

let saveIndicatorTimer = null;
window.addEventListener('bosusen-saved', () => {
  const el = document.getElementById('save-indicator');
  if (!el) return;
  el.classList.add('show');
  clearTimeout(saveIndicatorTimer);
  saveIndicatorTimer = setTimeout(() => el.classList.remove('show'), 1400);
});
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
  const affordableFilterEl = document.getElementById('shop-affordable-filter');
  const affordableOnly = affordableFilterEl && affordableFilterEl.checked;
  const upgradeSortEl = document.getElementById('shop-upgrade-sort');
  const upgradeFirst = upgradeSortEl && upgradeSortEl.checked;
  const shopItemsSorted = upgradeFirst
    ? [...SHOP_ITEMS].sort((a, b) => {
        const scoreFor = (entry) => {
          const item = ITEMS[entry.itemId];
          const equippedId = state.equipment[item.slot];
          const equippedItem = equippedId ? ITEMS[equippedId] : null;
          return itemScore(item) - (equippedItem ? itemScore(equippedItem) : 0);
        };
        return scoreFor(b) - scoreFor(a);
      })
    : SHOP_ITEMS;
  shopItemsSorted.forEach(entry => {
    const item = ITEMS[entry.itemId];
    const owned = ownsItem(entry.itemId);
    const locked = entry.requiresAchievement && !state.achievements.includes(entry.requiresAchievement);
    const canBuy = !owned && !locked && state.shards >= entry.cost;
    if (affordableOnly && !canBuy) return;
    const statParts = [];
    if (item.atk) statParts.push(`攻撃+${item.atk}`);
    if (item.def) statParts.push(`防御+${item.def}`);
    if (item.hp) statParts.push(`HP+${item.hp}`);
    if (item.mp) statParts.push(`エーテル+${item.mp}`);
    if (item.crit) statParts.push(`クリ+${item.crit}%`);
    let upgradeTag = '';
    if (!locked && !owned) {
      const equippedId = state.equipment[item.slot];
      const equippedItem = equippedId ? ITEMS[equippedId] : null;
      if (!equippedItem) upgradeTag = ' <span style="color:#2e8b45;">▲装備なし</span>';
      else {
        const diff = itemScore(item) - itemScore(equippedItem);
        if (diff > 0) upgradeTag = ' <span style="color:#2e8b45;">▲強化</span>';
        else if (diff < 0) upgradeTag = ' <span style="color:#a3790a;">▼弱化</span>';
      }
    }
    const card = document.createElement('div');
    card.className = 'shop-item-card';
    card.innerHTML = `
      <div>
        <div class="shop-item-name">${locked ? '🔒 ' : (SLOT_ICON[item.slot] || '') + ' '}${item.name}${upgradeTag}<span class="item-slot-tag">${statParts.join(' / ')}</span></div>
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
  if (shopItemList.children.length === 0) {
    const hint = document.createElement('div');
    hint.className = 'empty-hint';
    hint.style.padding = '12px 4px';
    hint.textContent = ownedCount >= SHOP_ITEMS.length
      ? 'すべての商品を購入済みです'
      : '今の所持シャードで購入できる商品はありません';
    shopItemList.appendChild(hint);
  }
  shopShardsEl.textContent = `所持している結晶の欠片: ${state.shards}`;
}

const pinnedAchievementBadgeEl = document.getElementById('pinned-achievement-badge');
if (pinnedAchievementBadgeEl) {
  pinnedAchievementBadgeEl.style.cursor = 'pointer';
  pinnedAchievementBadgeEl.addEventListener('click', () => {
    if (!state.playing) return;
    openMenu();
    document.querySelector('.menu-tab[data-tab="status"]')?.click();
    setTimeout(() => {
      const achList = document.getElementById('achievement-list');
      const pinnedRow = achList && achList.querySelector('[data-pinned="1"]');
      if (pinnedRow) {
        pinnedRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
        pinnedRow.classList.add('highlight-pulse');
        setTimeout(() => pinnedRow.classList.remove('highlight-pulse'), 1600);
      }
    }, 150);
  });
}

const flashTestBtn = document.getElementById('flash-test-btn');
if (flashTestBtn) {
  flashTestBtn.addEventListener('click', (e) => {
    e.preventDefault();
    if (state.reduceFlashing) showToast('「画面フラッシュ演出を減らす」が有効なため表示されません', 'info');
    else triggerCritFlash();
  });
}

const shakeTestBtn = document.getElementById('shake-test-btn');
if (shakeTestBtn) {
  shakeTestBtn.addEventListener('click', (e) => {
    e.preventDefault();
    triggerShake(0.4, 300);
  });
}

const rumbleTestBtn = document.getElementById('rumble-test-btn');
if (rumbleTestBtn) {
  rumbleTestBtn.addEventListener('click', (e) => {
    e.preventDefault();
    rumble(0.8, 350);
    showToast('ゲームパッドを振動させました（未接続の場合は反応しません）', 'info');
  });
}

const shopAffordableFilterEl = document.getElementById('shop-affordable-filter');
if (shopAffordableFilterEl) shopAffordableFilterEl.addEventListener('change', renderShop);
const shopUpgradeSortEl = document.getElementById('shop-upgrade-sort');
if (shopUpgradeSortEl) shopUpgradeSortEl.addEventListener('change', renderShop);

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
shopScreen.addEventListener('click', (e) => { if (e.target === shopScreen) closeShop(); });
setOnOpenShop(openShop);

/* ============================================================
   大陸図（マップ）
   ============================================================ */
const mapScreen = document.getElementById('map-screen');
const mapCanvas = document.getElementById('map-canvas');
const mapCtx = mapCanvas.getContext('2d');

const radarCanvas = document.getElementById('minimap-radar');
const radarCtx = radarCanvas ? radarCanvas.getContext('2d') : null;
const RADAR_ZOOM_LEVELS = [250, 500, 1000];
let radarZoomIdx = 1;
function cycleRadarZoom() {
  radarZoomIdx = (radarZoomIdx + 1) % RADAR_ZOOM_LEVELS.length;
  showToast(`ミニマップ範囲: ${RADAR_ZOOM_LEVELS[radarZoomIdx]}m`, 'info');
}

function drawRadar() {
  if (!radarCtx || !exploreActive) return;
  const w = radarCanvas.width, h = radarCanvas.height;
  radarCtx.clearRect(0, 0, w, h);
  const cx = w / 2, cy = h / 2;
  const radarRange = RADAR_ZOOM_LEVELS[radarZoomIdx];
  const scale = (Math.min(w, h) / 2 - 6) / radarRange;
  const pLocal = getPlayerLocalPos();
  const biomeLabelEl = document.getElementById('biome-label');
  if (biomeLabelEl) {
    const bName = biomeNameAt(pLocal.x, pLocal.z);
    const bCat = biomeCategoryAt(pLocal.x, pLocal.z);
    biomeLabelEl.textContent = bName ? `${BIOME_CATEGORY_ICON[bCat] || ''} ${bName}` : '';
  }
  const dots = [];
  zoneMarkers.forEach(z => dots.push({ x: z.localPos.x, z: z.localPos.z, color: z.chapterIndex === state.chapterIndex ? '#ffe27a' : '#5fd35f' }));
  fieldTargets.forEach(f => dots.push({ x: f.localPos.x, z: f.localPos.z, color: '#ff5a5a' }));
  hiddenTreasures.forEach(tr => { if (!state.foundTreasures.includes(tr.id)) dots.push({ x: tr.localPos.x, z: tr.localPos.z, color: '#ffd700' }); });
  questGivers.forEach(g => { if (!isQuestDone(CHAPTERS[g.chapterIndex].key, g.questId)) dots.push({ x: g.localPos.x, z: g.localPos.z, color: '#ffd75e' }); });
  loreMarkers.forEach(m => { if (!isQuestDone(CHAPTERS[m.chapterIndex].key, m.questId)) dots.push({ x: m.localPos.x, z: m.localPos.z, color: '#b39ddb' }); });
  explorePickups.forEach(p => { if (p.mesh.visible) dots.push({ x: p.localPos.x, z: p.localPos.z, color: '#8fd35f' }); });
  radarCtx.save();
  radarCtx.beginPath();
  radarCtx.arc(cx, cy, Math.min(w, h) / 2 - 2, 0, Math.PI * 2);
  radarCtx.clip();
  dots.forEach(d => {
    const dx = d.x - pLocal.x, dz = d.z - pLocal.z;
    const dist = Math.hypot(dx, dz);
    if (dist > radarRange) return;
    const x = cx + dx * scale, y = cy + dz * scale;
    radarCtx.beginPath();
    radarCtx.arc(x, y, 4, 0, Math.PI * 2);
    radarCtx.fillStyle = d.color;
    radarCtx.fill();
  });
  radarCtx.restore();

  const hdx = -pLocal.x, hdz = -pLocal.z;
  const hdist = Math.hypot(hdx, hdz);
  if (hdist > radarRange * 0.9) {
    const ang = Math.atan2(hdx, hdz);
    const edgeR = Math.min(w, h) / 2 - 8;
    const hx = cx + Math.sin(ang) * edgeR, hy = cy + Math.cos(ang) * edgeR;
    radarCtx.beginPath();
    radarCtx.arc(hx, hy, 4, 0, Math.PI * 2);
    radarCtx.fillStyle = '#7a5fd0';
    radarCtx.fill();
  }

  radarCtx.fillStyle = '#3d2f5c';
  radarCtx.font = 'bold 11px sans-serif';
  radarCtx.textAlign = 'center';
  radarCtx.textBaseline = 'middle';
  radarCtx.fillText('N', cx, 12);
  radarCtx.fillText('S', cx, h - 12);
  radarCtx.fillText('E', w - 12, cy);
  radarCtx.fillText('W', 12, cy);

  const facing = getPlayerFacing();
  radarCtx.save();
  radarCtx.translate(cx, cy);
  radarCtx.rotate(facing);
  radarCtx.beginPath();
  radarCtx.moveTo(0, -6);
  radarCtx.lineTo(-5, 5);
  radarCtx.lineTo(5, 5);
  radarCtx.closePath();
  radarCtx.fillStyle = '#3d2f5c';
  radarCtx.fill();
  radarCtx.restore();
}

let mapScaleInfo = { scale: 1, cx: 0, cy: 0 };
let mapZoomFactor = 1;
let mapPanX = 0, mapPanY = 0;
function drawMap() {
  const w = mapCanvas.width, h = mapCanvas.height;
  const contentRadius = Math.max(...fieldTargets.map(t => Math.hypot(t.localPos.x, t.localPos.z)), 500) * 1.15;
  const scale = ((Math.min(w, h) / 2 - 20) / contentRadius) * mapZoomFactor;
  const cx = w / 2 + mapPanX, cy = h / 2 + mapPanY;
  const zoomLabelEl = document.getElementById('map-zoom-label');
  if (zoomLabelEl) zoomLabelEl.textContent = `${Math.round(mapZoomFactor * 100)}%`;
  mapScaleInfo = { scale, cx, cy };
  mapCtx.fillStyle = '#ece2fb';
  mapCtx.fillRect(0, 0, w, h);
  mapCtx.strokeStyle = 'rgba(120,80,200,0.25)';
  for (let ring = 500; ring < contentRadius; ring += 500) {
    mapCtx.beginPath();
    mapCtx.arc(cx, cy, ring * scale, 0, Math.PI * 2);
    mapCtx.stroke();
  }

  mapCtx.beginPath();
  mapCtx.arc(cx, cy, 8, 0, Math.PI * 2);
  mapCtx.fillStyle = '#7a5fd0';
  mapCtx.fill();
  mapCtx.strokeStyle = '#2a1f3d';
  mapCtx.lineWidth = 1.5;
  mapCtx.stroke();
  mapCtx.fillStyle = '#2a1f3d';
  mapCtx.font = '11px sans-serif';
  mapCtx.textAlign = 'center';
  mapCtx.fillText('拠点', cx, cy - 13);

  {
    const pLocal = getPlayerLocalPos();
    const px = cx + pLocal.x * scale, py = cy + pLocal.z * scale;
    const pFacing = getPlayerFacing();
    mapCtx.save();
    mapCtx.translate(px, py);
    mapCtx.rotate(pFacing);
    mapCtx.beginPath();
    mapCtx.moveTo(0, -9);
    mapCtx.lineTo(-7, 8);
    mapCtx.lineTo(7, 8);
    mapCtx.closePath();
    mapCtx.fillStyle = '#1a6fd4';
    mapCtx.fill();
    mapCtx.strokeStyle = '#2a1f3d';
    mapCtx.lineWidth = 1.5;
    mapCtx.stroke();
    mapCtx.restore();
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
  mapZoomFactor = 1;
  mapPanX = 0; mapPanY = 0;
  drawMap();
  const summaryEl = document.getElementById('map-summary');
  if (summaryEl) {
    const clearedZones = zoneMarkers.filter(z => z.chapterIndex < state.chapterIndex).length;
    summaryEl.textContent = `聖域制覇: ${clearedZones}/${zoneMarkers.length}｜クエスト: ${totalQuestsDone()}/${totalQuestsAll()}｜秘宝: ${state.foundTreasures.length}/${hiddenTreasures.length}｜バイオーム: ${(state.discoveredBiomes || []).length}/35`;
  }
  mapScreen.style.display = 'flex';
  setMapOpen(true);
}
function closeMap() {
  mapScreen.style.display = 'none';
  setMapOpen(false);
}
mapCanvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  mapZoomFactor = Math.max(1, Math.min(4, mapZoomFactor - Math.sign(e.deltaY) * 0.2));
  drawMap();
}, { passive: false });
const mapRecenterBtn = document.getElementById('map-recenter-btn');
if (mapRecenterBtn) {
  mapRecenterBtn.addEventListener('click', () => {
    const pLocal = getPlayerLocalPos();
    mapPanX = -pLocal.x * mapScaleInfo.scale;
    mapPanY = -pLocal.z * mapScaleInfo.scale;
    drawMap();
  });
}
const mapZoomInBtn = document.getElementById('map-zoom-in-btn');
if (mapZoomInBtn) mapZoomInBtn.addEventListener('click', () => { mapZoomFactor = Math.min(4, mapZoomFactor + 0.3); drawMap(); });
const mapZoomOutBtn = document.getElementById('map-zoom-out-btn');
if (mapZoomOutBtn) mapZoomOutBtn.addEventListener('click', () => { mapZoomFactor = Math.max(1, mapZoomFactor - 0.3); drawMap(); });
mapCanvas.addEventListener('dblclick', (e) => {
  e.preventDefault();
  mapZoomFactor = 1;
  mapPanX = 0; mapPanY = 0;
  drawMap();
});
let mapDragging = false, mapDragStartX = 0, mapDragStartY = 0, mapDragMoved = false;
mapCanvas.addEventListener('pointerdown', (e) => {
  mapDragging = true;
  mapDragMoved = false;
  mapDragStartX = e.clientX; mapDragStartY = e.clientY;
  mapCanvas.setPointerCapture(e.pointerId);
});
mapCanvas.addEventListener('pointermove', (e) => {
  if (!mapDragging) return;
  const dx = e.clientX - mapDragStartX, dy = e.clientY - mapDragStartY;
  if (Math.abs(dx) > 3 || Math.abs(dy) > 3) mapDragMoved = true;
  if (mapDragMoved) {
    const rect = mapCanvas.getBoundingClientRect();
    mapPanX += dx * (mapCanvas.width / rect.width);
    mapPanY += dy * (mapCanvas.height / rect.height);
    const maxPan = (mapCanvas.width / 2) * (mapZoomFactor - 1) + 150;
    mapPanX = Math.max(-maxPan, Math.min(maxPan, mapPanX));
    mapPanY = Math.max(-maxPan, Math.min(maxPan, mapPanY));
    mapDragStartX = e.clientX; mapDragStartY = e.clientY;
    drawMap();
  }
});
mapCanvas.addEventListener('pointerup', () => { mapDragging = false; });
window.addEventListener('blur', () => { mapDragging = false; });
mapCanvas.addEventListener('click', (e) => {
  if (!exploreActive) return;
  if (mapDragMoved) return;
  const rect = mapCanvas.getBoundingClientRect();
  const px = (e.clientX - rect.left) * (mapCanvas.width / rect.width);
  const py = (e.clientY - rect.top) * (mapCanvas.height / rect.height);
  const { scale, cx, cy } = mapScaleInfo;
  if (Math.hypot(px - cx, py - cy) < 12) {
    setExploreLocalPos(new THREE.Vector3(0, 0, 0));
    sfx.uiClick();
    showToast('拠点へファストトラベルした', 'quest');
    closeMap();
    return;
  }
  let nearest = null, nearestDist = Infinity;
  zoneMarkers.forEach(z => {
    const x = cx + z.localPos.x * scale, y = cy + z.localPos.z * scale;
    const d = Math.hypot(px - x, py - y);
    if (d < 14 && d < nearestDist) { nearest = z; nearestDist = d; }
  });
  if (!nearest) return;
  if (nearest.chapterIndex > state.chapterIndex) {
    showToast('まだ到達していない聖域です', 'quest');
    return;
  }
  setExploreLocalPos(new THREE.Vector3(nearest.localPos.x * 0.7, 0, nearest.localPos.z * 0.7));
  sfx.uiClick();
  showToast(`${nearest.name} へファストトラベルした`, 'quest');
  closeMap();
});
document.getElementById('map-btn').addEventListener('click', openMap);
document.getElementById('map-close-btn').addEventListener('click', closeMap);
mapScreen.addEventListener('click', (e) => { if (e.target === mapScreen) closeMap(); });
setOnToggleMap(() => {
  if (mapScreen.style.display === 'flex') closeMap(); else openMap();
});

let volumeBeforeMute = null;
function toggleMute() {
  const btn = document.getElementById('mute-btn');
  if (volumeBeforeMute === null) {
    volumeBeforeMute = state.masterVolume;
    state.masterVolume = 0;
    setMasterVolume(0);
    btn.textContent = '🔇';
    btn.classList.add('muted');
  } else {
    state.masterVolume = volumeBeforeMute;
    setMasterVolume(volumeBeforeMute);
    volumeBeforeMute = null;
    btn.textContent = '🔊';
    btn.classList.remove('muted');
  }
  const volumeSlider = document.getElementById('opt-volume');
  if (volumeSlider) volumeSlider.value = Math.round(state.masterVolume * 100);
  saveGame();
}
document.getElementById('mute-btn').addEventListener('click', toggleMute);
window.addEventListener('bosusen-volume-slider-changed', (e) => {
  if (volumeBeforeMute !== null && e.detail.volume > 0) {
    volumeBeforeMute = null;
    const btn = document.getElementById('mute-btn');
    if (btn) { btn.textContent = '🔊'; btn.classList.remove('muted'); }
  }
});
window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyK' && !e.repeat) toggleMute();
});
setOnToggleMute(toggleMute);

const qbUndoneFilterEl = document.getElementById('qb-undone-filter');
if (qbUndoneFilterEl) qbUndoneFilterEl.addEventListener('change', () => showQuestBoard(state.chapterIndex));
const qbSortRewardEl = document.getElementById('qb-sort-reward');
if (qbSortRewardEl) qbSortRewardEl.addEventListener('change', () => showQuestBoard(state.chapterIndex));

function showQuestBoard(chapterIndex) {
  warnedIncompleteQuests = false;
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

let warnedIncompleteQuests = false;
els.qbFightBtn.addEventListener('click', () => {
  const chapter = CHAPTERS[state.chapterIndex];
  const doneCount = chapter.quests.filter(q => isQuestDone(chapter.key, q.id)).length;
  if (doneCount < chapter.quests.length && !warnedIncompleteQuests) {
    warnedIncompleteQuests = true;
    showToast(`未達成のクエストが${chapter.quests.length - doneCount}件残っています（もう一度押すと戦闘開始）`, 'info');
    return;
  }
  warnedIncompleteQuests = false;
  document.getElementById('quest-board-screen').style.display = 'none';
  startBattlePhase();
});

let sessionStartShards = 0, sessionStartBosses = 0;
els.startBtn.addEventListener('click', () => {
  if (!playerReady) return;
  if (hasSaveGame() && !window.confirm('既存のセーブデータを上書きして新しく始めます。よろしいですか？（この操作は取り消せません）')) return;
  resumeAudio();
  sessionStartShards = 0; sessionStartBosses = 0;
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
    sfx.shardGet();
    if (login.milestone) { sfx.achievement(); showCenterMsg(`${login.streak}日連続ログイン達成！`, '#ffd75e', 1800); }
    else if (login.welcomeBack) { showToast(`おかえりなさい！ ${login.welcomeBack}日ぶりの帰還です`, 'info'); }
    saveGame();
  }
});

els.continueBtn.addEventListener('click', () => {
  if (!playerReady) return;
  resumeAudio();
  loadGame();
  sessionStartShards = state.totalShardsEarned || 0;
  sessionStartBosses = state.bossesDefeated || 0;
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
    sfx.shardGet();
    if (login.milestone) { sfx.achievement(); showCenterMsg(`${login.streak}日連続ログイン達成！`, '#ffd75e', 1800); }
    else if (login.welcomeBack) { showToast(`おかえりなさい！ ${login.welcomeBack}日ぶりの帰還です`, 'info'); }
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
  const nextNg = (state.newGamePlus || 0) + 1;
  const bossMult = Math.round((1 + nextNg * 0.25) * 100);
  const shardMult = Math.round((1 + nextNg * 0.2) * 100);
  if (!window.confirm(`周回+${nextNg} を開始します。クエスト進行状況と探索状況はリセットされますが、装備・スキル・実績・レベルは引き継がれます。\n結晶獣の強さ: ${bossMult}%｜獲得シャード: ${shardMult}%\nよろしいですか？`)) return;
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
    const shardsEarned = (state.totalShardsEarned || 0) - sessionStartShards;
    const bossesEarned = (state.bossesDefeated || 0) - sessionStartBosses;
    if (shardsEarned > 0 || bossesEarned > 0) {
      showToast(`今回の冒険: 結晶獣撃破 ${bossesEarned}体｜獲得シャード ${shardsEarned}`, 'quest');
    }
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
  els.startBtn.style.opacity = '1';
  els.startBtn.style.pointerEvents = 'auto';
  if (hasSaveGame()) {
    els.startBtn.textContent = '新しく始める';
    els.continueBtn.style.display = 'inline-block';
    const summary = peekSaveSummary();
    const summaryEl = document.getElementById('continue-summary');
    if (summary && summaryEl) {
      const chapter = CHAPTERS[summary.chapterIndex];
      summaryEl.textContent = `Lv.${summary.level}｜${chapter ? chapter.title : '?'}${summary.newGamePlus > 0 ? `｜周回+${summary.newGamePlus}` : ''}`;
      summaryEl.style.display = 'block';
    }
  } else {
    els.startBtn.textContent = '物語を始める';
  }
  setTimeout(hideLoadingScreen, 300);
});

/* ============================================================
   アイドルアニメーション & レンダリングループ
   ============================================================ */
let t = 0;
let thunderTimer = 10;
let wasRaining = false;
let currentIsRaining = false;
let wasSensingTreasure = false;
let wasSensingFieldTarget = false;
let wasSensingQuestGiver = false;
let lastInputAt = performance.now();
let afkWarned = false;
let afkVolumeReduced = false;
['keydown', 'pointerdown', 'pointermove', 'wheel'].forEach(evt => {
  window.addEventListener(evt, () => {
    lastInputAt = performance.now();
    afkWarned = false;
    if (afkVolumeReduced) {
      afkVolumeReduced = false;
      setMasterVolume(state.masterVolume);
      if (exploreActive) showToast('おかえりなさい', 'info');
    }
  }, { passive: true });
});
let wildlifeSoundTimer = 5;
let lastTime = performance.now();
let fpsAccum = 0, fpsFrames = 0, fpsLastUpdate = 0;
let autoQualityAccum = 0, autoQualityFrames = 0, autoQualityLastCheck = 0, autoQualityTriggered = false;
function animate() {
  requestAnimationFrame(animate);
  const now = performance.now();
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;
  t += dt;
  state.totalPlaytimeSec = (state.totalPlaytimeSec || 0) + dt;

  if (debugOverlayVisible) {
    fpsAccum += dt; fpsFrames++;
    if (now - fpsLastUpdate > 500) {
      fpsLastUpdate = now;
      const fps = Math.round(fpsFrames / fpsAccum);
      fpsAccum = 0; fpsFrames = 0;
      const debugEl = document.getElementById('debug-overlay');
      if (debugEl) {
        const p = exploreActive ? getPlayerLocalPos() : { x: 0, z: 0 };
        const bName = exploreActive ? (biomeNameAt(p.x, p.z) || '-') : '-';
        debugEl.textContent = `FPS: ${fps}\n位置: x=${p.x.toFixed(1)} z=${p.z.toFixed(1)}\nバイオーム: ${bName}\n章: ${state.chapterIndex + 1}｜NG+${state.newGamePlus || 0}\n画質: ${(state.quality || 'high').toUpperCase()}\n経過時間: ${Math.round(t)}s`;
      }
    }
  }

  if (!autoQualityTriggered && state.autoQualityAdjust !== false && (state.quality || 'high') !== 'low') {
    autoQualityAccum += dt; autoQualityFrames++;
    if (now - autoQualityLastCheck > 6000) {
      autoQualityLastCheck = now;
      const avgFps = autoQualityFrames / autoQualityAccum;
      autoQualityAccum = 0; autoQualityFrames = 0;
      if (avgFps < 24) {
        autoQualityTriggered = true;
        const order = ['high', 'medium', 'low'];
        const idx = order.indexOf(state.quality || 'high');
        state.quality = order[Math.min(order.length - 1, idx + 1)];
        setQualityPreset(state.quality);
        const qSelect = document.getElementById('opt-quality');
        if (qSelect) qSelect.value = state.quality;
        showToast(`動作が重いためグラフィック品質を${state.quality.toUpperCase()}に自動調整しました`, 'info');
        saveGame();
      }
    }
  }

  if (playerMixer) playerMixer.update(dt);

  const boss = EnemyModule.boss;
  if (boss) {
    boss.position.y = Math.sin(t * 0.8) * 0.06;
    boss.rotation.y = (state.playing ? -0.5 : boss.rotation.y) + Math.sin(t * 0.3) * 0.05;
    const bossHpRatio = state.bossMaxHP > 0 ? state.bossHP / state.bossMaxHP : 1;
    const lowHpBoost = state.playing ? (1 - bossHpRatio) * 2.5 : 0;
    bossGlow.intensity = (state.phase2 ? 5.0 : 3.2) + lowHpBoost + Math.sin(t * (2 + lowHpBoost)) * 0.6;
    boss.userData.eyes.forEach(e => e.material.emissiveIntensity = (state.phase2 ? 5 : 3) + lowHpBoost + Math.sin(t * 3) * 0.8);
  }

  torchFires.forEach((f, i) => {
    f.rotation.y = t * 0.6 + i;
    f.scale.setScalar(1 + Math.sin(t * 8 + i) * 0.15);
  });

  updateParticles(dt);
  updateHubSparks(t, dt);
  updateGuideBeams(t, state.showGuideBeams !== false);
  if (!isLowQuality()) {
    updateFireflies(t);
    updateBirds(t);
    updateCritters(t);
    updateButterflies(t);
    updateScorpions(t);
    updateFoxes(t);
    updateFrogs(t);
    updateCrows(t);
    updateSalamanders(t);
    updateDrones(t);
    updateSpirits(t);
    updateGrassWind(t);
  }
  setCompanionVisible(exploreActive);
  if (exploreActive) {
    if (!afkWarned && performance.now() - lastInputAt > 300000) {
      afkWarned = true;
      showToast('しばらく操作がないようです。よければ休憩してくださいね', 'info');
    }
    if (!afkVolumeReduced && performance.now() - lastInputAt > 600000) {
      afkVolumeReduced = true;
      setMasterVolume(state.masterVolume * 0.3);
    }
    drawRadar();
    updateDayNightCycle(t);
    const dayCounterEl = document.getElementById('day-counter');
    const curDay = getDayCount(t);
    if (dayCounterEl) dayCounterEl.textContent = `${isNightTime(t) ? '🌙' : '☀️'} Day ${curDay} ・${getTimeOfDayLabel(t)}`;
    if (curDay > (state.lastBlessingDay || 0)) {
      state.lastBlessingDay = curDay;
      const blessing = 20 + Math.floor(Math.random() * 30);
      addShards(blessing);
      showCenterMsg(`本日の祝福！ +${blessing}シャード`, '#ffd700', 1800);
      sfx.pickup();
    }
    const lp = getPlayerLocalPos();
    let nearestTreasureDist = Infinity;
    hiddenTreasures.forEach(tr => {
      if (state.foundTreasures.includes(tr.id)) return;
      const d = Math.hypot(tr.localPos.x - lp.x, tr.localPos.z - lp.z);
      if (d < nearestTreasureDist) nearestTreasureDist = d;
    });
    const isSensingTreasure = nearestTreasureDist < 30;
    if (isSensingTreasure && !wasSensingTreasure && state.proximitySounds !== false) sfx.spiritChime();
    wasSensingTreasure = isSensingTreasure;
    let nearestFieldTargetDist = Infinity;
    fieldTargets.forEach(fTarget => {
      const done = isQuestDone(CHAPTERS[fTarget.chapterIndex].key, fTarget.questId) || fieldQuestState(fTarget.questId) === 'ready_turnin';
      if (done) return;
      const d = Math.hypot(fTarget.localPos.x - lp.x, fTarget.localPos.z - lp.z);
      if (d < nearestFieldTargetDist) nearestFieldTargetDist = d;
    });
    const isSensingFieldTarget = nearestFieldTargetDist < 25;
    if (isSensingFieldTarget && !wasSensingFieldTarget && state.proximitySounds !== false) sfx.targetSense();
    wasSensingFieldTarget = isSensingFieldTarget;
    let nearestQuestGiverDist = Infinity;
    questGivers.forEach(g => {
      if (isQuestDone(CHAPTERS[g.chapterIndex].key, g.questId)) return;
      const d = Math.hypot(g.localPos.x - lp.x, g.localPos.z - lp.z);
      if (d < nearestQuestGiverDist) nearestQuestGiverDist = d;
    });
    const isSensingQuestGiver = nearestQuestGiverDist < 20;
    if (isSensingQuestGiver && !wasSensingQuestGiver && state.proximitySounds !== false) sfx.giverSense();
    wasSensingQuestGiver = isSensingQuestGiver;
    updateCompanion(t, dt, isSensingTreasure || isSensingFieldTarget || isSensingQuestGiver);
    updateLeaves(t, lp.x, lp.z);
    const starWish = updateShootingStars(t, dt, lp.x, lp.z, isNightTime(t));
    if (starWish) {
      addShards(15);
      state.starWishesMade = (state.starWishesMade || 0) + 1;
      showToast('流れ星に願いを込めた… +15シャード', 'quest');
      sfx.shardGet();
      checkAchievements().forEach(a => { sfx.achievement(); showToast(`実績解除: ${a.name}（欠片+${a.reward || 0}）`, 'quest'); });
    }
    currentIsRaining = updateRain(t, dt, lp.x, lp.z);
    setRainIntensity(currentIsRaining ? 1 : 0);
    if (wasRaining && !currentIsRaining) triggerRainbow(lp.x, lp.z);
    wasRaining = currentIsRaining;
    updateRainbow(dt);
    if (currentIsRaining) {
      thunderTimer -= dt;
      if (thunderTimer <= 0) {
        thunderTimer = 8 + Math.random() * 14;
        if (!state.reduceFlashing) {
          const flashEl = document.getElementById('lightning-flash');
          if (flashEl) {
            flashEl.classList.add('flash');
            setTimeout(() => flashEl.classList.remove('flash'), 90);
          }
        }
        sfx.thunder();
        triggerLightning(lp.x, lp.z);
      }
    }
    updateLightning(dt);
    updateSnow(t, dt, lp.x, lp.z);
    updateEmbers(t, dt, lp.x, lp.z);
    updateSandstorm(t, dt, lp.x, lp.z);
    updateCyberMotes(t, dt, lp.x, lp.z);
    updateCrystalSparkles(t, dt, lp.x, lp.z);
    updateAsh(t, dt, lp.x, lp.z);
    const currentCat = biomeCategoryAt(lp.x, lp.z);
    setBiomeDrone(currentCat);
    wildlifeSoundTimer -= dt;
    if (wildlifeSoundTimer <= 0) {
      wildlifeSoundTimer = 6 + Math.random() * 8;
      if (currentCat === 'forest' && Math.random() < 0.5) sfx.critterChirp();
      else if (currentCat === 'swamp' && Math.random() < 0.5) sfx.frogCroak();
      else if (currentCat === 'wasteland' && Math.random() < 0.4) sfx.crowCaw();
      else if (currentCat === 'desert' && Math.random() < 0.35) sfx.scorpionClick();
      else if (currentCat === 'snow' && Math.random() < 0.35) sfx.foxYip();
      else if (currentCat === 'cyber' && Math.random() < 0.4) sfx.droneHum();
      else if (currentCat === 'crystal' && Math.random() < 0.4) sfx.spiritChime();
      else if (currentCat === 'volcanic' && Math.random() < 0.45) sfx.lavaRumble();
    }
  } else {
    setRainIntensity(0);
  }
  if (exploreActive) {
    updateExplore(dt, t, currentIsRaining);
  } else {
    updateShakeAndApplyCamera(dt, camFittedPos);
    camera.lookAt(camLookAt);
  }

  composer.render();
}
animate();

setInterval(() => {
  if (exploreActive || state.playing) saveGame();
}, 180000);

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    if (exploreActive || state.playing) saveGame();
    setMasterVolume(0);
  } else {
    setMasterVolume(state.masterVolume);
  }
});

window.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  const helpOverlayEl = document.getElementById('help-overlay');
  const skirmishPanelEl = document.getElementById('skirmish-panel');
  if (skirmishPanelEl && skirmishPanelEl.style.display === 'flex') document.getElementById('skirmish-flee-btn').click();
  else if (helpOverlayEl && helpOverlayEl.classList.contains('show')) toggleHelpOverlay();
  else if (shopScreen.style.display === 'flex') closeShop();
  else if (mapScreen.style.display === 'flex') closeMap();
  else if (els.menuOverlay.classList.contains('open')) closeMenu();
  else if (state.playing && document.getElementById('dodge-zone').style.display !== 'flex') openMenu();
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
  const skirmishPanelEl = document.getElementById('skirmish-panel');
  if (skirmishPanelEl && skirmishPanelEl.style.display === 'flex') {
    e.preventDefault();
    document.getElementById('skirmish-attack-btn').click();
  }
  else if (document.getElementById('start-screen').style.display !== 'none' && els.startBtn.style.pointerEvents !== 'none') {
    e.preventDefault();
    if (els.continueBtn.style.display !== 'none') els.continueBtn.click();
    else els.startBtn.click();
  }
  else if (document.getElementById('story-screen').style.display === 'flex') { e.preventDefault(); els.storyBtn.click(); }
  else if (document.getElementById('quest-board-screen').style.display === 'flex') { e.preventDefault(); els.qbFightBtn.click(); }
  else if (els.endScreen.style.display === 'flex' && els.nextBtn.style.display !== 'none') { e.preventDefault(); els.nextBtn.click(); }
  else if (els.endScreen.style.display === 'flex' && els.retryBtn.style.display !== 'none') { e.preventDefault(); els.retryBtn.click(); }
});

import { CHAPTERS, ITEMS, SKILLS, ACHIEVEMENTS } from './data.js';
import { state, computeStats, isQuestDone, ownsItem,
  equipItem, unequipSlot, unlockSkill, resetSkills, saveGame, clearSave, hasSaveGame, checkAchievements, totalQuestsDone, totalQuestsAll, exportSaveData, importSaveData } from './state.js';
import { sfx, setMasterVolume, setHeartbeatActive } from './audio.js';
import { setQualityPreset } from './scene.js';
import { setMapOpen } from './explore.js';
import { BIOME_NAMES, BIOME_ENTRIES } from './world.js';
import { rumble } from './effects.js';

export const SLOT_ICON = { weapon: '⚔️', armor: '🛡️', accessory: '💍' };
export const BIOME_CATEGORY_ICON = {
  forest: '🌳', desert: '🏜️', cyber: '🌆', snow: '❄️',
  swamp: '🐸', volcanic: '🌋', crystal: '💎', wasteland: '☠️',
};

export const els = {
  playerHPFill: document.getElementById('player-hp-fill'),
  playerHPGhost: document.getElementById('player-hp-ghost'),
  playerHPText: document.getElementById('player-hp-text'),
  playerMPFill: document.getElementById('player-mp-fill'),
  playerMPText: document.getElementById('player-mp-text'),
  playerStamFill: document.getElementById('player-stam-fill'),
  playerStamText: document.getElementById('player-stam-text'),
  playerLv: document.getElementById('player-lv'),
  bossName: document.getElementById('boss-name'),
  bossHPFill: document.getElementById('boss-hp-fill'),
  bossHPText: document.getElementById('boss-hp-text'),
  healCount: document.getElementById('heal-count'),
  centerMsg: document.getElementById('center-msg'),
  logWrap: document.getElementById('log-wrap'),
  comboDisplay: document.getElementById('combo-display'),
  phaseTag: document.getElementById('phase-tag'),
  telegraph: document.getElementById('telegraph'),
  telegraphName: document.getElementById('telegraph-name'),
  telegraphSub: document.getElementById('telegraph-sub'),
  dodgeZone: document.getElementById('dodge-zone'),
  dodgeBtn: document.getElementById('dodge-btn'),
  dodgeCircle: document.getElementById('dodge-circle'),
  dodgeRingWrap: document.getElementById('dodge-ring-wrap'),
  skillSub: document.getElementById('skill-sub'),
  startBtn: document.getElementById('start-btn'),
  continueBtn: document.getElementById('continue-btn'),
  storyScreen: document.getElementById('story-screen'),
  storyChapterTag: document.getElementById('story-chapter-tag'),
  storyTitle: document.getElementById('story-title'),
  storyText: document.getElementById('story-text'),
  storyBtn: document.getElementById('story-btn'),
  questPreview: document.getElementById('quest-preview'),
  questBoardScreen: document.getElementById('quest-board-screen'),
  qbChapterTag: document.getElementById('qb-chapter-tag'),
  qbQuestList: document.getElementById('qb-quest-list'),
  qbFightBtn: document.getElementById('qb-fight-btn'),
  questTracker: document.getElementById('quest-tracker'),
  questTrackerList: document.getElementById('quest-tracker-list'),
  endScreen: document.getElementById('end-screen'),
  endTitle: document.getElementById('end-title'),
  endRank: document.getElementById('end-rank'),
  endStory: document.getElementById('end-story'),
  endRewards: document.getElementById('end-rewards'),
  endStats: document.getElementById('end-stats'),
  endChoices: document.getElementById('end-choices'),
  nextBtn: document.getElementById('next-btn'),
  retryBtn: document.getElementById('retry-btn'),
  ngPlusBtn: document.getElementById('ngplus-btn'),
  menuBtn: document.getElementById('menu-btn'),
  menuOverlay: document.getElementById('menu-overlay'),
  menuCloseBtn: document.getElementById('menu-close-btn'),
  loadingScreen: document.getElementById('loading-screen'),
  loadingBarFill: document.getElementById('loading-bar-fill'),
  loadingText: document.getElementById('loading-text'),
  toastWrap: document.getElementById('toast-wrap'),
};

let wasHpCritical = false;
export function applyUiTextScale(scale) {
  const uiEl = document.getElementById('ui');
  if (uiEl) uiEl.style.zoom = scale;
  const hudEl = document.getElementById('explore-hud');
  if (hudEl) hudEl.style.zoom = scale;
}
let achSortByProgress = false;
let achUnlockedOnly = false;
const TITLE_TIERS = [
  { min: 21, title: '神話の' },
  { min: 15, title: '至高の' },
  { min: 10, title: '伝説の' },
  { min: 6,  title: '熟練の' },
  { min: 3,  title: '見習い' },
];
const DIFFICULTY_DETAIL = {
  easy: '敵HP70%・被ダメ70%・獲得シャード80%',
  normal: '敵HP100%・被ダメ100%・獲得シャード100%',
  hard: '敵HP135%・被ダメ130%・獲得シャード130%',
};
function updateDifficultyDetail() {
  const el = document.getElementById('difficulty-detail');
  if (el) el.textContent = DIFFICULTY_DETAIL[state.difficulty || 'normal'] || '';
}
function playerTitle() {
  const count = (state.achievements || []).length;
  if ((state.achievements || []).includes('completionist')) return '★【完全制覇】★';
  const tier = TITLE_TIERS.find(t => count >= t.min);
  return tier ? `【${tier.title}】` : '';
}

export function updateBars() {
  const badgeEl = document.getElementById('pinned-achievement-badge');
  if (badgeEl) {
    const pinned = state.pinnedAchievement && ACHIEVEMENTS.find(a => a.id === state.pinnedAchievement);
    badgeEl.textContent = pinned ? ' 🏅' : '';
    badgeEl.title = pinned ? pinned.name : '';
  }
  const titleEl = document.getElementById('player-title');
  if (titleEl) {
    titleEl.textContent = playerTitle();
    titleEl.classList.toggle('title-completionist', (state.achievements || []).includes('completionist'));
  }
  const hpPct = Math.max(0, state.playerHP / state.playerMaxHP * 100);
  els.playerHPFill.style.width = hpPct + '%';
  els.playerHPGhost.style.width = hpPct + '%';
  const isCritical = hpPct > 0 && hpPct <= 25;
  els.playerHPFill.classList.toggle('critical', isCritical);
  if (isCritical && !wasHpCritical) { sfx.lowHp(); showCenterMsg('DANGER!', '#ff5555', 900); rumble(0.6, 400); }
  wasHpCritical = isCritical;
  const vignetteEl = document.getElementById('low-hp-vignette');
  if (vignetteEl) vignetteEl.classList.toggle('active', isCritical);
  setHeartbeatActive(isCritical && (state.playing || state.inSkirmish) && state.lowHpHeartbeat !== false);
  els.playerHPText.textContent = `${Math.max(0, Math.round(state.playerHP))}/${state.playerMaxHP}`;
  els.playerMPFill.style.width = Math.max(0, state.playerMP / state.playerMaxMP * 100) + '%';
  els.playerMPText.textContent = `${Math.max(0, Math.round(state.playerMP))}/${state.playerMaxMP}`;
  els.playerStamFill.style.width = Math.max(0, state.playerStam / state.playerMaxStam * 100) + '%';
  els.playerStamText.textContent = `${Math.max(0, Math.round(state.playerStam))}/${state.playerMaxStam}`;
  const bossHpPct = Math.max(0, state.bossHP / state.bossMaxHP * 100);
  els.bossHPFill.style.width = bossHpPct + '%';
  els.bossHPFill.classList.toggle('critical', bossHpPct > 0 && bossHpPct <= 20);
  els.bossHPText.textContent = `${Math.max(0, Math.round(state.bossHP))}/${state.bossMaxHP}（${Math.max(0, Math.round(bossHpPct))}%）`;
  const phaseMarkerEl = document.getElementById('boss-phase-marker');
  if (phaseMarkerEl) phaseMarkerEl.classList.toggle('hide', !!state.phase2);
  els.healCount.textContent = state.healUses;
  els.skillSub.textContent = state.skillCooldown > 0 ? `クールダウン ${state.skillCooldown}` : 'エーテル25';
  els.playerLv.textContent = `Lv.${state.level}`;
  els.bossName.textContent = CHAPTERS[state.chapterIndex].enemyName;

  if (state.combo > 1) {
    els.comboDisplay.style.display = 'block';
    const mult = Math.round((1 + Math.min(state.combo, 8) * 0.08) * 100);
    els.comboDisplay.textContent = `${state.combo} COMBO! (${mult}%)`;
  } else {
    els.comboDisplay.style.display = 'none';
  }
}

export function log(msg) {
  const line = document.createElement('div');
  line.className = 'log-line';
  line.textContent = msg;
  els.logWrap.prepend(line);
  while (els.logWrap.children.length > 4) els.logWrap.removeChild(els.logWrap.lastChild);
}

export async function copyImageToClipboard(dataUrl) {
  try {
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
    showToast('画像をクリップボードにコピーしました', 'info');
  } catch (err) {
    showToast('コピーに対応していない環境です', 'info');
  }
}

export async function shareImage(dataUrl) {
  if (!navigator.share) {
    showToast('この環境では共有機能に対応していません', 'info');
    return;
  }
  try {
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    const file = new File([blob], `bosusen-screenshot-${Date.now()}.png`, { type: blob.type });
    if (navigator.canShare && !navigator.canShare({ files: [file] })) {
      showToast('この環境では画像の共有に対応していません', 'info');
      return;
    }
    await navigator.share({ files: [file], title: 'Bosusen: Echoes of the Void', text: '崩壊の古城での一枚' });
  } catch (err) {
    if (err && err.name !== 'AbortError') showToast('共有に失敗しました', 'info');
  }
}
const screenshotGallery = [];
export function addScreenshotToGallery(dataUrl) {
  screenshotGallery.unshift(dataUrl);
  if (screenshotGallery.length > 5) screenshotGallery.pop();
  renderScreenshotGallery();
}
export function clearScreenshotGallery() {
  screenshotGallery.length = 0;
  renderScreenshotGallery();
}
function renderScreenshotGallery() {
  const el = document.getElementById('screenshot-gallery');
  if (!el) return;
  const labelEl = document.getElementById('screenshot-gallery-label');
  if (labelEl) labelEl.style.display = screenshotGallery.length > 0 ? 'block' : 'none';
  el.innerHTML = '';
  screenshotGallery.forEach(url => {
    const img = document.createElement('img');
    img.src = url;
    img.addEventListener('click', () => {
      const w = window.open();
      if (w) w.document.write(`<img src="${url}" style="max-width:100%;">`);
    });
    img.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      copyImageToClipboard(url);
    });
    if (navigator.share) {
      img.addEventListener('auxclick', (e) => {
        if (e.button === 1) { e.preventDefault(); shareImage(url); }
      });
    }
    img.addEventListener('dblclick', () => {
      const link = document.createElement('a');
      link.href = url;
      link.download = `bosusen-screenshot-${Date.now()}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      sfx.uiClick();
    });
    img.title = 'クリックで別タブ表示、右クリックでコピー、ダブルクリックでダウンロード' + (navigator.share ? '、中クリックで共有' : '');
    el.appendChild(img);
  });
}

export function showCenterMsg(text, color, ms = 800) {
  els.centerMsg.textContent = text;
  els.centerMsg.style.color = color || '#c99a00';
  els.centerMsg.style.display = 'block';
  clearTimeout(showCenterMsg._t);
  showCenterMsg._t = setTimeout(() => els.centerMsg.style.display = 'none', ms);
}

const toastHistory = [];
export function showToast(text, kind = 'info') {
  const el = document.createElement('div');
  el.className = `toast toast-${kind}`;
  el.textContent = text;
  els.toastWrap.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 400);
  }, 2600);
  toastHistory.unshift({ text, kind, time: Date.now() });
  if (toastHistory.length > 30) toastHistory.pop();
}
export function renderToastHistory() {
  const el = document.getElementById('toast-history-list');
  if (!el) return;
  el.innerHTML = toastHistory.length
    ? toastHistory.map(h => `<div class="log-line">${new Date(h.time).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })} ${h.text}</div>`).join('')
    : '<div class="empty-hint">まだ通知はありません</div>';
}

export function setButtonsEnabled(enabled) {
  document.querySelectorAll('.action-btn').forEach(b => {
    if (enabled) b.classList.remove('cool');
    else b.classList.add('cool');
  });
  if (enabled) {
    if (state.playerStam < 10) document.getElementById('btn-attack').classList.add('cool');
    if (state.playerStam < 30) document.getElementById('btn-heavy').classList.add('cool');
    if (state.playerMP < 25 || state.skillCooldown > 0) document.getElementById('btn-skill').classList.add('cool');
    if (state.healUses <= 0) document.getElementById('btn-heal').classList.add('cool');
  }
}

/* ============================================================
   クエストトラッカー（HUD上のミニ表示）
   ============================================================ */
export function renderQuestTracker() {
  const chapter = CHAPTERS[state.chapterIndex];
  const remaining = chapter.quests.filter(q => !isQuestDone(chapter.key, q.id));
  if (remaining.length === 0) {
    els.questTracker.style.display = 'none';
    return;
  }
  els.questTracker.style.display = 'block';
  const titleEl = document.getElementById('quest-tracker-title');
  if (titleEl) {
    titleEl.textContent = `目標 ${state.questTrackerCollapsed ? '▸' : '▾'}`;
    if (!titleEl.dataset.bound) {
      titleEl.dataset.bound = '1';
      titleEl.addEventListener('click', () => {
        state.questTrackerCollapsed = !state.questTrackerCollapsed;
        saveGame();
        renderQuestTracker();
      });
    }
  }
  els.questTrackerList.style.display = state.questTrackerCollapsed ? 'none' : 'block';
  els.questTrackerList.innerHTML = '';
  if (state.questTrackerCollapsed) return;
  remaining.forEach(q => {
    const row = document.createElement('div');
    row.className = 'quest-tracker-row';
    const typeIcon = q.type === 'battle' ? '⚔️' : (q.type === 'lore' ? '📜' : '🔍');
    row.textContent = `${typeIcon} ${q.title}`;
    els.questTrackerList.appendChild(row);
  });
}

/* ============================================================
   クエストボード画面
   ============================================================ */
export function renderQuestBoard(chapterIndex, onResolve) {
  const chapter = CHAPTERS[chapterIndex];
  els.qbChapterTag.textContent = chapter.sanctuaryLabel;
  els.qbQuestList.innerHTML = '';
  const doneCount = chapter.quests.filter(q => isQuestDone(chapter.key, q.id)).length;
  const progressFill = document.getElementById('qb-progress-fill');
  if (progressFill) progressFill.style.width = `${Math.round((doneCount / chapter.quests.length) * 100)}%`;
  const completeBadge = document.getElementById('qb-complete-badge');
  if (completeBadge) completeBadge.style.display = doneCount >= chapter.quests.length ? 'block' : 'none';
  const undoneFilterEl = document.getElementById('qb-undone-filter');
  const undoneOnly = undoneFilterEl && undoneFilterEl.checked;
  const sortRewardEl = document.getElementById('qb-sort-reward');
  const sortByReward = sortRewardEl && sortRewardEl.checked;
  const questList = sortByReward ? [...chapter.quests].sort((a, b) => b.reward.shards - a.reward.shards) : chapter.quests;
  questList.forEach(q => {
    const done = isQuestDone(chapter.key, q.id);
    if (undoneOnly && done) return;
    const card = document.createElement('div');
    card.className = 'quest-card' + (done ? ' done' : '');
    const typeLabel = q.type === 'battle' ? '討伐' : (q.type === 'lore' ? '石碑' : '採取');
    const typeIcon = q.type === 'battle' ? '⚔️' : (q.type === 'lore' ? '📜' : '🔍');
    card.innerHTML = `
      <div class="quest-card-head">
        <span class="quest-type-tag">${typeIcon} ${typeLabel}</span>
        <span class="quest-card-title">${q.title}</span>
      </div>
      <div class="quest-card-desc">${q.desc}</div>
      <div class="quest-card-reward">報酬: 結晶の欠片 x${q.reward.shards}${q.reward.itemId ? ' + ' + ITEMS[q.reward.itemId].name : ''}</div>
      <div class="quest-card-result" style="display:${done ? 'block' : 'none'}">${q.result}</div>
      <div class="quest-card-hint" style="display:${done ? 'none' : 'block'}">聖域を探索して現地で達成しよう</div>
    `;
    els.qbQuestList.appendChild(card);
  });
}

/* ============================================================
   メニュー：ステータスタブ
   ============================================================ */
export function renderStatusTab() {
  const s = computeStats();
  const title = playerTitle();
  document.getElementById('st-title').textContent = title ? title.replace(/[【】]/g, '') : 'なし';
  document.getElementById('st-level').textContent = state.level;
  document.getElementById('st-atk').textContent = s.atk;
  document.getElementById('st-def').textContent = s.def;
  document.getElementById('st-crit').textContent = `${s.crit}%`;
  document.getElementById('st-hp').textContent = s.maxHP;
  document.getElementById('st-mp').textContent = s.maxMP;
  document.getElementById('st-shards').textContent = state.shards;
  document.getElementById('st-shards-lifetime').textContent = state.totalShardsEarned || 0;
  document.getElementById('st-bosses').textContent = state.bossesDefeated || 0;
  document.getElementById('st-combo').textContent = state.lifetimeBestCombo || 0;
  document.getElementById('st-ngplus').textContent = state.newGamePlus || 0;
  document.getElementById('st-loginstreak').textContent = state.loginStreak || 0;
  document.getElementById('st-winstreak').textContent = state.bestWinStreak || 0;
  document.getElementById('st-distance').textContent = `${Math.round(state.totalDistanceTraveled || 0)}m`;
  {
    const totalSec = Math.round(state.totalPlaytimeSec || 0);
    const h = Math.floor(totalSec / 3600), m = Math.floor((totalSec % 3600) / 60);
    document.getElementById('st-playtime').textContent = h > 0 ? `${h}時間${m}分` : `${m}分`;
  }
  {
    const bestTurns = state.bestTurnsPerChapter || {};
    const allCleared = CHAPTERS.every(c => bestTurns[c.key] != null);
    const total = CHAPTERS.reduce((sum, c) => sum + (bestTurns[c.key] || 0), 0);
    document.getElementById('st-best-turns-total').textContent = allCleared ? `${total}ターン` : '-';
  }
  document.getElementById('st-quests').textContent = `${totalQuestsDone()} / ${totalQuestsAll()}`;
  document.getElementById('st-biomes').textContent = `${(state.discoveredBiomes || []).length} / 35`;
  document.getElementById('st-fireflies').textContent = state.firefliesCaught || 0;
  document.getElementById('st-butterflies').textContent = state.butterfliesCaught || 0;
  document.getElementById('st-crits').textContent = state.totalCrits || 0;
  document.getElementById('st-parries').textContent = state.totalParries || 0;
  document.getElementById('st-star-wishes').textContent = state.starWishesMade || 0;
  document.getElementById('st-screenshots').textContent = state.screenshotsTaken || 0;
  document.getElementById('st-revives').textContent = state.totalRevives || 0;
  document.getElementById('st-field-kills').textContent = state.fieldKillsTotal || 0;

  const achList = document.getElementById('achievement-list');
  if (achList) {
    achList.innerHTML = '';
    const progressRow = document.createElement('div');
    progressRow.className = 'empty-hint';
    progressRow.style.padding = '4px 4px 8px';
    progressRow.textContent = `実績達成: ${state.achievements.length} / ${ACHIEVEMENTS.length}`;
    achList.appendChild(progressRow);
    const count = state.achievements.length;
    const isCompletionist = state.achievements.includes('completionist');
    let tierHint = '';
    if (isCompletionist) tierHint = '相棒オーブ: 最高位「金」に到達済み';
    else if (count >= 20) tierHint = `相棒オーブ: 銀色（あと${ACHIEVEMENTS.length - 1 - count}個ですべて達成し金色に）`;
    else if (count >= 10) tierHint = `相棒オーブ: 銅色（あと${20 - count}個で銀色に）`;
    else tierHint = `相棒オーブ: 通常色（あと${10 - count}個で銅色に）`;
    const tierRow = document.createElement('div');
    tierRow.className = 'empty-hint';
    tierRow.style.padding = '0 4px 8px';
    tierRow.style.opacity = '0.75';
    tierRow.textContent = tierHint;
    achList.appendChild(tierRow);
    const achProgressBar = document.createElement('div');
    achProgressBar.className = 'qb-progress-bar';
    achProgressBar.style.margin = '0 0 16px';
    achProgressBar.innerHTML = `<div class="qb-progress-fill" style="width:${Math.round((state.achievements.length / ACHIEVEMENTS.length) * 100)}%"></div>`;
    achList.appendChild(achProgressBar);
    const ACH_PROGRESS = {
      boss_master: [state.bossesDefeated || 0, 4],
      boss_slayer: [state.bossesDefeated || 0, 10],
      combo_10: [state.lifetimeBestCombo || 0, 10],
      combo_20: [state.lifetimeBestCombo || 0, 20],
      combo_30: [state.lifetimeBestCombo || 0, 30],
      combo_50: [state.lifetimeBestCombo || 0, 50],
      wanderer: [Math.round(state.totalDistanceTraveled || 0), 10000],
      pilgrim: [Math.round(state.totalDistanceTraveled || 0), 50000],
      shard_rich: [state.totalShardsEarned || 0, 300],
      shard_tycoon: [state.totalShardsEarned || 0, 1000],
      week_streak: [state.loginStreak || 0, 7],
      win_streak_3: [state.winStreak || 0, 3],
      win_streak_5: [state.winStreak || 0, 5],
      biome_explorer: [(state.discoveredBiomes || []).length, 10],
      biome_master: [(state.discoveredBiomes || []).length, 35],
      firefly_catcher: [state.firefliesCaught || 0, 50],
      butterfly_catcher: [state.butterfliesCaught || 0, 50],
      firefly_master: [state.firefliesCaught || 0, 200],
      butterfly_master: [state.butterfliesCaught || 0, 200],
      crit_master: [state.totalCrits || 0, 100],
      parry_master: [state.totalParries || 0, 30],
      quest_complete: [totalQuestsDone(), totalQuestsAll()],
      veteran_hunter: [Math.max(0, ...Object.values(state.chapterClearCounts || {}), 0), 5],
      dedicated_player: [Math.round(state.totalPlaytimeSec || 0), 3600],
      true_resident: [Math.round(state.totalPlaytimeSec || 0), 18000],
      veteran_resident: [Math.round(state.totalPlaytimeSec || 0), 36000],
      bestiary_complete: [CHAPTERS.filter(c => (state.chapterClearCounts[c.key] || 0) > 0).length, CHAPTERS.length],
      star_wisher: [state.starWishesMade || 0, 20],
      star_wisher_master: [state.starWishesMade || 0, 50],
      photographer: [state.screenshotsTaken || 0, 10],
      master_photographer: [state.screenshotsTaken || 0, 50],
      golden_hour: [state.gotGoldenHourPhoto ? 1 : 0, 1],
      emote_master: [(state.emotesUsedSet || []).length, 4],
      lore_master: [(state.collectedLore || []).length, 8],
      ng_plus_5: [state.newGamePlus || 0, 5],
      revived: [state.totalRevives || 0, 1],
      field_hunter: [state.fieldKillsTotal || 0, 20],
      field_hunter_master: [state.fieldKillsTotal || 0, 75],
      comeback: [state.hadComeback ? 1 : 0, 1],
    };
    let achOrder = ACHIEVEMENTS;
    if (achSortByProgress) {
      const ratio = a => {
        if (state.achievements.includes(a.id)) return -1;
        const p = ACH_PROGRESS[a.id];
        return p ? p[0] / p[1] : 0;
      };
      achOrder = [...ACHIEVEMENTS].sort((a, b) => ratio(b) - ratio(a));
    }
    achOrder.forEach(a => {
      const unlocked = state.achievements.includes(a.id);
      if (achUnlockedOnly && !unlocked) return;
      const isPinned = state.pinnedAchievement === a.id;
      const row = document.createElement('div');
      row.className = 'item-row' + (unlocked ? ' equipped' : '');
      row.style.opacity = unlocked ? '1' : '0.45';
      if (isPinned) row.dataset.pinned = '1';
      const prog = !unlocked && ACH_PROGRESS[a.id];
      const progHtml = prog ? `<div class="qb-progress-bar" style="margin-top:4px;"><div class="qb-progress-fill" style="width:${Math.min(100, Math.round(prog[0] / prog[1] * 100))}%"></div></div><div class="item-row-desc">${Math.min(prog[0], prog[1])} / ${prog[1]}</div>` : '';
      row.innerHTML = `
        <div>
          <div class="item-row-name">${unlocked ? '🏆 ' : '🔒 '}${a.name}${isPinned ? ' 📌' : ''}</div>
          <div class="item-row-desc">${a.desc}（報酬: 欠片${a.reward || 0}）</div>
          ${progHtml}
        </div>
        ${unlocked ? `<button class="item-row-btn pin-achievement-btn">${isPinned ? '固定中' : '称号バッジに設定'}</button>` : ''}
      `;
      if (unlocked) {
        row.querySelector('.pin-achievement-btn').addEventListener('click', () => {
          state.pinnedAchievement = isPinned ? null : a.id;
          sfx.uiClick();
          renderStatusTab();
          saveGame();
        });
      }
      achList.appendChild(row);
    });
  }
}

/* ============================================================
   メニュー：装備タブ
   ============================================================ */
export function itemScore(item) {
  return (item.atk || 0) * 1.5 + (item.def || 0) * 1.5 + (item.crit || 0) * 1.2 + (item.hp || 0) * 0.3 + (item.mp || 0) * 0.2;
}

export function renderEquipmentTab() {
  const slotsEl = document.getElementById('equip-slots');
  const listEl = document.getElementById('equip-list');
  const slotNames = { weapon: '武器', armor: '防具', accessory: '装飾' };
  const autoBtn = document.getElementById('auto-equip-btn');
  if (autoBtn) {
    autoBtn.onclick = () => {
      let changed = false;
      Object.keys(slotNames).forEach(slot => {
        const candidates = state.inventory.filter(id => ITEMS[id] && ITEMS[id].slot === slot);
        if (candidates.length === 0) return;
        const best = candidates.reduce((a, b) => itemScore(ITEMS[a]) >= itemScore(ITEMS[b]) ? a : b);
        if (state.equipment[slot] !== best) { equipItem(best); changed = true; }
      });
      sfx.uiClick();
      showToast(changed ? '最強装備に切り替えました' : 'すでに最適な装備です', 'info');
      renderEquipmentTab();
      renderStatusTab();
      saveGame();
    };
  }
  if (!state.savedLoadouts) state.savedLoadouts = { a: null, b: null };
  ['a', 'b'].forEach(key => {
    const saveBtn = document.getElementById(`save-loadout-btn-${key}`);
    if (saveBtn) {
      saveBtn.onclick = () => {
        state.savedLoadouts[key] = { ...state.equipment };
        sfx.uiClick();
        showToast(`装備セット${key.toUpperCase()}を記憶しました`, 'info');
        saveGame();
      };
    }
    const loadBtn = document.getElementById(`load-loadout-btn-${key}`);
    if (loadBtn) {
      loadBtn.onclick = () => {
        const loadout = state.savedLoadouts[key];
        if (!loadout) { showToast(`セット${key.toUpperCase()}はまだ記憶されていません`, 'info'); return; }
        Object.keys(slotNames).forEach(slot => {
          const id = loadout[slot];
          if (id && state.inventory.includes(id)) equipItem(id);
          else if (!id) unequipSlot(slot);
        });
        sfx.uiClick();
        showToast(`セット${key.toUpperCase()}を呼び出しました`, 'info');
        renderEquipmentTab();
        renderStatusTab();
        saveGame();
      };
    }
  });
  slotsEl.innerHTML = '';
  Object.keys(slotNames).forEach(slot => {
    const itemId = state.equipment[slot];
    const item = itemId ? ITEMS[itemId] : null;
    const box = document.createElement('div');
    box.className = 'equip-slot-box';
    box.innerHTML = `
      <div class="equip-slot-label">${SLOT_ICON[slot] || ''} ${slotNames[slot]}</div>
      <div class="equip-slot-item">${item ? item.name : '（なし）'}</div>
      ${item ? '<button class="equip-unequip-btn">外す</button>' : ''}
    `;
    if (item) {
      box.querySelector('.equip-unequip-btn').addEventListener('click', () => {
        unequipSlot(slot);
        renderEquipmentTab();
        renderStatusTab();
        saveGame();
      });
    }
    slotsEl.appendChild(box);
  });

  listEl.innerHTML = '';
  const owned = state.inventory.filter(id => ITEMS[id]).sort((a, b) => itemScore(ITEMS[b]) - itemScore(ITEMS[a]));
  if (owned.length === 0) {
    listEl.innerHTML = '<div class="empty-hint">所持している装備はまだありません。クエストで入手しましょう。</div>';
    return;
  }
  owned.forEach(id => {
    const item = ITEMS[id];
    const equipped = state.equipment[item.slot] === id;
    const row = document.createElement('div');
    row.className = 'item-row' + (equipped ? ' equipped' : '');
    const statParts = [];
    if (item.atk) statParts.push(`攻撃+${item.atk}`);
    if (item.def) statParts.push(`防御+${item.def}`);
    if (item.crit) statParts.push(`会心+${item.crit}%`);
    if (item.hp) statParts.push(`HP+${item.hp}`);
    if (item.mp) statParts.push(`エーテル+${item.mp}`);
    let upgradeTag = '';
    if (!equipped) {
      const equippedId = state.equipment[item.slot];
      const equippedItem = equippedId ? ITEMS[equippedId] : null;
      if (!equippedItem) upgradeTag = ' <span style="color:#2e8b45;">▲装備なし</span>';
      else {
        const diff = itemScore(item) - itemScore(equippedItem);
        if (diff > 0) upgradeTag = ' <span style="color:#2e8b45;">▲強化</span>';
        else if (diff < 0) upgradeTag = ' <span style="color:#a3790a;">▼弱化</span>';
      }
    }
    row.innerHTML = `
      <div class="item-row-main">
        <div class="item-row-name">${SLOT_ICON[item.slot] || ''} ${item.name}${upgradeTag}</div>
        <div class="item-row-stats">${statParts.join(' / ')}</div>
        <div class="item-row-desc">${item.desc}</div>
      </div>
      <button class="item-row-btn">${equipped ? '装備中' : '装備する'}</button>
    `;
    const btn = row.querySelector('.item-row-btn');
    if (equipped) btn.disabled = true;
    btn.addEventListener('click', () => {
      equipItem(id);
      sfx.uiClick();
      renderEquipmentTab();
      renderStatusTab();
      saveGame();
    });
    listEl.appendChild(row);
  });
}

/* ============================================================
   メニュー：スキルタブ
   ============================================================ */
export function renderSkillsTab() {
  const treeEl = document.getElementById('skill-tree');
  treeEl.innerHTML = '';
  const remainingCost = SKILLS.filter(s => !state.unlockedSkills.includes(s.id)).reduce((sum, s) => sum + s.cost, 0);
  {
    const progressRow = document.createElement('div');
    progressRow.className = 'empty-hint';
    progressRow.style.padding = '2px 4px 8px';
    progressRow.textContent = remainingCost > 0
      ? `習得済み ${state.unlockedSkills.length} / ${SKILLS.length}（残り全習得に必要な欠片: ${remainingCost}）`
      : `習得済み ${state.unlockedSkills.length} / ${SKILLS.length}`;
    treeEl.appendChild(progressRow);
    const skillProgressBar = document.createElement('div');
    skillProgressBar.className = 'qb-progress-bar';
    skillProgressBar.style.margin = '0 0 16px';
    skillProgressBar.innerHTML = `<div class="qb-progress-fill" style="width:${Math.round((state.unlockedSkills.length / SKILLS.length) * 100)}%"></div>`;
    treeEl.appendChild(skillProgressBar);
    const affordableSkills = SKILLS.filter(s => !state.unlockedSkills.includes(s.id) && state.shards >= s.cost);
    if (affordableSkills.length > 0) {
      const bulkRow = document.createElement('div');
      bulkRow.className = 'skill-reset-row';
      bulkRow.style.margin = '0 0 16px';
      bulkRow.innerHTML = `<button class="skill-node-btn">習得可能なスキルを一括解放（${affordableSkills.length}件）</button>`;
      bulkRow.querySelector('button').addEventListener('click', () => {
        let count = 0;
        SKILLS.filter(s => !state.unlockedSkills.includes(s.id) && state.shards >= s.cost).forEach(s => {
          if (unlockSkill(s.id)) count++;
        });
        sfx.skillUnlock();
        showToast(`${count}個のスキルを一括解放しました`, 'skill');
        checkAchievements().forEach(a => { sfx.achievement(); showToast(`実績解除: ${a.name}（欠片+${a.reward || 0}）`, 'quest'); });
        renderSkillsTab();
        renderStatusTab();
        saveGame();
      });
      treeEl.appendChild(bulkRow);
    }
  }
  SKILLS.forEach(skill => {
    const unlocked = state.unlockedSkills.includes(skill.id);
    const canAfford = state.shards >= skill.cost;
    const node = document.createElement('div');
    node.className = 'skill-node' + (unlocked ? ' unlocked' : '');
    node.innerHTML = `
      <div class="skill-node-head">
        <span class="skill-node-name">${skill.name}</span>
        <span class="skill-node-cost">${unlocked ? '習得済み' : `${skill.cost} 欠片`}</span>
      </div>
      <div class="skill-node-desc">${skill.desc}</div>
      ${unlocked ? '' : `<button class="skill-node-btn" ${canAfford ? '' : 'disabled'}>解放する</button>`}
    `;
    if (!unlocked) {
      node.querySelector('.skill-node-btn').addEventListener('click', () => {
        if (unlockSkill(skill.id)) {
          sfx.skillUnlock();
          showToast(`スキル解放: ${skill.name}`, 'skill');
          checkAchievements().forEach(a => { sfx.achievement(); showToast(`実績解除: ${a.name}（欠片+${a.reward || 0}）`, 'quest'); });
          renderSkillsTab();
          renderStatusTab();
          saveGame();
        }
      });
    }
    treeEl.appendChild(node);
  });

  if (state.unlockedSkills.length > 0) {
    const resetRow = document.createElement('div');
    resetRow.className = 'skill-reset-row';
    resetRow.innerHTML = `<button class="skill-reset-btn">習得スキルをリセットして欠片を返却</button>`;
    resetRow.querySelector('.skill-reset-btn').addEventListener('click', () => {
      if (!window.confirm('習得したスキルをすべてリセットし、消費した結晶の欠片を返却します。よろしいですか？')) return;
      const refund = resetSkills();
      sfx.uiClick();
      showToast(`スキルをリセットしました（結晶の欠片 +${refund}）`, 'info');
      renderSkillsTab();
      renderStatusTab();
      saveGame();
    });
    treeEl.appendChild(resetRow);
  }
}

/* ============================================================
   メニュー：所持品タブ
   ============================================================ */
export function renderItemsTab() {
  const listEl = document.getElementById('item-list');
  listEl.innerHTML = '';
  const totalItems = Object.keys(ITEMS).length;
  const progressRow = document.createElement('div');
  progressRow.className = 'empty-hint';
  progressRow.style.padding = '2px 4px 12px';
  progressRow.textContent = `所持: ${state.inventory.length} / ${totalItems}`;
  listEl.appendChild(progressRow);
  if (state.inventory.length === 0) {
    listEl.innerHTML += '<div class="empty-hint">所持品はまだありません。</div>';
    return;
  }
  const slotOrder = { weapon: 0, armor: 1, accessory: 2 };
  const slotLabel = { weapon: '武器', armor: '防具', accessory: '装飾' };
  const sorted = [...state.inventory].filter(id => ITEMS[id]).sort((a, b) => {
    const sa = slotOrder[ITEMS[a].slot], sb = slotOrder[ITEMS[b].slot];
    return sa !== sb ? sa - sb : ITEMS[a].name.localeCompare(ITEMS[b].name, 'ja');
  });
  sorted.forEach(id => {
    const item = ITEMS[id];
    const equipped = state.equipment[item.slot] === id;
    const row = document.createElement('div');
    row.className = 'item-row' + (equipped ? ' equipped' : '');
    row.innerHTML = `
      <div class="item-row-main">
        <div class="item-row-name">${SLOT_ICON[item.slot] || ''} ${item.name}<span class="item-slot-tag">${slotLabel[item.slot]}${equipped ? ' ・装備中' : ''}</span></div>
        <div class="item-row-desc">${item.desc}</div>
      </div>
      <button class="item-row-btn" ${equipped ? 'disabled' : ''}>${equipped ? '装備中' : '装備する'}</button>
    `;
    row.querySelector('.item-row-btn').addEventListener('click', () => {
      if (equipped) return;
      equipItem(id);
      sfx.uiClick();
      renderItemsTab();
      renderStatusTab();
      saveGame();
    });
    listEl.appendChild(row);
  });
}

export function renderCompendiumTab() {
  const listEl = document.getElementById('biome-compendium-list');
  const progressEl = document.getElementById('compendium-progress');
  if (!listEl) return;
  const discovered = state.discoveredBiomes || [];
  if (progressEl) progressEl.textContent = `${discovered.length} / ${BIOME_NAMES.length}`;
  listEl.innerHTML = '';
  const CATEGORY_LABEL = {
    forest: '大自然', desert: '砂漠', cyber: 'サイバー都市', snow: '雪原',
    swamp: '沼地', volcanic: '溶岩地帯', crystal: '結晶', wasteland: '荒野',
  };
  const byCategory = {};
  BIOME_ENTRIES.forEach(e => { (byCategory[e.category] = byCategory[e.category] || []).push(e); });
  Object.keys(byCategory).forEach(cat => {
    const entries = byCategory[cat];
    const foundCount = entries.filter(e => discovered.includes(e.name)).length;
    const header = document.createElement('div');
    header.className = 'empty-hint';
    header.style.padding = '10px 4px 4px';
    header.textContent = `${BIOME_CATEGORY_ICON[cat] || ''} ${CATEGORY_LABEL[cat] || cat}（${foundCount}/${entries.length}）`;
    listEl.appendChild(header);
    entries.forEach(({ name, category }) => {
      const found = discovered.includes(name);
      const icon = BIOME_CATEGORY_ICON[category] || '❓';
      const row = document.createElement('div');
      row.className = 'item-row' + (found ? ' equipped' : '');
      const foundAt = found && (state.biomeDiscoveredAt || {})[name];
      const dateStr = foundAt ? new Date(foundAt).toLocaleDateString('ja-JP') : '';
      row.innerHTML = `
        <div class="item-row-main">
          <div class="item-row-name">${found ? `${icon} ${name}` : '？？？'}</div>
          ${found ? `<div class="item-row-desc">発見日: ${dateStr}</div>` : ''}
        </div>
      `;
      listEl.appendChild(row);
    });
  });
  const bestiaryList = document.getElementById('bestiary-list');
  const bestiaryProgress = document.getElementById('bestiary-progress');
  if (bestiaryList) {
    bestiaryList.innerHTML = '';
    const clearCounts = state.chapterClearCounts || {};
    const clearedCount = CHAPTERS.filter(c => (clearCounts[c.key] || 0) > 0).length;
    if (bestiaryProgress) bestiaryProgress.textContent = `${clearedCount} / ${CHAPTERS.length}`;
    CHAPTERS.forEach(c => {
      const count = clearCounts[c.key] || 0;
      const found = count > 0;
      const firstAt = (state.firstDefeatedAt || {})[c.key];
      const dateStr = firstAt ? new Date(firstAt).toLocaleDateString('ja-JP') : '';
      const bestTurns = (state.bestTurnsPerChapter || {})[c.key];
      const row = document.createElement('div');
      row.className = 'item-row' + (found ? ' equipped' : '');
      row.innerHTML = `
        <div class="item-row-main">
          <div class="item-row-name">${found ? c.enemyName : '？？？'}</div>
          <div class="item-row-desc">${found ? `撃破回数: ${count}｜初撃破: ${dateStr}${bestTurns ? `｜最速: ${bestTurns}ターン` : ''}` : '未撃破'}</div>
          ${found && c.battleTip ? `<div class="item-row-desc">💡 ${c.battleTip}</div>` : ''}
        </div>
      `;
      bestiaryList.appendChild(row);
    });
  }
  const loreList = document.getElementById('lore-list');
  const loreProgress = document.getElementById('lore-progress');
  if (loreList) {
    loreList.innerHTML = '';
    const lore = state.collectedLore || [];
    if (loreProgress) loreProgress.textContent = `${lore.length}`;
    if (lore.length === 0) {
      loreList.innerHTML = '<div class="empty-hint">まだ伝承の石碑を発見していません。</div>';
    } else {
      lore.forEach(entry => {
        const row = document.createElement('div');
        row.className = 'item-row equipped';
        const dateStr = entry.foundAt ? new Date(entry.foundAt).toLocaleDateString('ja-JP') : '';
        row.innerHTML = `
          <div class="item-row-main">
            <div class="item-row-name">${entry.title}</div>
            <div class="item-row-desc">${entry.text}</div>
            ${dateStr ? `<div class="item-row-desc">発見日: ${dateStr}</div>` : ''}
          </div>
        `;
        loreList.appendChild(row);
      });
    }
  }
}

/* ============================================================
   メニュー全体（タブ切り替え・開閉）
   ============================================================ */
export function refreshAllMenuTabs() {
  renderStatusTab();
  renderEquipmentTab();
  renderSkillsTab();
  renderItemsTab();
  renderCompendiumTab();
}

export function syncSettingsUI() {
  renderScreenshotGallery();
  const volumeSlider = document.getElementById('opt-volume');
  if (volumeSlider) volumeSlider.value = Math.round(state.masterVolume * 100);
  const qualitySelect = document.getElementById('opt-quality');
  if (qualitySelect) qualitySelect.value = state.quality || 'high';
  const shakeCheckbox = document.getElementById('opt-shake');
  if (shakeCheckbox) shakeCheckbox.checked = state.screenShake !== false;
  const autoQualityCheckbox = document.getElementById('opt-auto-quality');
  if (autoQualityCheckbox) autoQualityCheckbox.checked = state.autoQualityAdjust !== false;
  const difficultySelect = document.getElementById('opt-difficulty');
  if (difficultySelect) difficultySelect.value = state.difficulty || 'normal';
  updateDifficultyDetail();
  const objectiveHintCheckbox = document.getElementById('opt-objective-hint');
  if (objectiveHintCheckbox) objectiveHintCheckbox.checked = state.showObjectiveHint !== false;
  const bossTauntsCheckbox = document.getElementById('opt-boss-taunts');
  if (bossTauntsCheckbox) bossTauntsCheckbox.checked = state.showBossTaunts !== false;
  const guideBeamsCheckbox = document.getElementById('opt-guide-beams');
  if (guideBeamsCheckbox) guideBeamsCheckbox.checked = state.showGuideBeams !== false;
  const rumbleCheckbox = document.getElementById('opt-gamepad-rumble');
  if (rumbleCheckbox) rumbleCheckbox.checked = state.gamepadRumble !== false;
  const heartbeatCheckbox = document.getElementById('opt-low-hp-heartbeat');
  if (heartbeatCheckbox) heartbeatCheckbox.checked = state.lowHpHeartbeat !== false;
  const flashingCheckbox = document.getElementById('opt-reduce-flashing');
  if (flashingCheckbox) flashingCheckbox.checked = state.reduceFlashing === true;
  const invertYCheckbox = document.getElementById('opt-invert-camera-y');
  if (invertYCheckbox) invertYCheckbox.checked = state.invertCameraY === true;
  const highContrastCheckbox = document.getElementById('opt-high-contrast');
  if (highContrastCheckbox) highContrastCheckbox.checked = state.highContrast === true;
  document.body.classList.toggle('high-contrast', state.highContrast === true);
  const reduceChatterCheckbox = document.getElementById('opt-reduce-chatter');
  if (reduceChatterCheckbox) reduceChatterCheckbox.checked = state.reduceNpcChatter === true;
  const footstepSoundsCheckbox = document.getElementById('opt-footstep-sounds');
  if (footstepSoundsCheckbox) footstepSoundsCheckbox.checked = state.footstepSounds !== false;
  const companionNameInput = document.getElementById('opt-companion-name');
  if (companionNameInput) companionNameInput.value = state.companionName || 'イリス';
  const proximitySoundsCheckbox = document.getElementById('opt-proximity-sounds');
  if (proximitySoundsCheckbox) proximitySoundsCheckbox.checked = state.proximitySounds !== false;
  const watermarkCheckbox = document.getElementById('opt-screenshot-watermark');
  if (watermarkCheckbox) watermarkCheckbox.checked = state.screenshotWatermark !== false;
  const cinematicCheckbox = document.getElementById('opt-cinematic-hide');
  if (cinematicCheckbox) cinematicCheckbox.checked = state.cinematicAutoHide === true;
  const sensSlider = document.getElementById('opt-camera-sensitivity');
  if (sensSlider) sensSlider.value = Math.round((state.cameraSensitivity || 1) * 100);
  const sensValLabel = document.getElementById('opt-camera-sensitivity-val');
  if (sensValLabel) sensValLabel.textContent = `${Math.round((state.cameraSensitivity || 1) * 100)}%`;
  const rumbleStrengthSlider = document.getElementById('opt-rumble-strength');
  if (rumbleStrengthSlider) rumbleStrengthSlider.value = Math.round((state.rumbleStrength != null ? state.rumbleStrength : 1) * 100);
  const rumbleStrengthVal = document.getElementById('opt-rumble-strength-val');
  if (rumbleStrengthVal) rumbleStrengthVal.textContent = `${Math.round((state.rumbleStrength != null ? state.rumbleStrength : 1) * 100)}%`;
  const textScaleSelect = document.getElementById('opt-text-scale');
  if (textScaleSelect) textScaleSelect.value = state.uiTextScale || 1;
  applyUiTextScale(state.uiTextScale || 1);
}

export function initMenu(onSave, onTitle) {
  const tabs = document.querySelectorAll('.menu-tab');
  const pages = document.querySelectorAll('.menu-page');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      pages.forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(`page-${tab.dataset.tab}`).classList.add('active');
      sfx.uiClick();
    });
  });

  const toastHistoryToggleBtn = document.getElementById('toast-history-toggle-btn');
  const toastHistoryList = document.getElementById('toast-history-list');
  if (toastHistoryToggleBtn && toastHistoryList) {
    toastHistoryToggleBtn.addEventListener('click', () => {
      const show = toastHistoryList.style.display === 'none';
      toastHistoryList.style.display = show ? 'block' : 'none';
      toastHistoryToggleBtn.textContent = show ? '直近の通知を隠す' : '直近の通知を表示';
      if (show) renderToastHistory();
      sfx.uiClick();
    });
  }

  const clearGalleryBtn = document.getElementById('clear-gallery-btn');
  if (clearGalleryBtn) {
    clearGalleryBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!window.confirm('保存中の写真ギャラリーをすべて消去します。よろしいですか？')) return;
      clearScreenshotGallery();
      sfx.uiClick();
      showToast('ギャラリーを消去しました', 'info');
    });
  }

  const achSortBtn = document.getElementById('ach-sort-btn');
  if (achSortBtn) {
    achSortBtn.addEventListener('click', () => {
      achSortByProgress = !achSortByProgress;
      achSortBtn.textContent = achSortByProgress ? 'デフォルト順で表示' : '未達成を進捗順で表示';
      sfx.uiClick();
      renderStatusTab();
    });
  }
  const achUnlockedOnlyBtn = document.getElementById('ach-unlocked-only-btn');
  if (achUnlockedOnlyBtn) {
    achUnlockedOnlyBtn.addEventListener('click', () => {
      achUnlockedOnly = !achUnlockedOnly;
      achUnlockedOnlyBtn.textContent = achUnlockedOnly ? 'すべて表示' : '達成済みのみ表示';
      sfx.uiClick();
      renderStatusTab();
    });
  }

  els.menuBtn.addEventListener('click', () => openMenu());
  els.menuCloseBtn.addEventListener('click', () => closeMenu());
  document.getElementById('menu-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'menu-overlay') closeMenu();
  });

  const volumeSlider = document.getElementById('opt-volume');
  volumeSlider.value = Math.round(state.masterVolume * 100);
  volumeSlider.addEventListener('input', () => {
    state.masterVolume = volumeSlider.value / 100;
    setMasterVolume(state.masterVolume);
  });
  volumeSlider.addEventListener('change', () => { saveGame(); sfx.uiClick(); });

  const shakeCheckbox = document.getElementById('opt-shake');
  shakeCheckbox.checked = state.screenShake !== false;
  shakeCheckbox.addEventListener('change', () => {
    state.screenShake = shakeCheckbox.checked;
    sfx.uiClick();
    saveGame();
  });

  const autoQualityCheckbox = document.getElementById('opt-auto-quality');
  autoQualityCheckbox.checked = state.autoQualityAdjust !== false;
  autoQualityCheckbox.addEventListener('change', () => {
    state.autoQualityAdjust = autoQualityCheckbox.checked;
    sfx.uiClick();
    saveGame();
  });

  const objectiveHintCheckbox = document.getElementById('opt-objective-hint');
  objectiveHintCheckbox.checked = state.showObjectiveHint !== false;
  objectiveHintCheckbox.addEventListener('change', () => {
    state.showObjectiveHint = objectiveHintCheckbox.checked;
    sfx.uiClick();
    saveGame();
  });

  const bossTauntsCheckbox = document.getElementById('opt-boss-taunts');
  bossTauntsCheckbox.checked = state.showBossTaunts !== false;
  bossTauntsCheckbox.addEventListener('change', () => {
    state.showBossTaunts = bossTauntsCheckbox.checked;
    sfx.uiClick();
    saveGame();
  });

  const guideBeamsCheckbox = document.getElementById('opt-guide-beams');
  guideBeamsCheckbox.checked = state.showGuideBeams !== false;
  guideBeamsCheckbox.addEventListener('change', () => {
    state.showGuideBeams = guideBeamsCheckbox.checked;
    sfx.uiClick();
    saveGame();
  });

  const rumbleCheckbox = document.getElementById('opt-gamepad-rumble');
  rumbleCheckbox.checked = state.gamepadRumble !== false;
  rumbleCheckbox.addEventListener('change', () => {
    state.gamepadRumble = rumbleCheckbox.checked;
    sfx.uiClick();
    saveGame();
  });

  const heartbeatCheckbox = document.getElementById('opt-low-hp-heartbeat');
  heartbeatCheckbox.checked = state.lowHpHeartbeat !== false;
  heartbeatCheckbox.addEventListener('change', () => {
    state.lowHpHeartbeat = heartbeatCheckbox.checked;
    if (!state.lowHpHeartbeat) setHeartbeatActive(false);
    sfx.uiClick();
    saveGame();
  });

  const heartbeatTestBtn = document.getElementById('heartbeat-test-btn');
  if (heartbeatTestBtn) {
    heartbeatTestBtn.addEventListener('click', (e) => {
      e.preventDefault();
      if (state.lowHpHeartbeat === false) { showToast('「HP危険時の心拍音」が無効なため再生されません', 'info'); return; }
      setHeartbeatActive(true);
      setTimeout(() => setHeartbeatActive(false), 2700);
    });
  }

  const flashingCheckbox = document.getElementById('opt-reduce-flashing');
  flashingCheckbox.checked = state.reduceFlashing === true;
  flashingCheckbox.addEventListener('change', () => {
    state.reduceFlashing = flashingCheckbox.checked;
    sfx.uiClick();
    saveGame();
  });

  const invertYCheckbox = document.getElementById('opt-invert-camera-y');
  invertYCheckbox.checked = state.invertCameraY === true;
  invertYCheckbox.addEventListener('change', () => {
    state.invertCameraY = invertYCheckbox.checked;
    sfx.uiClick();
    saveGame();
  });

  const highContrastCheckbox = document.getElementById('opt-high-contrast');
  highContrastCheckbox.checked = state.highContrast === true;
  document.body.classList.toggle('high-contrast', state.highContrast === true);
  highContrastCheckbox.addEventListener('change', () => {
    state.highContrast = highContrastCheckbox.checked;
    document.body.classList.toggle('high-contrast', state.highContrast);
    sfx.uiClick();
    saveGame();
  });

  const reduceChatterCheckbox = document.getElementById('opt-reduce-chatter');
  reduceChatterCheckbox.checked = state.reduceNpcChatter === true;
  reduceChatterCheckbox.addEventListener('change', () => {
    state.reduceNpcChatter = reduceChatterCheckbox.checked;
    sfx.uiClick();
    saveGame();
  });

  const footstepSoundsCheckbox = document.getElementById('opt-footstep-sounds');
  footstepSoundsCheckbox.checked = state.footstepSounds !== false;
  footstepSoundsCheckbox.addEventListener('change', () => {
    state.footstepSounds = footstepSoundsCheckbox.checked;
    sfx.uiClick();
    saveGame();
  });

  const companionNameInput = document.getElementById('opt-companion-name');
  companionNameInput.value = state.companionName || 'イリス';
  companionNameInput.addEventListener('change', () => {
    state.companionName = companionNameInput.value.trim() || 'イリス';
    companionNameInput.value = state.companionName;
    sfx.uiClick();
    saveGame();
  });

  const proximitySoundsCheckbox = document.getElementById('opt-proximity-sounds');
  proximitySoundsCheckbox.checked = state.proximitySounds !== false;
  proximitySoundsCheckbox.addEventListener('change', () => {
    state.proximitySounds = proximitySoundsCheckbox.checked;
    sfx.uiClick();
    saveGame();
  });

  const watermarkCheckbox = document.getElementById('opt-screenshot-watermark');
  watermarkCheckbox.checked = state.screenshotWatermark !== false;
  watermarkCheckbox.addEventListener('change', () => {
    state.screenshotWatermark = watermarkCheckbox.checked;
    sfx.uiClick();
    saveGame();
  });

  const cinematicCheckbox = document.getElementById('opt-cinematic-hide');
  cinematicCheckbox.checked = state.cinematicAutoHide === true;
  cinematicCheckbox.addEventListener('change', () => {
    state.cinematicAutoHide = cinematicCheckbox.checked;
    if (!state.cinematicAutoHide) {
      const hudEl = document.getElementById('explore-hud');
      if (hudEl) hudEl.classList.remove('cinematic-fade');
    }
    sfx.uiClick();
    saveGame();
  });

  const sensSlider = document.getElementById('opt-camera-sensitivity');
  sensSlider.value = Math.round((state.cameraSensitivity || 1) * 100);
  sensSlider.addEventListener('input', () => {
    state.cameraSensitivity = sensSlider.value / 100;
    const label = document.getElementById('opt-camera-sensitivity-val');
    if (label) label.textContent = `${sensSlider.value}%`;
  });
  sensSlider.addEventListener('change', () => saveGame());

  const rumbleStrengthSlider = document.getElementById('opt-rumble-strength');
  rumbleStrengthSlider.value = Math.round((state.rumbleStrength != null ? state.rumbleStrength : 1) * 100);
  rumbleStrengthSlider.addEventListener('input', () => {
    state.rumbleStrength = rumbleStrengthSlider.value / 100;
    const label = document.getElementById('opt-rumble-strength-val');
    if (label) label.textContent = `${rumbleStrengthSlider.value}%`;
  });
  rumbleStrengthSlider.addEventListener('change', () => saveGame());

  const textScaleSelect = document.getElementById('opt-text-scale');
  textScaleSelect.value = state.uiTextScale || 1;
  applyUiTextScale(state.uiTextScale || 1);
  textScaleSelect.addEventListener('change', () => {
    state.uiTextScale = parseFloat(textScaleSelect.value);
    applyUiTextScale(state.uiTextScale);
    sfx.uiClick();
    saveGame();
  });

  const difficultySelect = document.getElementById('opt-difficulty');
  difficultySelect.value = state.difficulty || 'normal';
  difficultySelect.addEventListener('change', () => {
    state.difficulty = difficultySelect.value;
    sfx.uiClick();
    showToast(`難易度を「${{easy:'簡単',normal:'普通',hard:'難しい'}[state.difficulty]}」に変更しました`, 'info');
    updateDifficultyDetail();
    saveGame();
  });

  const qualitySelect = document.getElementById('opt-quality');
  qualitySelect.value = state.quality || 'high';
  qualitySelect.addEventListener('change', () => {
    state.quality = qualitySelect.value;
    setQualityPreset(state.quality);
    sfx.uiClick();
    saveGame();
  });

  document.getElementById('save-btn').addEventListener('click', () => {
    saveGame();
    showToast('セーブしました', 'info');
    sfx.uiClick();
    if (onSave) onSave();
  });
  document.getElementById('reset-settings-btn').addEventListener('click', () => {
    Object.assign(state, {
      masterVolume: 0.7, quality: 'high', screenShake: true, difficulty: 'normal', showObjectiveHint: true, showBossTaunts: true, showGuideBeams: true, gamepadRumble: true, lowHpHeartbeat: true, reduceFlashing: false, uiTextScale: 1, invertCameraY: false, cameraSensitivity: 1, highContrast: false, reduceNpcChatter: false, proximitySounds: true, screenshotWatermark: true, cinematicAutoHide: false, footstepSounds: true, rumbleStrength: 1, autoQualityAdjust: true,
    });
    setMasterVolume(state.masterVolume);
    setQualityPreset(state.quality);
    syncSettingsUI();
    sfx.uiClick();
    showToast('設定を初期値に戻しました', 'info');
    saveGame();
  });
  document.getElementById('title-btn').addEventListener('click', () => {
    closeMenu();
    if (onTitle) onTitle();
  });
  document.getElementById('delete-save-btn').addEventListener('click', () => {
    if (!hasSaveGame()) { showToast('セーブデータはありません', 'info'); return; }
    if (!window.confirm('セーブデータを削除します。よろしいですか？（この操作は取り消せません）')) return;
    clearSave();
    els.continueBtn.style.display = 'none';
    showToast('セーブデータを削除しました', 'info');
    sfx.menuClose();
    closeMenu();
    if (onTitle) onTitle();
  });
  document.getElementById('replay-tutorial-btn').addEventListener('click', () => {
    state.seenExploreTutorial = false;
    state.seenBattleTutorial = false;
    sfx.uiClick();
    showToast('次に探索・戦闘を始めるとチュートリアルが表示されます', 'info');
    saveGame();
  });
  document.getElementById('export-save-btn').addEventListener('click', () => {
    const raw = exportSaveData();
    if (!raw) { showToast('セーブデータはありません', 'info'); return; }
    const blob = new Blob([raw], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `bosusen-save-${Date.now()}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    sfx.uiClick();
    showToast('セーブデータをエクスポートしました', 'info');
  });
  document.getElementById('import-save-btn').addEventListener('click', () => {
    document.getElementById('import-save-input').click();
  });
  document.getElementById('import-save-input').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!window.confirm('現在の進行状況はこのファイルの内容で上書きされます。よろしいですか？')) {
      e.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (importSaveData(reader.result)) {
        showToast('セーブデータをインポートしました。ページを再読み込みします', 'quest');
        sfx.achievement();
        setTimeout(() => window.location.reload(), 1200);
      } else {
        showToast('インポートに失敗しました。ファイル形式を確認してください', 'info');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && els.menuOverlay.classList.contains('open')) closeMenu();
  });
}

let menuPausedPlaying = false;
export function openMenu() {
  const hudEl = document.getElementById('explore-hud');
  if (hudEl) hudEl.classList.remove('cinematic-fade');
  refreshAllMenuTabs();
  els.menuOverlay.classList.add('open');
  sfx.menuOpen();
  menuPausedPlaying = state.playing;
  state.playing = false;
  setMapOpen(true);
}
export function closeMenu() {
  els.menuOverlay.classList.remove('open');
  sfx.menuClose();
  state.playing = menuPausedPlaying;
  setMapOpen(false);
}

/* ============================================================
   ローディング画面
   ============================================================ */
const LOADING_TIPS = [
  'Tキーで最も近い未発見の秘宝の方角がわかる。',
  'Eキーでダッシュ、Spaceで2段ジャンプできる。',
  'ジャストガードのタイミングでパリィすれば反撃のチャンス。',
  'Bキーでミニマップの表示範囲を切り替えられる。',
  'Mキーで大陸図を開き、クリックでファストトラベルできる。',
  '拠点にはショップや鍛冶屋があり装備を強化できる。',
  '夜になると出現する野生生物や現象もある。',
  'ゲームパッドも対応しているので接続すればそのまま遊べる。',
  '図鑑タブで発見したバイオームや撃破したボスを確認できる。',
  'Nキーで拠点へ即座に帰還できる。',
  'Lキーで記憶した装備セットA/Bを切り替えられる。',
  'Kキーでミュートを切り替えられる。',
  'F3キーでFPSや座標のデバッグ情報を表示できる。',
  '装備タブで自分だけの装備セットを2つまで記憶できる。',
];
let loadingTipTimer = null;
export function setLoadingProgress(pct, text) {
  els.loadingBarFill.style.width = `${Math.round(pct * 100)}%`;
  if (text) els.loadingText.textContent = text;
  const tipEl = document.getElementById('loading-tip');
  if (tipEl && !loadingTipTimer) {
    const showRandomTip = () => {
      tipEl.textContent = `ヒント: ${LOADING_TIPS[Math.floor(Math.random() * LOADING_TIPS.length)]}`;
    };
    showRandomTip();
    loadingTipTimer = setInterval(showRandomTip, 4000);
  }
}
export function hideLoadingScreen() {
  els.loadingScreen.classList.add('hidden');
  if (loadingTipTimer) { clearInterval(loadingTipTimer); loadingTipTimer = null; }
  setTimeout(() => { els.loadingScreen.style.display = 'none'; }, 600);
}

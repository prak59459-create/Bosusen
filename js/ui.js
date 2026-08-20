import { CHAPTERS, ITEMS, SKILLS } from './data.js';
import { state, computeStats, isQuestDone, completeQuest, addShards, addItem, ownsItem,
  equipItem, unequipSlot, unlockSkill, saveGame } from './state.js';
import { sfx, setMasterVolume } from './audio.js';
import { setQualityPreset } from './scene.js';

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
  menuBtn: document.getElementById('menu-btn'),
  menuOverlay: document.getElementById('menu-overlay'),
  menuCloseBtn: document.getElementById('menu-close-btn'),
  loadingScreen: document.getElementById('loading-screen'),
  loadingBarFill: document.getElementById('loading-bar-fill'),
  loadingText: document.getElementById('loading-text'),
  toastWrap: document.getElementById('toast-wrap'),
};

export function updateBars() {
  const hpPct = Math.max(0, state.playerHP / state.playerMaxHP * 100);
  els.playerHPFill.style.width = hpPct + '%';
  els.playerHPGhost.style.width = hpPct + '%';
  els.playerHPText.textContent = `${Math.max(0, Math.round(state.playerHP))}/${state.playerMaxHP}`;
  els.playerMPFill.style.width = Math.max(0, state.playerMP / state.playerMaxMP * 100) + '%';
  els.playerMPText.textContent = `${Math.max(0, Math.round(state.playerMP))}/${state.playerMaxMP}`;
  els.playerStamFill.style.width = Math.max(0, state.playerStam / state.playerMaxStam * 100) + '%';
  els.playerStamText.textContent = `${Math.max(0, Math.round(state.playerStam))}/${state.playerMaxStam}`;
  els.bossHPFill.style.width = Math.max(0, state.bossHP / state.bossMaxHP * 100) + '%';
  els.bossHPText.textContent = `${Math.max(0, Math.round(state.bossHP))}/${state.bossMaxHP}`;
  els.healCount.textContent = state.healUses;
  els.skillSub.textContent = state.skillCooldown > 0 ? `クールダウン ${state.skillCooldown}` : 'エーテル25';
  els.playerLv.textContent = `Lv.${state.level}`;
  els.bossName.textContent = CHAPTERS[state.chapterIndex].enemyName;

  if (state.combo > 1) {
    els.comboDisplay.style.display = 'block';
    els.comboDisplay.textContent = `${state.combo} COMBO!`;
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

export function showCenterMsg(text, color, ms = 800) {
  els.centerMsg.textContent = text;
  els.centerMsg.style.color = color || '#c99a00';
  els.centerMsg.style.display = 'block';
  clearTimeout(showCenterMsg._t);
  showCenterMsg._t = setTimeout(() => els.centerMsg.style.display = 'none', ms);
}

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
  els.questTrackerList.innerHTML = '';
  remaining.forEach(q => {
    const row = document.createElement('div');
    row.className = 'quest-tracker-row';
    row.textContent = `・${q.title}`;
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
  chapter.quests.forEach(q => {
    const done = isQuestDone(chapter.key, q.id);
    const card = document.createElement('div');
    card.className = 'quest-card' + (done ? ' done' : '');
    const typeLabel = q.type === 'battle' ? '討伐' : (q.type === 'lore' ? '探索' : '探索');
    card.innerHTML = `
      <div class="quest-card-head">
        <span class="quest-type-tag">${typeLabel}</span>
        <span class="quest-card-title">${q.title}</span>
      </div>
      <div class="quest-card-desc">${q.desc}</div>
      <div class="quest-card-reward">報酬: 結晶の欠片 x${q.reward.shards}${q.reward.itemId ? ' + ' + ITEMS[q.reward.itemId].name : ''}</div>
      <div class="quest-card-result" style="display:${done ? 'block' : 'none'}">${q.result}</div>
      <button class="quest-card-btn" ${done ? 'disabled' : ''}>${done ? '達成済み' : '着手する'}</button>
    `;
    const btn = card.querySelector('.quest-card-btn');
    btn.addEventListener('click', () => {
      if (isQuestDone(chapter.key, q.id)) return;
      completeQuest(chapter.key, q.id);
      addShards(q.reward.shards);
      if (q.reward.itemId) addItem(q.reward.itemId);
      sfx.questDone();
      showToast(`クエスト達成: ${q.title}（結晶の欠片 +${q.reward.shards}）`, 'quest');
      renderQuestBoard(chapterIndex, onResolve);
      if (onResolve) onResolve();
    });
    els.qbQuestList.appendChild(card);
  });
}

/* ============================================================
   メニュー：ステータスタブ
   ============================================================ */
export function renderStatusTab() {
  const s = computeStats();
  document.getElementById('st-level').textContent = state.level;
  document.getElementById('st-atk').textContent = s.atk;
  document.getElementById('st-def').textContent = s.def;
  document.getElementById('st-crit').textContent = `${s.crit}%`;
  document.getElementById('st-hp').textContent = s.maxHP;
  document.getElementById('st-mp').textContent = s.maxMP;
  document.getElementById('st-shards').textContent = state.shards;
}

/* ============================================================
   メニュー：装備タブ
   ============================================================ */
export function renderEquipmentTab() {
  const slotsEl = document.getElementById('equip-slots');
  const listEl = document.getElementById('equip-list');
  const slotNames = { weapon: '武器', armor: '防具', accessory: '装飾' };
  slotsEl.innerHTML = '';
  Object.keys(slotNames).forEach(slot => {
    const itemId = state.equipment[slot];
    const item = itemId ? ITEMS[itemId] : null;
    const box = document.createElement('div');
    box.className = 'equip-slot-box';
    box.innerHTML = `
      <div class="equip-slot-label">${slotNames[slot]}</div>
      <div class="equip-slot-item">${item ? item.name : '（なし）'}</div>
      ${item ? '<button class="equip-unequip-btn">外す</button>' : ''}
    `;
    if (item) {
      box.querySelector('.equip-unequip-btn').addEventListener('click', () => {
        unequipSlot(slot);
        renderEquipmentTab();
        renderStatusTab();
      });
    }
    slotsEl.appendChild(box);
  });

  listEl.innerHTML = '';
  const owned = state.inventory.filter(id => ITEMS[id]);
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
    row.innerHTML = `
      <div class="item-row-main">
        <div class="item-row-name">${item.name}</div>
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
          renderSkillsTab();
          renderStatusTab();
        }
      });
    }
    treeEl.appendChild(node);
  });
}

/* ============================================================
   メニュー：所持品タブ
   ============================================================ */
export function renderItemsTab() {
  const listEl = document.getElementById('item-list');
  listEl.innerHTML = '';
  if (state.inventory.length === 0) {
    listEl.innerHTML = '<div class="empty-hint">所持品はまだありません。</div>';
    return;
  }
  state.inventory.forEach(id => {
    const item = ITEMS[id];
    if (!item) return;
    const row = document.createElement('div');
    row.className = 'item-row';
    row.innerHTML = `
      <div class="item-row-main">
        <div class="item-row-name">${item.name}<span class="item-slot-tag">${item.slot === 'weapon' ? '武器' : item.slot === 'armor' ? '防具' : '装飾'}</span></div>
        <div class="item-row-desc">${item.desc}</div>
      </div>
    `;
    listEl.appendChild(row);
  });
}

/* ============================================================
   メニュー全体（タブ切り替え・開閉）
   ============================================================ */
export function refreshAllMenuTabs() {
  renderStatusTab();
  renderEquipmentTab();
  renderSkillsTab();
  renderItemsTab();
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

  els.menuBtn.addEventListener('click', () => openMenu());
  els.menuCloseBtn.addEventListener('click', () => closeMenu());

  const volumeSlider = document.getElementById('opt-volume');
  volumeSlider.value = Math.round(state.masterVolume * 100);
  volumeSlider.addEventListener('input', () => {
    state.masterVolume = volumeSlider.value / 100;
    setMasterVolume(state.masterVolume);
  });

  const qualitySelect = document.getElementById('opt-quality');
  qualitySelect.value = state.quality || 'high';
  qualitySelect.addEventListener('change', () => {
    state.quality = qualitySelect.value;
    setQualityPreset(state.quality);
    sfx.uiClick();
  });

  document.getElementById('save-btn').addEventListener('click', () => {
    saveGame();
    showToast('セーブしました', 'info');
    sfx.uiClick();
    if (onSave) onSave();
  });
  document.getElementById('title-btn').addEventListener('click', () => {
    closeMenu();
    if (onTitle) onTitle();
  });
}

let menuPausedPlaying = false;
export function openMenu() {
  refreshAllMenuTabs();
  els.menuOverlay.classList.add('open');
  sfx.menuOpen();
  menuPausedPlaying = state.playing;
  state.playing = false;
}
export function closeMenu() {
  els.menuOverlay.classList.remove('open');
  sfx.menuClose();
  state.playing = menuPausedPlaying;
}

/* ============================================================
   ローディング画面
   ============================================================ */
export function setLoadingProgress(pct, text) {
  els.loadingBarFill.style.width = `${Math.round(pct * 100)}%`;
  if (text) els.loadingText.textContent = text;
}
export function hideLoadingScreen() {
  els.loadingScreen.classList.add('hidden');
  setTimeout(() => { els.loadingScreen.style.display = 'none'; }, 600);
}

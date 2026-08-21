import { CHAPTERS, ITEMS, SKILLS, levelStatsFor } from './data.js';

const SAVE_KEY = 'aetheria_save_v1';

export const state = {
  chapterIndex: 0,
  level: 1,
  xp: 0,
  shards: 0,
  totalShardsEarned: 0,
  bossesDefeated: 0,
  lifetimeBestCombo: 0,

  playerHP: 100, playerMaxHP: 100,
  playerMP: 50, playerMaxMP: 50,
  playerStam: 100, playerMaxStam: 100,
  bossHP: 130, bossMaxHP: 130,
  healUses: 3,
  guarding: false,
  playing: false,
  turnBusy: false,
  combo: 0,
  maxCombo: 0,
  phase2: false,
  turns: 0,
  damageTaken: 0,
  skillCooldown: 0,
  usedRevive: false,

  equipment: { weapon: null, armor: null, accessory: null },
  inventory: [], // array of item ids owned but not necessarily equipped
  unlockedSkills: [], // array of skill ids
  questProgress: {}, // { chapterKey: { questId: true } }
  fieldQuests: {}, // { questId: 'accepted' | 'ready_turnin' }
  masterVolume: 0.7,
  quality: 'high',
  screenShake: true,
  difficulty: 'normal',
};

const DIFFICULTY_MULT = {
  easy:   { hp: 0.7, dmg: 0.7, shards: 0.8 },
  normal: { hp: 1.0, dmg: 1.0, shards: 1.0 },
  hard:   { hp: 1.35, dmg: 1.3, shards: 1.3 },
};
export function difficultyMult() {
  return DIFFICULTY_MULT[state.difficulty] || DIFFICULTY_MULT.normal;
}

export function fieldQuestState(questId) {
  return state.fieldQuests[questId] || null;
}
export function acceptFieldQuest(questId) {
  if (!state.fieldQuests[questId]) state.fieldQuests[questId] = 'accepted';
}
export function markFieldTargetDefeated(questId) {
  if (state.fieldQuests[questId] === 'accepted') state.fieldQuests[questId] = 'ready_turnin';
}
export function spendShards(n) {
  if (state.shards < n) return false;
  state.shards -= n;
  return true;
}

export function computeStats() {
  const base = levelStatsFor(state.level);
  let atk = 10, def = 5, crit = 5, hpBonus = 0, mpBonus = 0;

  ['weapon', 'armor', 'accessory'].forEach(slot => {
    const id = state.equipment[slot];
    if (!id) return;
    const item = ITEMS[id];
    if (!item) return;
    atk += item.atk || 0;
    def += item.def || 0;
    crit += item.crit || 0;
    hpBonus += item.hp || 0;
    mpBonus += item.mp || 0;
  });

  let atkPct = 0, defPct = 0, dodgeWindowPct = 0, parryBonusPct = 0, healBonusPct = 0;
  state.unlockedSkills.forEach(id => {
    const skill = SKILLS.find(s => s.id === id);
    if (!skill) return;
    const e = skill.effect;
    if (e.atkPct) atkPct += e.atkPct;
    if (e.defPct) defPct += e.defPct;
    if (e.mp) mpBonus += e.mp;
    if (e.crit) crit += e.crit;
    if (e.dodgeWindowPct) dodgeWindowPct += e.dodgeWindowPct;
    if (e.parryBonusPct) parryBonusPct += e.parryBonusPct;
    if (e.healBonusPct) healBonusPct += e.healBonusPct;
  });

  atk = Math.round(atk * (1 + atkPct));
  def = Math.round(def * (1 + defPct));

  return {
    atk, def, crit,
    maxHP: base.maxHP + hpBonus,
    maxMP: base.maxMP + mpBonus,
    maxStam: base.maxStam,
    dmgMult: base.dmgMult,
    dodgeWindowPct,
    parryBonusPct,
    healBonusPct,
    hasRevive: state.unlockedSkills.includes('revive'),
  };
}

export function applyDefense(rawDmg) {
  const stats = computeStats();
  const reduced = rawDmg * (100 / (100 + stats.def));
  return Math.max(1, Math.round(reduced));
}

export function hasUnlockedSkill(id) {
  return state.unlockedSkills.includes(id);
}

export function unlockSkill(id) {
  const skill = SKILLS.find(s => s.id === id);
  if (!skill) return false;
  if (state.unlockedSkills.includes(id)) return false;
  if (state.shards < skill.cost) return false;
  state.shards -= skill.cost;
  state.unlockedSkills.push(id);
  return true;
}

export function addShards(n) {
  state.shards += n;
  state.totalShardsEarned += n;
}

export function resetSkills() {
  if (state.unlockedSkills.length === 0) return 0;
  const refund = state.unlockedSkills.reduce((sum, id) => {
    const skill = SKILLS.find(s => s.id === id);
    return sum + (skill ? skill.cost : 0);
  }, 0);
  state.shards += refund;
  state.unlockedSkills = [];
  return refund;
}

export function ownsItem(id) {
  return state.inventory.includes(id);
}

export function addItem(id) {
  if (!state.inventory.includes(id)) state.inventory.push(id);
}

export function equipItem(id) {
  const item = ITEMS[id];
  if (!item || !ownsItem(id)) return false;
  state.equipment[item.slot] = id;
  return true;
}

export function unequipSlot(slot) {
  state.equipment[slot] = null;
}

export function isQuestDone(chapterKey, questId) {
  return !!(state.questProgress[chapterKey] && state.questProgress[chapterKey][questId]);
}

export function completeQuest(chapterKey, questId) {
  if (!state.questProgress[chapterKey]) state.questProgress[chapterKey] = {};
  state.questProgress[chapterKey][questId] = true;
}

export function chapterQuestsDone(chapterKey) {
  const chapter = CHAPTERS.find(c => c.key === chapterKey);
  if (!chapter) return 0;
  return chapter.quests.filter(q => isQuestDone(chapterKey, q.id)).length;
}

/* ============================================================
   セーブ / ロード（localStorage）
   ============================================================ */
export function saveGame() {
  try {
    const snapshot = {
      chapterIndex: state.chapterIndex,
      level: state.level,
      xp: state.xp,
      shards: state.shards,
      totalShardsEarned: state.totalShardsEarned,
      bossesDefeated: state.bossesDefeated,
      lifetimeBestCombo: state.lifetimeBestCombo,
      equipment: state.equipment,
      inventory: state.inventory,
      unlockedSkills: state.unlockedSkills,
      questProgress: state.questProgress,
      fieldQuests: state.fieldQuests,
      masterVolume: state.masterVolume,
      quality: state.quality,
      screenShake: state.screenShake,
      difficulty: state.difficulty,
      usedRevive: state.usedRevive,
      savedAt: Date.now(),
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(snapshot));
    return true;
  } catch (e) {
    console.warn('save failed', e);
    return false;
  }
}

export function hasSaveGame() {
  try {
    return !!localStorage.getItem(SAVE_KEY);
  } catch (e) {
    return false;
  }
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    const snap = JSON.parse(raw);
    Object.assign(state, {
      chapterIndex: snap.chapterIndex || 0,
      level: snap.level || 1,
      xp: snap.xp || 0,
      shards: snap.shards || 0,
      totalShardsEarned: snap.totalShardsEarned || 0,
      bossesDefeated: snap.bossesDefeated || 0,
      lifetimeBestCombo: snap.lifetimeBestCombo || 0,
      equipment: snap.equipment || { weapon:null, armor:null, accessory:null },
      inventory: snap.inventory || [],
      unlockedSkills: snap.unlockedSkills || [],
      questProgress: snap.questProgress || {},
      fieldQuests: snap.fieldQuests || {},
      masterVolume: (snap.masterVolume != null) ? snap.masterVolume : 0.7,
      quality: snap.quality || 'high',
      screenShake: (snap.screenShake != null) ? snap.screenShake : true,
      difficulty: snap.difficulty || 'normal',
      usedRevive: snap.usedRevive || false,
    });
    return true;
  } catch (e) {
    console.warn('load failed', e);
    return false;
  }
}

export function clearSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
}

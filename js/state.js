import { CHAPTERS, ITEMS, SKILLS, ACHIEVEMENTS, levelStatsFor } from './data.js';

const SAVE_KEY = 'aetheria_save_v1';

export const state = {
  chapterIndex: 0,
  level: 1,
  xp: 0,
  shards: 0,
  totalShardsEarned: 0,
  bossesDefeated: 0,
  lifetimeBestCombo: 0,
  chapterClearCounts: {},
  winStreak: 0,
  bestWinStreak: 0,
  totalDistanceTraveled: 0,

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
  foundTreasures: [], // array of hidden treasure ids collected
  discoveredBiomes: [], // array of discovered biome names
  firefliesCaught: 0,
  totalCrits: 0,
  totalParries: 0,
  starWishesMade: 0,
  screenshotsTaken: 0,
  emotesUsedSet: [],
  butterfliesCaught: 0,
  achievements: [], // array of unlocked achievement ids
  questProgress: {}, // { chapterKey: { questId: true } }
  fieldQuests: {}, // { questId: 'accepted' | 'ready_turnin' }
  masterVolume: 0.7,
  quality: 'high',
  screenShake: true,
  showObjectiveHint: true,
  showBossTaunts: true,
  showGuideBeams: true,
  gamepadRumble: true,
  lowHpHeartbeat: true,
  totalPlaytimeSec: 0,
  reduceFlashing: false,
  uiTextScale: 1,
  photoFilterMode: 0,
  lastBlessingDay: 0,
  seenExploreTutorial: false,
  seenBattleTutorial: false,
  difficulty: 'normal',
  newGamePlus: 0,
  lastLoginDate: null,
  loginStreak: 0,
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

  let atkPct = 0, defPct = 0, dodgeWindowPct = 0, parryBonusPct = 0, healBonusPct = 0, staminaCostPct = 0, healUsesBonus = 0, shardPct = 0, critDmgPct = 0, guardReflectPct = 0, mpRegenBonus = 0, reviveHpPct = 0, staminaMaxBonus = 0, heavyAccuracyPct = 0, parryMpRestore = 0;
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
    if (e.staminaCostPct) staminaCostPct += e.staminaCostPct;
    if (e.healUsesBonus) healUsesBonus += e.healUsesBonus;
    if (e.shardPct) shardPct += e.shardPct;
    if (e.critDmgPct) critDmgPct += e.critDmgPct;
    if (e.guardReflectPct) guardReflectPct += e.guardReflectPct;
    if (e.mpRegenBonus) mpRegenBonus += e.mpRegenBonus;
    if (e.reviveHpPct) reviveHpPct += e.reviveHpPct;
    if (e.staminaMaxBonus) staminaMaxBonus += e.staminaMaxBonus;
    if (e.heavyAccuracyPct) heavyAccuracyPct += e.heavyAccuracyPct;
    if (e.parryMpRestore) parryMpRestore += e.parryMpRestore;
  });

  atk = Math.round(atk * (1 + atkPct));
  def = Math.round(def * (1 + defPct));

  return {
    atk, def, crit,
    maxHP: base.maxHP + hpBonus,
    maxMP: base.maxMP + mpBonus,
    maxStam: base.maxStam + staminaMaxBonus,
    dmgMult: base.dmgMult,
    dodgeWindowPct,
    parryBonusPct,
    healBonusPct,
    staminaCostPct,
    healUsesBonus,
    shardPct,
    critDmgPct,
    guardReflectPct,
    mpRegenBonus,
    reviveHpPct,
    heavyAccuracyPct,
    parryMpRestore,
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

export function unlockAchievement(id) {
  if (state.achievements.includes(id)) return null;
  const ach = ACHIEVEMENTS.find(a => a.id === id);
  if (!ach) return null;
  state.achievements.push(id);
  if (ach.reward) addShards(ach.reward);
  return ach;
}

export function checkAchievements(hiddenTreasureTotal, lastRank, shopItemIds) {
  const newly = [];
  const tryUnlock = id => { const a = unlockAchievement(id); if (a) newly.push(a); };
  if (state.bossesDefeated >= 1) tryUnlock('first_boss');
  if (state.bossesDefeated >= 4) tryUnlock('boss_master');
  if (state.bossesDefeated >= 10) tryUnlock('boss_slayer');
  if (state.lifetimeBestCombo >= 10) tryUnlock('combo_10');
  if (state.lifetimeBestCombo >= 20) tryUnlock('combo_20');
  if (state.lifetimeBestCombo >= 30) tryUnlock('combo_30');
  if (state.lifetimeBestCombo >= 50) tryUnlock('combo_50');
  if (state.totalDistanceTraveled >= 10000) tryUnlock('wanderer');
  if (state.totalDistanceTraveled >= 50000) tryUnlock('pilgrim');
  if (state.totalShardsEarned >= 300) tryUnlock('shard_rich');
  if (state.totalShardsEarned >= 1000) tryUnlock('shard_tycoon');
  if (hiddenTreasureTotal != null && state.foundTreasures.length >= hiddenTreasureTotal) tryUnlock('treasure_hunter');
  if (lastRank === 'S') tryUnlock('rank_s');
  if (state.newGamePlus >= 1) tryUnlock('ng_plus');
  if (shopItemIds && shopItemIds.every(id => state.inventory.includes(id))) tryUnlock('collector');
  if (SKILLS.every(s => state.unlockedSkills.includes(s.id))) tryUnlock('skill_master');
  if (state.difficulty === 'hard') tryUnlock('hard_clear');
  if (lastRank != null && state.damageTaken === 0) tryUnlock('flawless');
  if (state.loginStreak >= 7) tryUnlock('week_streak');
  if (lastRank != null && state.healUses === state.healUsesMax) tryUnlock('no_heal');
  if (lastRank != null && !state.guardUsedThisBattle) tryUnlock('no_guard');
  if (Object.values(state.chapterClearCounts).some(c => c >= 5)) tryUnlock('veteran_hunter');
  if (state.winStreak >= 3) tryUnlock('win_streak_3');
  if (state.winStreak >= 5) tryUnlock('win_streak_5');
  if (totalQuestsDone() >= totalQuestsAll()) tryUnlock('quest_complete');
  if (state.discoveredBiomes.length >= 10) tryUnlock('biome_explorer');
  if (state.discoveredBiomes.length >= 35) tryUnlock('biome_master');
  if (state.firefliesCaught >= 50) tryUnlock('firefly_catcher');
  if (state.totalCrits >= 100) tryUnlock('crit_master');
  if (state.totalParries >= 30) tryUnlock('parry_master');
  if ((state.totalPlaytimeSec || 0) >= 3600) tryUnlock('dedicated_player');
  if ((state.totalPlaytimeSec || 0) >= 18000) tryUnlock('true_resident');
  if (state.butterfliesCaught >= 50) tryUnlock('butterfly_catcher');
  if (CHAPTERS.every(c => (state.chapterClearCounts[c.key] || 0) > 0)) tryUnlock('bestiary_complete');
  if ((state.starWishesMade || 0) >= 20) tryUnlock('star_wisher');
  if ((state.screenshotsTaken || 0) >= 10) tryUnlock('photographer');
  if ((state.emotesUsedSet || []).length >= 4) tryUnlock('emote_master');
  const otherIds = ACHIEVEMENTS.filter(a => a.id !== 'completionist').map(a => a.id);
  if (otherIds.every(id => state.achievements.includes(id))) tryUnlock('completionist');
  return newly;
}

export function checkDailyLogin() {
  const today = new Date().toISOString().slice(0, 10);
  if (state.lastLoginDate === today) return null;
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  state.loginStreak = (state.lastLoginDate === yesterday) ? state.loginStreak + 1 : 1;
  state.lastLoginDate = today;
  const reward = 10 + Math.min(state.loginStreak, 7) * 5;
  addShards(reward);
  return { streak: state.loginStreak, reward };
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

export function totalQuestsDone() {
  return CHAPTERS.reduce((sum, c) => sum + chapterQuestsDone(c.key), 0);
}

export function totalQuestsAll() {
  return CHAPTERS.reduce((sum, c) => sum + c.quests.length, 0);
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
      chapterClearCounts: state.chapterClearCounts,
      winStreak: state.winStreak,
      bestWinStreak: state.bestWinStreak,
      totalDistanceTraveled: state.totalDistanceTraveled,
      equipment: state.equipment,
      inventory: state.inventory,
      unlockedSkills: state.unlockedSkills,
      foundTreasures: state.foundTreasures,
      discoveredBiomes: state.discoveredBiomes,
      firefliesCaught: state.firefliesCaught,
      totalCrits: state.totalCrits,
      starWishesMade: state.starWishesMade,
      screenshotsTaken: state.screenshotsTaken,
      emotesUsedSet: state.emotesUsedSet,
      totalParries: state.totalParries,
      butterfliesCaught: state.butterfliesCaught,
      achievements: state.achievements,
      questProgress: state.questProgress,
      fieldQuests: state.fieldQuests,
      masterVolume: state.masterVolume,
      quality: state.quality,
      screenShake: state.screenShake,
      showObjectiveHint: state.showObjectiveHint,
      showGuideBeams: state.showGuideBeams,
      gamepadRumble: state.gamepadRumble,
      lowHpHeartbeat: state.lowHpHeartbeat,
      totalPlaytimeSec: state.totalPlaytimeSec,
      reduceFlashing: state.reduceFlashing,
      uiTextScale: state.uiTextScale,
      photoFilterMode: state.photoFilterMode,
      lastBlessingDay: state.lastBlessingDay,
      seenExploreTutorial: state.seenExploreTutorial,
      seenBattleTutorial: state.seenBattleTutorial,
      showBossTaunts: state.showBossTaunts,
      difficulty: state.difficulty,
      newGamePlus: state.newGamePlus,
      lastLoginDate: state.lastLoginDate,
      loginStreak: state.loginStreak,
      usedRevive: state.usedRevive,
      savedAt: Date.now(),
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(snapshot));
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('bosusen-saved'));
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
      chapterClearCounts: snap.chapterClearCounts || {},
      winStreak: snap.winStreak || 0,
      bestWinStreak: snap.bestWinStreak || 0,
      totalDistanceTraveled: snap.totalDistanceTraveled || 0,
      equipment: snap.equipment || { weapon:null, armor:null, accessory:null },
      inventory: snap.inventory || [],
      unlockedSkills: snap.unlockedSkills || [],
      foundTreasures: snap.foundTreasures || [],
      discoveredBiomes: snap.discoveredBiomes || [],
      firefliesCaught: snap.firefliesCaught || 0,
      totalCrits: snap.totalCrits || 0,
      starWishesMade: snap.starWishesMade || 0,
      screenshotsTaken: snap.screenshotsTaken || 0,
      emotesUsedSet: snap.emotesUsedSet || [],
      totalParries: snap.totalParries || 0,
      butterfliesCaught: snap.butterfliesCaught || 0,
      achievements: snap.achievements || [],
      questProgress: snap.questProgress || {},
      fieldQuests: snap.fieldQuests || {},
      masterVolume: (snap.masterVolume != null) ? snap.masterVolume : 0.7,
      quality: snap.quality || 'high',
      screenShake: (snap.screenShake != null) ? snap.screenShake : true,
      showObjectiveHint: (snap.showObjectiveHint != null) ? snap.showObjectiveHint : true,
      showGuideBeams: (snap.showGuideBeams != null) ? snap.showGuideBeams : true,
      gamepadRumble: (snap.gamepadRumble != null) ? snap.gamepadRumble : true,
      lowHpHeartbeat: (snap.lowHpHeartbeat != null) ? snap.lowHpHeartbeat : true,
      totalPlaytimeSec: snap.totalPlaytimeSec || 0,
      reduceFlashing: snap.reduceFlashing || false,
      uiTextScale: snap.uiTextScale || 1,
      photoFilterMode: snap.photoFilterMode || 0,
      lastBlessingDay: snap.lastBlessingDay || 0,
      seenExploreTutorial: snap.seenExploreTutorial || false,
      seenBattleTutorial: snap.seenBattleTutorial || false,
      showBossTaunts: (snap.showBossTaunts != null) ? snap.showBossTaunts : true,
      difficulty: snap.difficulty || 'normal',
      newGamePlus: snap.newGamePlus || 0,
      lastLoginDate: snap.lastLoginDate || null,
      loginStreak: snap.loginStreak || 0,
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

export function exportSaveData() {
  return localStorage.getItem(SAVE_KEY);
}

export function importSaveData(raw) {
  try {
    JSON.parse(raw); // 妥当なJSONか検証
    localStorage.setItem(SAVE_KEY, raw);
    return true;
  } catch (e) {
    return false;
  }
}

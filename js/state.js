import { CHAPTERS, ITEMS, SKILLS, ACHIEVEMENTS, EMOTES, TRIAL_MODS, WEATHERS, GATHER_KINDS, STATUS_DEFS, levelStatsFor } from './data.js';

const SAVE_KEY = 'aetheria_save_v1';
export const EXPLORE_STAMINA_BASE = 100;

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
  inSkirmish: false,
  turnBusy: false,
  combo: 0,
  maxCombo: 0,
  phase2: false,
  turns: 0,
  damageTaken: 0,
  skillCooldown: 0,
  usedRevive: false,
  // 手の内を読まれた演出を戦闘ごとに一度だけ出すための印
  bossAdaptedNoted: false,
  // 「集中」で次の攻撃が強化されている状態（戦闘中のみ）
  focused: false,
  // 状態異常 { poison: 残りターン数, ... }（戦闘中のみ）
  statuses: {},
  // 連戦モード（セッション限り）: { index, startedAt }
  gauntlet: null,
  // 現在の Day（scene の時刻から算出。セッション限り）
  currentDay: 0,

  equipment: { weapon: null, armor: null, accessory: null },
  inventory: [], // array of item ids owned but not necessarily equipped
  unlockedSkills: [], // array of skill ids
  foundTreasures: [], // array of hidden treasure ids collected
  discoveredBiomes: [], // array of discovered biome names
  firefliesCaught: 0,
  totalCrits: 0,
  totalParries: 0,
  totalDodges: 0,
  starWishesMade: 0,
  screenshotsTaken: 0,
  emotesUsedSet: [],
  collectedLore: [],
  invertCameraY: false,
  cameraSensitivity: 1,
  highContrast: false,
  reduceNpcChatter: false,
  footstepSounds: true,
  rumbleStrength: 1,
  autoQualityAdjust: true,
  showDamageNumbers: true,
  guardWindowAssist: false,
  fieldKillsTotal: 0,
  companionName: 'イリス',
  totalRevives: 0,
  proximitySounds: true,
  lossStreak: 0,
  hadComeback: false,
  gotGoldenHourPhoto: false,
  screenshotWatermark: true,
  cinematicAutoHide: false,
  pinnedAchievement: null,
  questTrackerCollapsed: false,
  savedLoadouts: { a: null, b: null },
  firstDefeatedAt: {},
  // 直近の撃破日時（実績「一日の疾走」は再挑戦でも狙えるようこちらを使う）
  lastDefeatedAt: {},
  bestTurnsPerChapter: {},
  bestRankPerChapter: {},
  biomeDiscoveredAt: {},
  achievementUnlockedAt: {},
  seenEndings: [],
  butterfliesCaught: 0,
  spiritsCaught: 0,
  // 採取コンボ（連続して捕まえると欠片が増える）。進行中の値はセッション限り
  collectCombo: 0,
  collectComboAt: 0,
  bestCollectCombo: 0,
  // ボスの技ごとの遭遇記録 { 'chapterKey|技名': { seen, avoided } }
  moveStats: {},
  // 装備の強化段階 { itemId: 1〜MAX_ITEM_LEVEL }
  itemLevels: {},
  // 日替わりの試練
  trialClaimedDate: null,
  trialsCleared: 0,
  campfireRests: 0,
  eliteKills: 0,
  // 経験した天候の種類（実績用）
  seenWeathers: [],
  // 日替わりの採取依頼
  gatherDay: -1,
  gatherProgress: 0,
  gatherClaimed: false,
  gatherDone: 0,
  bestGauntletMs: 0,
  gauntletClears: 0,
  // 進行中の戦闘が試練かどうか（戦闘開始時に確定させる）
  trialActive: null,
  achievements: [], // array of unlocked achievement ids
  questProgress: {}, // { chapterKey: { questId: true } }
  fieldQuests: {}, // { questId: 'accepted' | 'ready_turnin' }
  masterVolume: 0.7,
  ambientVolume: 1,
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
  radarZoomIdx: 1,
  // 装備・スキルから導出する派生値のため保存しない
  exploreStaminaMax: 100,
  // セッション内の経過時間から算出する Day 数に対応するため、保存せずセッション単位で扱う
  lastBlessingDay: 0,
  seenExploreTutorial: false,
  seenBattleTutorial: false,
  difficulty: 'normal',
  // 戦闘開始時の難易度を固定して使う（戦闘中の変更で報酬や実績が変わらないように）
  battleDifficulty: null,
  // 平定済みの聖域に再挑戦している間、復帰先の章番号を保持する。
  // 再挑戦中は setupChapterBattle が chapterIndex を書き換えるため、
  // 保存時はこちらを進行度として書き出す（進行度の巻き戻り防止）。
  replayReturnChapter: null,
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

// 進行中の戦闘に適用する難易度。開始時に固定するため、戦闘中に設定を
// 変更しても被ダメージ・報酬・実績が揺れない。
export function battleDifficultyMult() {
  const key = state.battleDifficulty || state.difficulty;
  return DIFFICULTY_MULT[key] || DIFFICULTY_MULT.normal;
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

/* ---------- 装備の強化（鍛冶） ---------- */
export const MAX_ITEM_LEVEL = 5;

/** その装備の現在の強化段階（未強化なら 0） */
export function itemLevel(id) {
  return state.itemLevels[id] || 0;
}

/** 次の強化に必要な欠片。上限に達していれば null */
export function itemUpgradeCost(id) {
  const lv = itemLevel(id);
  if (lv >= MAX_ITEM_LEVEL) return null;
  return 60 + lv * 60;
}

/**
 * 強化段階を反映した装備データを返す。
 * 各段階でもとの性能の 15% ずつ上乗せする（元が 0 の項目は増えない）。
 * ステータス計算も表示もこれを通すことで、数値がずれないようにする。
 */
export function effectiveItem(id) {
  const base = ITEMS[id];
  if (!base) return null;
  const lv = itemLevel(id);
  if (lv <= 0) return base;
  const bump = v => (v ? Math.max(v + lv, Math.round(v * (1 + 0.15 * lv))) : v);
  return {
    ...base,
    atk: bump(base.atk), def: bump(base.def), crit: bump(base.crit),
    hp: bump(base.hp), mp: bump(base.mp),
    level: lv,
  };
}

/** 強化を実行する。欠片が足りない・上限・未所持なら false */
export function upgradeItem(id) {
  if (!ITEMS[id] || !state.inventory.includes(id)) return false;
  const cost = itemUpgradeCost(id);
  if (cost == null || !spendShards(cost)) return false;
  state.itemLevels[id] = itemLevel(id) + 1;
  refreshMaxStats();
  return true;
}

/* ---------- 状態異常 ---------- */
/** 状態異常を付与する（すでに掛かっていればターン数を上書きで延長） */
export function applyStatus(id) {
  const def = STATUS_DEFS[id];
  if (!def) return false;
  state.statuses[id] = def.turns;
  return true;
}

/** 状態異常のターンを1つ進める。今ターンの継続ダメージ合計を返す */
export function tickStatuses() {
  let dmg = 0;
  Object.keys(state.statuses).forEach(id => {
    const def = STATUS_DEFS[id];
    if (!def) { delete state.statuses[id]; return; }
    if (def.dmgPerTurn) dmg += def.dmgPerTurn;
    state.statuses[id] -= 1;
    if (state.statuses[id] <= 0) delete state.statuses[id];
  });
  return dmg;
}

/** 状態異常による与ダメージ倍率 */
export function statusAtkMult() {
  let mult = 1;
  Object.keys(state.statuses).forEach(id => {
    const def = STATUS_DEFS[id];
    if (def && def.atkMult) mult *= def.atkMult;
  });
  return mult;
}

/** 状態異常をすべて解除する */
export function clearStatuses() {
  state.statuses = {};
}

/* ---------- 天候 ---------- */
// その日の天候。Day 番号だけで決まるので、どこから呼んでも同じ結果になる。
let weatherDay = -1;
let weatherCache = WEATHERS[0];
export function weatherForDay(day) {
  if (day !== weatherDay) {
    weatherDay = day;
    // 単純な乗算＋シフトだと数日ごとに同じ天候が続いてしまうため、
    // 2段階で撹拌してから選ぶ
    let h = Math.imul(day + 1, 2654435761) >>> 0;
    h = (h ^ (h >>> 15)) >>> 0;
    h = Math.imul(h, 2246822519) >>> 0;
    h = (h ^ (h >>> 13)) >>> 0;
    weatherCache = WEATHERS[h % WEATHERS.length];
  }
  return weatherCache;
}

/** その天候を体験したことを記録する（実績用）。新規なら true */
export function markWeatherSeen(id) {
  if (!state.seenWeathers) state.seenWeathers = [];
  if (state.seenWeathers.includes(id)) return false;
  state.seenWeathers.push(id);
  return true;
}

/** 現在の天候（main が Day を更新するたびに設定する） */
export function currentWeather() {
  return weatherCache;
}

/* ---------- 日替わりの目玉商品 ---------- */
/**
 * その日の割引対象（商品の並び位置と割引率）。Day 番号だけで決まる。
 * 商品の一覧は world.js 側にあり state からは参照できないため、
 * 「何番目の商品か」と割引率だけを返し、対応付けは呼び出し側で行う。
 */
export function dailyDealFor(day, shopCount) {
  if (!shopCount) return null;
  let h = Math.imul(day + 11, 2654435761) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0;
  return { index: h % shopCount, rate: 0.25 };
}

/** 割引後の価格 */
export function discountedCost(cost, rate) {
  return Math.max(1, Math.round(cost * (1 - rate)));
}

/* ---------- 日替わりの採取依頼 ---------- */
/** その日の採取依頼（Day 番号から決まる） */
export function gatherRequestFor(day) {
  let h = Math.imul(day + 7, 2246822519) >>> 0;
  h = (h ^ (h >>> 14)) >>> 0;
  return GATHER_KINDS[h % GATHER_KINDS.length];
}

/** 現在の採取依頼。Day が変わっていれば作り直す */
export function currentGatherRequest(day) {
  if (state.gatherDay !== day) {
    state.gatherDay = day;
    state.gatherProgress = 0;
    state.gatherClaimed = false;
  }
  return gatherRequestFor(state.gatherDay);
}

/**
 * 採取依頼の進捗を進める。達成した瞬間だけ報酬額を返す（それ以外は 0）。
 * 依頼の対象と違う種類を捕まえた場合は何もしない。
 */
export function advanceGather(kindCounter, count) {
  if (state.gatherDay < 0 || state.gatherClaimed) return 0;
  const req = gatherRequestFor(state.gatherDay);
  if (req.counter !== kindCounter) return 0;
  state.gatherProgress = (state.gatherProgress || 0) + count;
  if (state.gatherProgress < req.need) return 0;
  state.gatherClaimed = true;
  state.gatherDone = (state.gatherDone || 0) + 1;
  addShards(req.reward);
  return req.reward;
}

/* ---------- 日替わりの試練 ---------- */
/** その日の日付キー（ローカル時間） */
function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

/** 日付から決まる今日の試練（章と条件）。同じ日なら誰が呼んでも同じ結果になる */
export function dailyTrial() {
  const key = todayKey();
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  // 単純な右シフトだと日ごとに条件がほとんど変わらないため、
  // 章と条件で別々に撹拌した値を使う
  const m = Math.imul(h ^ (h >>> 13), 2654435761) >>> 0;
  return {
    key,
    chapterIndex: h % CHAPTERS.length,
    mod: TRIAL_MODS[m % TRIAL_MODS.length],
  };
}

/** 今日の試練をすでに達成済みか */
export function trialClaimedToday() {
  return state.trialClaimedDate === todayKey();
}

/** その章に挑むとき、今日の試練が適用されるか */
export function trialAppliesTo(chapterIndex) {
  return !trialClaimedToday() && dailyTrial().chapterIndex === chapterIndex;
}

/** 試練の達成を記録する（同じ日に二重取得しない） */
export function claimTrial() {
  if (trialClaimedToday()) return false;
  state.trialClaimedDate = todayKey();
  state.trialsCleared = (state.trialsCleared || 0) + 1;
  return true;
}

export function computeStats() {
  const base = levelStatsFor(state.level);
  let atk = 10, def = 5, crit = 5, hpBonus = 0, mpBonus = 0;

  ['weapon', 'armor', 'accessory'].forEach(slot => {
    const id = state.equipment[slot];
    if (!id) return;
    const item = effectiveItem(id);
    if (!item) return;
    atk += item.atk || 0;
    def += item.def || 0;
    crit += item.crit || 0;
    hpBonus += item.hp || 0;
    mpBonus += item.mp || 0;
  });

  let statusResistPct = 0, atkPct = 0, defPct = 0, dodgeWindowPct = 0, parryBonusPct = 0, healBonusPct = 0, staminaCostPct = 0, healUsesBonus = 0, shardPct = 0, critDmgPct = 0, guardReflectPct = 0, mpRegenBonus = 0, reviveHpPct = 0, staminaMaxBonus = 0, heavyAccuracyPct = 0, parryMpRestore = 0, lowHpAtkPct = 0;
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
    if (e.lowHpAtkPct) lowHpAtkPct += e.lowHpAtkPct;
    if (e.statusResistPct) statusResistPct += e.statusResistPct;
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
    staminaMaxBonus,
    heavyAccuracyPct,
    parryMpRestore,
    lowHpAtkPct,
    statusResistPct: Math.min(0.9, statusResistPct),
    hasRevive: state.unlockedSkills.includes('revive'),
  };
}

// 装備変更やスキル習得で最大値が変わったとき、探索中でも上限へ反映する。
// 現在値は増やさない（回復の代用にしない）が、上限を下回るよう切り詰める。
export function refreshMaxStats() {
  const stats = computeStats();
  state.playerMaxHP = stats.maxHP;
  state.playerMaxMP = stats.maxMP;
  state.playerMaxStam = stats.maxStam;
  // 探索スタミナは戦闘とは別系統だが、スキルの加算分は同じように反映する
  state.exploreStaminaMax = EXPLORE_STAMINA_BASE + (stats.staminaMaxBonus || 0);
  state.playerHP = Math.min(state.playerHP, state.playerMaxHP);
  state.playerMP = Math.min(state.playerMP, state.playerMaxMP);
  state.playerStam = Math.min(state.playerStam, state.playerMaxStam);
}

// 戦闘の評価ランク。結果画面だけでなく戦闘中の見込み表示にも使うため、
// ui/combat のどちらからも参照できる依存のないこのモジュールに置く。
// 討伐目標が「今その場で戦える」状態か。地図・方角表示・接近判定で共有する。
// 受注済みで未討伐、または依頼達成後の再討伐がクールダウン明けなら戦える。
export function isFieldTargetHuntable(t) {
  const chapterKey = CHAPTERS[t.chapterIndex].key;
  if (isQuestDone(chapterKey, t.questId)) return Date.now() >= (t.huntReadyAt || 0);
  return fieldQuestState(t.questId) === 'accepted';
}

// 「背水」系スキルが働く体力域か
export const LOW_HP_THRESHOLD = 0.3;
export function isLowHp() {
  return state.playerMaxHP > 0 && state.playerHP / state.playerMaxHP <= LOW_HP_THRESHOLD;
}

export function calcRank() {
  if (state.damageTaken <= 20 && state.turns <= 10) return 'S';
  if (state.damageTaken <= 50 && state.turns <= 16) return 'A';
  if (state.damageTaken <= 90) return 'B';
  return 'C';
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
  refreshMaxStats();
  return true;
}

// フィールド報酬（クエスト・秘宝）にもボス報酬と同じ周回ボーナスを掛ける
export function ngPlusShardMult() {
  return 1 + (state.newGamePlus || 0) * 0.2;
}

/** 採取コンボが途切れるまでの猶予（ミリ秒） */
export const COLLECT_COMBO_WINDOW_MS = 6000;

/**
 * 蛍・蝶・精霊球を捕まえたときに呼ぶ。猶予内に続けて捕まえるとコンボが伸び、
 * 5 匹ごとに欠片の取得量が 0.5 倍ずつ増える（上限 3 倍）。
 * @returns {{ combo: number, mult: number }} 更新後のコンボ数と欠片倍率
 */
export function registerCollect(count) {
  const now = Date.now();
  if (now - (state.collectComboAt || 0) > COLLECT_COMBO_WINDOW_MS) state.collectCombo = 0;
  state.collectComboAt = now;
  state.collectCombo = (state.collectCombo || 0) + count;
  if (state.collectCombo > (state.bestCollectCombo || 0)) state.bestCollectCombo = state.collectCombo;
  return { combo: state.collectCombo, mult: collectComboMult() };
}

/** 現在の採取コンボによる欠片倍率 */
export function collectComboMult() {
  return Math.min(3, 1 + Math.floor((state.collectCombo || 0) / 5) * 0.5);
}

/** 見切り済みとみなす回避回数（回避・パリィの合計） */
export const MOVE_MASTERED_AT = 3;

/** ボスの技を受けた／凌いだ結果を記録する */
export function recordMoveOutcome(moveName, avoided) {
  const chapter = CHAPTERS[state.chapterIndex];
  if (!chapter) return;
  const key = `${chapter.key}|${moveName}`;
  const e = state.moveStats[key] || (state.moveStats[key] = { seen: 0, avoided: 0 });
  e.seen++;
  if (avoided) e.avoided++;
}

/** 技の記録を取り出す（未遭遇なら 0 の組を返す） */
export function moveStat(chapterKey, moveName) {
  return state.moveStats[`${chapterKey}|${moveName}`] || { seen: 0, avoided: 0 };
}

/** その技を見切ったか（回避を規定回数積んだか） */
export function isMoveMastered(chapterKey, moveName) {
  return moveStat(chapterKey, moveName).avoided >= MOVE_MASTERED_AT;
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
  if (!state.achievementUnlockedAt) state.achievementUnlockedAt = {};
  state.achievementUnlockedAt[id] = Date.now();
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
  if (CHAPTERS.every(c => (state.bestRankPerChapter || {})[c.key] === 'S')) tryUnlock('all_rank_s');
  if (state.newGamePlus >= 1) tryUnlock('ng_plus');
  if (shopItemIds && shopItemIds.every(id => state.inventory.includes(id))) tryUnlock('collector');
  if (SKILLS.every(s => state.unlockedSkills.includes(s.id))) tryUnlock('skill_master');
  if ((state.battleDifficulty || state.difficulty) === 'hard') tryUnlock('hard_clear');
  {
    // 全章を同じ日に撃破したか。初撃破日で判定すると、日をまたいで
    // 進めた既存プレイヤーが永久に達成できなくなるため直近の撃破日で見る。
    const stamps = CHAPTERS.map(c => (state.lastDefeatedAt || {})[c.key]);
    if (stamps.every(Boolean)) {
      const days = stamps.map(t => new Date(t).toLocaleDateString('sv-SE'));
      if (days.every(d => d === days[0])) tryUnlock('same_day_clear');
    }
  }
  if (lastRank != null && state.damageTaken === 0) tryUnlock('flawless');
  if (lastRank != null && state.turns > 0 && state.turns <= 5) tryUnlock('speed_clear');
  if ((state.totalRevives || 0) >= 1) tryUnlock('revived');
  if (state.hadComeback) tryUnlock('comeback');
  if (state.loginStreak >= 7) tryUnlock('week_streak');
  if (lastRank != null && state.healUses === state.healUsesMax) tryUnlock('no_heal');
  if (lastRank != null && !state.guardUsedThisBattle) tryUnlock('no_guard');
  if (lastRank != null && !state.skillUsedThisBattle) tryUnlock('no_skill');
  if ((state.fieldKillsTotal || 0) >= 20) tryUnlock('field_hunter');
  if ((state.fieldKillsTotal || 0) >= 50) tryUnlock('field_hunter_master');
  if (Object.values(state.chapterClearCounts).some(c => c >= 5)) tryUnlock('veteran_hunter');
  if (state.winStreak >= 3) tryUnlock('win_streak_3');
  if (state.winStreak >= 5) tryUnlock('win_streak_5');
  if (totalQuestsDone() >= totalQuestsAll()) tryUnlock('quest_complete');
  if (state.discoveredBiomes.length >= 10) tryUnlock('biome_explorer');
  if (state.discoveredBiomes.length >= 35) tryUnlock('biome_master');
  if (state.firefliesCaught >= 50) tryUnlock('firefly_catcher');
  if (state.firefliesCaught >= 200) tryUnlock('firefly_master');
  if (state.butterfliesCaught >= 200) tryUnlock('butterfly_master');
  if (state.totalCrits >= 100) tryUnlock('crit_master');
  if (state.totalParries >= 30) tryUnlock('parry_master');
  if ((state.totalDodges || 0) >= 50) tryUnlock('dodge_master');
  {
    const allEndings = CHAPTERS.reduce((acc, c) => acc.concat(c.endings || []), []);
    if (allEndings.length > 0 && allEndings.every(e => (state.seenEndings || []).includes(e.id))) tryUnlock('all_endings');
  }
  if ((state.totalPlaytimeSec || 0) >= 3600) tryUnlock('dedicated_player');
  if ((state.totalPlaytimeSec || 0) >= 18000) tryUnlock('true_resident');
  if ((state.totalPlaytimeSec || 0) >= 36000) tryUnlock('veteran_resident');
  if (state.butterfliesCaught >= 50) tryUnlock('butterfly_catcher');
  if ((state.spiritsCaught || 0) >= 30) tryUnlock('spirit_collector');
  if ((state.bestCollectCombo || 0) >= 15) tryUnlock('collect_combo');
  if (Object.values(state.itemLevels || {}).some(v => v >= MAX_ITEM_LEVEL)) tryUnlock('smith_master');
  if ((state.trialsCleared || 0) >= 10) tryUnlock('trial_veteran');
  if ((state.campfireRests || 0) >= 15) tryUnlock('camper');
  if ((state.eliteKills || 0) >= 5) tryUnlock('elite_hunter');
  if (WEATHERS.every(w => (state.seenWeathers || []).includes(w.id))) tryUnlock('weather_watcher');
  if ((state.gatherDone || 0) >= 10) tryUnlock('gather_master');
  if ((state.gauntletClears || 0) >= 1) tryUnlock('gauntlet_clear');
  {
    // 1つの章の全ての技（覚醒後を含む）を見切ると解除
    const readAll = CHAPTERS.some(c => {
      const moves = [...(c.movesPhase1 || []), ...(c.movesPhase2 || [])];
      return moves.length > 0 && moves.every(m => isMoveMastered(c.key, m.name));
    });
    if (readAll) tryUnlock('move_reader');
  }
  if (CHAPTERS.every(c => (state.chapterClearCounts[c.key] || 0) > 0)) tryUnlock('bestiary_complete');
  if ((state.starWishesMade || 0) >= 20) tryUnlock('star_wisher');
  if ((state.starWishesMade || 0) >= 50) tryUnlock('star_wisher_master');
  if ((state.screenshotsTaken || 0) >= 10) tryUnlock('photographer');
  if ((state.screenshotsTaken || 0) >= 50) tryUnlock('master_photographer');
  if (state.gotGoldenHourPhoto) tryUnlock('golden_hour');
  if ((state.emotesUsedSet || []).length >= EMOTES.length) tryUnlock('emote_master');
  if ((state.collectedLore || []).length >= 8) tryUnlock('lore_master');
  if ((state.newGamePlus || 0) >= 5) tryUnlock('ng_plus_5');
  const otherIds = ACHIEVEMENTS.filter(a => a.id !== 'completionist').map(a => a.id);
  if (otherIds.every(id => state.achievements.includes(id))) tryUnlock('completionist');
  return newly;
}

export function checkDailyLogin() {
  const today = new Date().toISOString().slice(0, 10);
  if (state.lastLoginDate === today) return null;
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const streakBroken = state.lastLoginDate && state.lastLoginDate !== yesterday && state.loginStreak >= 3;
  const daysSince = state.lastLoginDate ? Math.round((Date.now() - new Date(state.lastLoginDate).getTime()) / 86400000) : 0;
  state.loginStreak = (state.lastLoginDate === yesterday) ? state.loginStreak + 1 : 1;
  state.lastLoginDate = today;
  let reward = 10 + Math.min(state.loginStreak, 7) * 5;
  const milestone = state.loginStreak > 0 && state.loginStreak % 7 === 0;
  if (milestone) reward += 30;
  addShards(reward);
  return { streak: state.loginStreak, reward, milestone, welcomeBack: streakBroken && daysSince >= 3 ? daysSince : 0 };
}

export function resetSkills() {
  if (state.unlockedSkills.length === 0) return 0;
  const refund = state.unlockedSkills.reduce((sum, id) => {
    const skill = SKILLS.find(s => s.id === id);
    return sum + (skill ? skill.cost : 0);
  }, 0);
  state.shards += refund;
  state.unlockedSkills = [];
  refreshMaxStats();
  return refund;
}

export function ownsItem(id) {
  return state.inventory.includes(id);
}

export function addItem(id) {
  if (!state.inventory.includes(id)) state.inventory.push(id);
}

export function removeItem(id) {
  const idx = state.inventory.indexOf(id);
  if (idx < 0) return false;
  if (Object.values(state.equipment).includes(id)) return false;
  state.inventory.splice(idx, 1);
  return true;
}

export function equipItem(id) {
  const item = ITEMS[id];
  if (!item || !ownsItem(id)) return false;
  state.equipment[item.slot] = id;
  refreshMaxStats();
  return true;
}

export function unequipSlot(slot) {
  state.equipment[slot] = null;
  refreshMaxStats();
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
      chapterIndex: state.replayReturnChapter != null ? state.replayReturnChapter : state.chapterIndex,
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
      collectedLore: state.collectedLore,
      invertCameraY: state.invertCameraY,
      cameraSensitivity: state.cameraSensitivity,
      highContrast: state.highContrast,
      reduceNpcChatter: state.reduceNpcChatter,
      footstepSounds: state.footstepSounds,
      rumbleStrength: state.rumbleStrength,
      autoQualityAdjust: state.autoQualityAdjust,
      showDamageNumbers: state.showDamageNumbers,
      guardWindowAssist: state.guardWindowAssist,
      fieldKillsTotal: state.fieldKillsTotal,
      companionName: state.companionName,
      totalRevives: state.totalRevives,
      proximitySounds: state.proximitySounds,
      lossStreak: state.lossStreak,
      hadComeback: state.hadComeback,
      gotGoldenHourPhoto: state.gotGoldenHourPhoto,
      screenshotWatermark: state.screenshotWatermark,
      cinematicAutoHide: state.cinematicAutoHide,
      pinnedAchievement: state.pinnedAchievement,
      questTrackerCollapsed: state.questTrackerCollapsed,
      savedLoadouts: state.savedLoadouts,
      firstDefeatedAt: state.firstDefeatedAt,
      lastDefeatedAt: state.lastDefeatedAt,
      bestTurnsPerChapter: state.bestTurnsPerChapter,
      bestRankPerChapter: state.bestRankPerChapter,
      biomeDiscoveredAt: state.biomeDiscoveredAt,
      achievementUnlockedAt: state.achievementUnlockedAt,
      seenEndings: state.seenEndings,
      totalParries: state.totalParries,
      totalDodges: state.totalDodges,
      butterfliesCaught: state.butterfliesCaught,
      spiritsCaught: state.spiritsCaught,
      bestCollectCombo: state.bestCollectCombo,
      moveStats: state.moveStats,
      itemLevels: state.itemLevels,
      trialClaimedDate: state.trialClaimedDate,
      trialsCleared: state.trialsCleared,
      campfireRests: state.campfireRests,
      eliteKills: state.eliteKills,
      seenWeathers: state.seenWeathers,
      gatherDay: state.gatherDay,
      gatherProgress: state.gatherProgress,
      gatherClaimed: state.gatherClaimed,
      gatherDone: state.gatherDone,
      bestGauntletMs: state.bestGauntletMs,
      gauntletClears: state.gauntletClears,
      achievements: state.achievements,
      questProgress: state.questProgress,
      fieldQuests: state.fieldQuests,
      masterVolume: state.masterVolume,
      ambientVolume: state.ambientVolume,
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
      radarZoomIdx: state.radarZoomIdx,
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

export function peekSaveSummary() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const snap = JSON.parse(raw);
    return {
      chapterIndex: asChapterIndex(snap.chapterIndex),
      level: asNumber(snap.level, 1),
      newGamePlus: asNumber(snap.newGamePlus, 0),
      savedAt: asNumber(snap.savedAt, 0),
    };
  } catch (e) {
    return null;
  }
}

// 手で編集された/壊れたセーブでも型を保証する。
// `snap.x || []` だけでは文字列や数値がそのまま入り、後段の filter/forEach で落ちる。
function asArray(v) { return Array.isArray(v) ? v : []; }
function asObject(v) { return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }
function asNumber(v, fallback) { return Number.isFinite(v) ? v : fallback; }
// CHAPTERS の添字に使うため、範囲外だと chapter が undefined になり参照時に落ちる
function asChapterIndex(v) {
  const n = Math.floor(asNumber(v, 0));
  return Math.min(CHAPTERS.length - 1, Math.max(0, n));
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    const snap = JSON.parse(raw);
    Object.assign(state, {
      chapterIndex: asChapterIndex(snap.chapterIndex),
      level: asNumber(snap.level, 1),
      xp: snap.xp || 0,
      shards: snap.shards || 0,
      totalShardsEarned: snap.totalShardsEarned || 0,
      bossesDefeated: snap.bossesDefeated || 0,
      lifetimeBestCombo: snap.lifetimeBestCombo || 0,
      chapterClearCounts: asObject(snap.chapterClearCounts),
      winStreak: snap.winStreak || 0,
      bestWinStreak: snap.bestWinStreak || 0,
      totalDistanceTraveled: snap.totalDistanceTraveled || 0,
      equipment: { weapon:null, armor:null, accessory:null, ...asObject(snap.equipment) },
      inventory: asArray(snap.inventory),
      unlockedSkills: asArray(snap.unlockedSkills),
      foundTreasures: asArray(snap.foundTreasures),
      discoveredBiomes: asArray(snap.discoveredBiomes),
      firefliesCaught: snap.firefliesCaught || 0,
      totalCrits: snap.totalCrits || 0,
      starWishesMade: snap.starWishesMade || 0,
      screenshotsTaken: snap.screenshotsTaken || 0,
      emotesUsedSet: asArray(snap.emotesUsedSet),
      collectedLore: asArray(snap.collectedLore),
      invertCameraY: snap.invertCameraY || false,
      cameraSensitivity: snap.cameraSensitivity || 1,
      highContrast: snap.highContrast || false,
      reduceNpcChatter: snap.reduceNpcChatter || false,
      footstepSounds: snap.footstepSounds !== false,
      rumbleStrength: snap.rumbleStrength != null ? snap.rumbleStrength : 1,
      autoQualityAdjust: snap.autoQualityAdjust !== false,
      showDamageNumbers: snap.showDamageNumbers !== false,
      guardWindowAssist: snap.guardWindowAssist === true,
      fieldKillsTotal: snap.fieldKillsTotal || 0,
      companionName: snap.companionName || 'イリス',
      totalRevives: snap.totalRevives || 0,
      proximitySounds: snap.proximitySounds !== false,
      lossStreak: snap.lossStreak || 0,
      hadComeback: snap.hadComeback || false,
      gotGoldenHourPhoto: snap.gotGoldenHourPhoto || false,
      screenshotWatermark: snap.screenshotWatermark !== false,
      cinematicAutoHide: snap.cinematicAutoHide || false,
      pinnedAchievement: snap.pinnedAchievement || null,
      questTrackerCollapsed: snap.questTrackerCollapsed || false,
      savedLoadouts: { a: null, b: null, ...asObject(snap.savedLoadouts) },
      firstDefeatedAt: asObject(snap.firstDefeatedAt),
      lastDefeatedAt: asObject(snap.lastDefeatedAt),
      bestTurnsPerChapter: asObject(snap.bestTurnsPerChapter),
      bestRankPerChapter: asObject(snap.bestRankPerChapter),
      biomeDiscoveredAt: asObject(snap.biomeDiscoveredAt),
      achievementUnlockedAt: asObject(snap.achievementUnlockedAt),
      seenEndings: asArray(snap.seenEndings),
      totalParries: snap.totalParries || 0,
      totalDodges: snap.totalDodges || 0,
      butterfliesCaught: snap.butterfliesCaught || 0,
      spiritsCaught: asNumber(snap.spiritsCaught, 0),
      bestCollectCombo: asNumber(snap.bestCollectCombo, 0),
      moveStats: asObject(snap.moveStats, {}),
      itemLevels: asObject(snap.itemLevels, {}),
      trialClaimedDate: snap.trialClaimedDate || null,
      trialsCleared: asNumber(snap.trialsCleared, 0),
      campfireRests: asNumber(snap.campfireRests, 0),
      eliteKills: asNumber(snap.eliteKills, 0),
      seenWeathers: asArray(snap.seenWeathers, []),
      gatherDay: asNumber(snap.gatherDay, -1),
      gatherProgress: asNumber(snap.gatherProgress, 0),
      gatherClaimed: !!snap.gatherClaimed,
      gatherDone: asNumber(snap.gatherDone, 0),
      bestGauntletMs: asNumber(snap.bestGauntletMs, 0),
      gauntletClears: asNumber(snap.gauntletClears, 0),
      achievements: asArray(snap.achievements),
      questProgress: asObject(snap.questProgress),
      fieldQuests: asObject(snap.fieldQuests),
      masterVolume: (snap.masterVolume != null) ? snap.masterVolume : 0.7,
      ambientVolume: (snap.ambientVolume != null) ? snap.ambientVolume : 1,
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
      radarZoomIdx: snap.radarZoomIdx != null ? snap.radarZoomIdx : 1,
      seenExploreTutorial: snap.seenExploreTutorial || false,
      seenBattleTutorial: snap.seenBattleTutorial || false,
      showBossTaunts: (snap.showBossTaunts != null) ? snap.showBossTaunts : true,
      difficulty: snap.difficulty || 'normal',
      newGamePlus: asNumber(snap.newGamePlus, 0),
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
    const snap = JSON.parse(raw);
    // JSON として妥当なだけでは不十分。null や配列・文字列をそのまま保存すると
    // hasSaveGame() は真になるのに loadGame() が失敗し、復帰不能な状態になる。
    if (!snap || typeof snap !== 'object' || Array.isArray(snap)) return false;
    // このゲームのセーブらしさを最低限確認する（無関係な JSON の取り違え対策）
    const KNOWN_KEYS = ['chapterIndex', 'level', 'shards', 'equipment', 'inventory', 'achievements', 'savedAt'];
    if (!KNOWN_KEYS.some(k => k in snap)) return false;
    localStorage.setItem(SAVE_KEY, raw);
    return true;
  } catch (e) {
    return false;
  }
}

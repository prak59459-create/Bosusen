#!/usr/bin/env node
/**
 * state.js の主要なロジックを実際に動かして検査する。
 *
 *   node tools/check-runtime.mjs
 *
 * これまでの検査はすべて静的な突き合わせで、
 * 「セーブして読み直すと値が変わる」「強化の計算が合わない」といった
 * 振る舞いの誤りは拾えなかった。state.js は three に依存しないため、
 * localStorage だけ用意すれば Node 上でそのまま動かせる。
 */
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// localStorage の最小実装（state.js が使うのは get/set/remove のみ）
const store = new Map();
globalThis.localStorage = {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: k => store.delete(k),
};

const S = await import(join(root, 'js', 'state.js'));
const { CHAPTERS, ITEMS, WEATHERS } = await import(join(root, 'js', 'data.js'));
const { state } = S;

const problems = [];
let checks = 0;
function check(label, cond) {
  checks++;
  if (!cond) problems.push(label);
}

// --- セーブ/ロードの往復 ---
{
  state.shards = 1234;
  state.spiritsCaught = 7;
  state.itemLevels = { sword_rusty: 3 };
  state.moveStats = { 'castle|錆びた斬撃': { seen: 5, avoided: 2 } };
  state.seenWeathers = ['clear', 'rain'];
  state.gatherDone = 4;
  S.saveGame();

  state.shards = 0;
  state.spiritsCaught = 0;
  state.itemLevels = {};
  state.moveStats = {};
  state.seenWeathers = [];
  state.gatherDone = 0;
  S.loadGame();

  check('セーブ/ロード: shards が復元されない', state.shards === 1234);
  check('セーブ/ロード: spiritsCaught が復元されない', state.spiritsCaught === 7);
  check('セーブ/ロード: itemLevels が復元されない', state.itemLevels.sword_rusty === 3);
  check('セーブ/ロード: moveStats が復元されない', S.moveStat('castle', '錆びた斬撃').avoided === 2);
  check('セーブ/ロード: seenWeathers が復元されない', state.seenWeathers.length === 2);
  check('セーブ/ロード: gatherDone が復元されない', state.gatherDone === 4);
}

// --- 進行度の巻き戻り防止（再挑戦・連戦中は復帰先を進行度として書き出す） ---
{
  state.chapterIndex = 4;
  state.replayReturnChapter = 4;
  state.chapterIndex = 0; // 再挑戦で書き換わった状態
  S.saveGame();
  state.replayReturnChapter = null;
  S.loadGame();
  check('再挑戦中のセーブで進行度が巻き戻る', state.chapterIndex === 4);
}

// --- 装備の強化 ---
{
  state.shards = 10000;
  state.inventory = ['sword_rusty'];
  state.itemLevels = {};
  const base = ITEMS.sword_rusty.atk;
  check('強化前は元の性能のまま', S.effectiveItem('sword_rusty').atk === base);
  let spent = 0;
  for (let i = 0; i < S.MAX_ITEM_LEVEL; i++) {
    const cost = S.itemUpgradeCost('sword_rusty');
    check(`強化 ${i + 1} 段階目の費用が取得できない`, typeof cost === 'number');
    spent += cost;
    check(`強化 ${i + 1} 段階目が実行できない`, S.upgradeItem('sword_rusty') === true);
  }
  check('上限を超えて強化できてしまう', S.itemUpgradeCost('sword_rusty') === null);
  check('上限後も強化が通ってしまう', S.upgradeItem('sword_rusty') === false);
  check('強化の合計費用が想定と異なる', spent === 900);
  check('強化しても性能が上がっていない', S.effectiveItem('sword_rusty').atk > base);
  check('未所持の装備を強化できてしまう', S.upgradeItem('sword_thornblade') === false);

  // 売却して買い直すだけで強化段階が無料で復元される抜け道が無いか
  check('強化した装備を売却してもitemLevelsが残る', (() => {
    S.removeItem('sword_rusty');
    return state.itemLevels.sword_rusty === undefined;
  })());
  S.addItem('sword_rusty');
  check('買い直した装備が強化済みのまま復元されてしまう', S.itemLevel('sword_rusty') === 0);
}

// --- 装備の着脱 ---
{
  state.shards = 0;
  state.inventory = ['sword_rusty', 'armor_bark'];
  state.itemLevels = {};
  state.equipment = { weapon: null, armor: null, accessory: null };
  check('未所持の装備を着けられてしまう', S.equipItem('sword_thornblade') === false);
  check('存在しない装備IDを着けられてしまう', S.equipItem('__nonexistent__') === false);
  check('所持している装備を着けられない', S.equipItem('sword_rusty') === true);
  check('装備してもequipmentに反映されない', state.equipment.weapon === 'sword_rusty');
  check('装備してもステータスに反映されない', S.computeStats().atk > 10);

  // 装備中の防具スロットは別なので、武器の着脱に影響しないはず
  check('別スロットの装備が着けられない', S.equipItem('armor_bark') === true);
  check('武器スロットが防具で上書きされてしまう', state.equipment.weapon === 'sword_rusty');
  check('防具スロットに反映されない', state.equipment.armor === 'armor_bark');

  // 装備中のアイテムは売却できない仕様（外さないと手放せない）
  check('装備中の武器を売却できてしまう', S.removeItem('sword_rusty') === false);
  check('売却に失敗しても在庫から消えてしまう', state.inventory.includes('sword_rusty'));
  S.unequipSlot('weapon');
  check('外してもequipmentから消えない', state.equipment.weapon === null);
  check('外した後も売却できない', S.removeItem('sword_rusty') === true);
  check('売却した装備が在庫に残ってしまう', !state.inventory.includes('sword_rusty'));
}

// --- スキルの習得・リセット ---
{
  state.unlockedSkills = [];
  state.shards = 0;
  check('存在しないスキルを習得できてしまう', S.unlockSkill('__nonexistent__') === false);
  check('欠片が足りなくても習得できてしまう', S.unlockSkill('atk_up') === false);
  const before = S.computeStats().atk;
  state.shards = 30; // atk_up のコスト
  check('欠片が足りているのに習得できない', S.unlockSkill('atk_up') === true);
  check('習得後も欠片が減らない', state.shards === 0);
  check('習得してもunlockedSkillsに反映されない', state.unlockedSkills.includes('atk_up'));
  check('習得してもステータスに反映されない', S.computeStats().atk > before);
  state.shards = 999;
  check('同じスキルを二重に習得できてしまう', S.unlockSkill('atk_up') === false);
  check('二重習得の失敗で欠片が減ってしまう', state.shards === 999);

  const refund = S.resetSkills();
  check('リセットの返還額が習得コストと一致しない', refund === 30);
  check('リセット後もunlockedSkillsが残る', state.unlockedSkills.length === 0);
  check('リセットしても欠片が返還されない', state.shards === 999 + 30);
  check('リセット後もステータス効果が残る', S.computeStats().atk === before);
  check('習得済みが無い状態でのリセットが0を返さない', S.resetSkills() === 0);
}

// --- 採取コンボ ---
{
  state.collectCombo = 0;
  state.collectComboAt = 0;
  state.bestCollectCombo = 0;
  let last;
  for (let i = 0; i < 5; i++) last = S.registerCollect(1);
  check('コンボ数が加算されていない', last.combo === 5);
  check('コンボ5で倍率が上がっていない', last.mult === 1.5);
  check('最高コンボが記録されていない', state.bestCollectCombo === 5);
  // 猶予切れの再現（最後の採取時刻を過去にずらす）
  state.collectComboAt = Date.now() - S.COLLECT_COMBO_WINDOW_MS - 1;
  const after = S.registerCollect(1);
  check('猶予を過ぎてもコンボが途切れない', after.combo === 1);
  check('途切れた後も倍率が残っている', after.mult === 1);
  check('最高コンボが下がってしまう', state.bestCollectCombo === 5);
}

// --- 日替わり要素は同じ日なら常に同じ結果 ---
{
  const a = S.dailyTrial(), b = S.dailyTrial();
  check('同じ日の試練が一致しない', a.chapterIndex === b.chapterIndex && a.mod.id === b.mod.id);
  check('試練の章が範囲外', a.chapterIndex >= 0 && a.chapterIndex < CHAPTERS.length);

  const kinds = new Set();
  const weathers = new Set();
  for (let d = 0; d < 60; d++) {
    kinds.add(S.gatherRequestFor(d).id);
    weathers.add(S.weatherForDay(d).id);
  }
  check('採取依頼の種類が偏っている', kinds.size >= 3);
  check('天候が全種類出てこない', weathers.size === WEATHERS.length);
}

// --- ログインボーナス ---
// toISOString ベースの旧実装はUTC基準になり日本時間の「今日」とずれていたため、
// ローカル日付基準に統一した（試練システムと同じ localDateKey）。
{
  state.lastLoginDate = null;
  state.loginStreak = 0;
  const first = S.checkDailyLogin();
  check('初回ログインでボーナスが出ない', !!first && first.streak === 1);
  check('同じ日に二重取得できてしまう', S.checkDailyLogin() === null);
  const y = new Date(Date.now() - 86400000);
  state.lastLoginDate = `${y.getFullYear()}-${y.getMonth() + 1}-${y.getDate()}`;
  const second = S.checkDailyLogin();
  check('連日ログインでstreakが継続しない', !!second && second.streak === 2);
}

// --- 日替わりの目玉商品 ---
{
  const d1 = S.dailyDealFor(3, 10), d2 = S.dailyDealFor(3, 10);
  check('同じ日の目玉商品が一致しない', d1.index === d2.index);
  check('目玉商品の位置が範囲外', d1.index >= 0 && d1.index < 10);
  check('商品が無いときに割引が返る', S.dailyDealFor(3, 0) === null);
  const seen = new Set();
  for (let d = 0; d < 40; d++) seen.add(S.dailyDealFor(d, 10).index);
  check('目玉商品が日ごとに変わらない', seen.size >= 5);
  check('割引価格が計算できていない', S.discountedCost(100, 0.25) === 75);
  check('割引価格が0以下になる', S.discountedCost(1, 0.99) >= 1);
}

// --- 採取依頼の進行 ---
{
  state.gatherDay = -1;
  const req = S.currentGatherRequest(5);
  check('採取依頼が作られない', !!req && req.need > 0);
  check('依頼と違う種類で進んでしまう', S.advanceGather('__other__', 99) === 0);
  const before = state.shards;
  check('達成前に報酬が出てしまう', S.advanceGather(req.counter, req.need - 1) === 0);
  const reward = S.advanceGather(req.counter, 1);
  check('達成しても報酬が出ない', reward === req.reward);
  check('報酬の欠片が加算されていない', state.shards === before + req.reward);
  check('同じ日に二重で達成できてしまう', S.advanceGather(req.counter, req.need) === 0);
}

// --- 状態異常 ---
{
  S.clearStatuses();
  S.applyStatus('poison');
  S.applyStatus('curse');
  check('呪縛で与ダメージが下がらない', S.statusAtkMult() < 1);
  const dmg = S.tickStatuses();
  check('毒の継続ダメージが出ない', dmg > 0);
  let guard = 0;
  while (Object.keys(state.statuses).length > 0 && guard++ < 20) S.tickStatuses();
  check('状態異常がいつまでも切れない', Object.keys(state.statuses).length === 0);
  check('解除後も与ダメージが下がったまま', S.statusAtkMult() === 1);
}

// --- 実績は同じものを二重に解除しない ---
{
  state.achievements = [];
  state.bossesDefeated = 99;
  const first = S.checkAchievements();
  const second = S.checkAchievements();
  check('実績が1件も解除されない', first.length > 0);
  check('同じ実績が二重に解除される', second.every(a => !first.some(f => f.id === a.id)));
}

console.log(`${checks} 件の振る舞いを検査しました`);
if (problems.length > 0) {
  console.error(`\n${problems.length} 件の問題:`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log('state の振る舞いに問題はありません。');

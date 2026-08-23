#!/usr/bin/env node
/**
 * data.js / world.js のゲームデータ同士の整合性を検査する。
 *
 *   node tools/check-data.mjs
 *
 * このゲームはデータ駆動の箇所が多く、ID の打ち間違いや対応漏れは
 * 「その章に入るまで」「その商品を見るまで」気づけない。静的に潰しておく。
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { CHAPTERS, ITEMS, SKILLS, ACHIEVEMENTS, EMOTES } = await import(join(root, 'js', 'data.js'));

const problems = [];
const itemIds = new Set(Object.keys(ITEMS));
const achIds = new Set(ACHIEVEMENTS.map(a => a.id));

// --- 章 ---
const chapterKeys = new Set();
const questIds = new Set();
for (const c of CHAPTERS) {
  if (chapterKeys.has(c.key)) problems.push(`章キーが重複: ${c.key}`);
  chapterKeys.add(c.key);

  if (!(c.movesPhase1 || []).length) problems.push(`${c.key}: movesPhase1 が空です`);

  // フェーズ2を持つ章には必ず技が要る（無いと覚醒時に技を選べず戦闘が止まる）
  const hasP2Moves = (c.movesPhase2 || []).length > 0;
  if (!!c.hasPhases !== hasP2Moves) {
    problems.push(`${c.key}: hasPhases=${!!c.hasPhases} と movesPhase2(${(c.movesPhase2 || []).length}件) が対応していません`);
  }

  for (const m of [...(c.movesPhase1 || []), ...(c.movesPhase2 || [])]) {
    if (!m.name || typeof m.min !== 'number' || typeof m.max !== 'number') {
      problems.push(`${c.key}: 技「${m.name || '?'}」の定義が不完全です`);
    }
    if (m.min > m.max) problems.push(`${c.key}: 技「${m.name}」の min > max です`);
    if (!m.dodgeWindow) problems.push(`${c.key}: 技「${m.name}」に dodgeWindow がありません`);
  }

  for (const q of c.quests || []) {
    if (questIds.has(q.id)) problems.push(`クエストIDが重複: ${q.id}`);
    questIds.add(q.id);
    if (!q.title || !q.type) problems.push(`${c.key}/${q.id}: title または type がありません`);
    if (!q.reward || typeof q.reward.shards !== 'number') {
      problems.push(`${c.key}/${q.id}: reward.shards がありません`);
    } else if (q.reward.itemId && !itemIds.has(q.reward.itemId)) {
      problems.push(`${c.key}/${q.id}: 報酬アイテム "${q.reward.itemId}" が ITEMS にありません`);
    }
  }

  for (const e of c.endings || []) {
    if (!e.id || !e.title || !e.text) problems.push(`${c.key}: 結末の定義が不完全です (${e.id || '?'})`);
    if (typeof e.requiredShards !== 'number') problems.push(`${c.key}/${e.id}: requiredShards がありません`);
  }
}

// --- アイテム ---
for (const [id, item] of Object.entries(ITEMS)) {
  if (item.id !== id) problems.push(`ITEMS["${id}"] の id プロパティが "${item.id}" とずれています`);
  if (!['weapon', 'armor', 'accessory'].includes(item.slot)) {
    problems.push(`${id}: slot が不正です (${item.slot})`);
  }
}

// --- ショップ ---
// world.js は three を読み込むため node からは import できない。
// SHOP_ITEMS はプレーンな配列リテラルなのでソースから抜き出して評価する。
const worldSrc = readFileSync(join(root, 'js', 'world.js'), 'utf8');
const shopMatch = worldSrc.match(/export const SHOP_ITEMS = (\[[\s\S]*?\n\]);/);
let SHOP_ITEMS = null;
if (!shopMatch) {
  problems.push('world.js から SHOP_ITEMS を抽出できませんでした（検査の更新が必要です）');
} else {
  SHOP_ITEMS = JSON.parse(shopMatch[1].replace(/(\w+):/g, '"$1":').replace(/'/g, '"').replace(/,(\s*[\]}])/g, '$1'));
  for (const e of SHOP_ITEMS) {
    if (!itemIds.has(e.itemId)) problems.push(`ショップ: "${e.itemId}" が ITEMS にありません`);
    if (typeof e.cost !== 'number') problems.push(`ショップ: ${e.itemId} の cost がありません`);
    if (e.requiresAchievement && !achIds.has(e.requiresAchievement)) {
      problems.push(`ショップ: ${e.itemId} が存在しない実績 "${e.requiresAchievement}" を要求しています`);
    }
  }
}

// --- スキル・実績・エモート ---
const skillIds = new Set();
for (const s of SKILLS) {
  if (skillIds.has(s.id)) problems.push(`スキルIDが重複: ${s.id}`);
  skillIds.add(s.id);
  if (typeof s.cost !== 'number' || !s.effect) problems.push(`${s.id}: cost または effect がありません`);
}
const seenAch = new Set();
for (const a of ACHIEVEMENTS) {
  if (seenAch.has(a.id)) problems.push(`実績IDが重複: ${a.id}`);
  seenAch.add(a.id);
  if (!a.name || !a.desc) problems.push(`${a.id}: name または desc がありません`);
}
if (!EMOTES.length) problems.push('EMOTES が空です');

console.log(`章 ${CHAPTERS.length} / 装備 ${itemIds.size} / スキル ${SKILLS.length} / 実績 ${ACHIEVEMENTS.length} / エモート ${EMOTES.length}${SHOP_ITEMS ? ` / 商品 ${SHOP_ITEMS.length}` : ''} を検査しました`);
if (problems.length > 0) {
  console.error(`\n${problems.length} 件の問題:`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log('ゲームデータの整合性に問題はありません。');

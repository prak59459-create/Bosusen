#!/usr/bin/env node
/**
 * state.js の「既定値」「saveGame のスナップショット」「loadGame の復元」の
 * 3箇所がずれていないか検査する。
 *
 * このプロジェクトでは state に項目を足すとき 3 箇所すべてに書く必要があり、
 * 実際に書き漏らしによる不具合が何度も起きている（設定が保存されない、
 * 保存はされるが読み込まれない、など）。実行しないと気づけないため静的に検査する。
 *
 *   node tools/check-save-fields.mjs
 *
 * 恒久的に保存しない項目は TRANSIENT に列挙する（戦闘中のみ有効な値や、
 * 装備・スキルから導出する値、セッション単位で扱う値）。
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const statePath = join(dirname(fileURLToPath(import.meta.url)), '..', 'js', 'state.js');
const src = readFileSync(statePath, 'utf8');

/** 意図的に保存しない項目 */
const TRANSIENT = new Set([
  // 戦闘中のみ意味を持つ値（戦闘開始時に組み立て直す）
  'playerHP', 'playerMP', 'playerStam', 'bossHP', 'healUses', 'guarding',
  'playing', 'inSkirmish', 'turnBusy', 'combo', 'maxCombo', 'phase2',
  'turns', 'damageTaken', 'skillCooldown', 'focused',
  // 戦闘開始時に固定する難易度スナップショット
  'battleDifficulty',
  // 再挑戦中の復帰先。進行度は chapterIndex として書き出すため単独では保存しない
  'replayReturnChapter',
  // 装備・スキルから導出するため保存不要
  'exploreStaminaMax',
  // セッション内の経過時間を基準にするため保存しない
  'lastBlessingDay',
  // 進行中の採取コンボ。最高記録 bestCollectCombo だけを保存する
  'collectCombo', 'collectComboAt',
  // 戦闘開始時に確定する試練の適用状態
  'trialActive',
]);

/** state ではなくスナップショットにのみ書き出すメタ情報 */
const SAVE_ONLY = new Set(['savedAt']);

/** オブジェクトリテラルの最上位キーを取り出す */
function topLevelKeys(startPattern) {
  const m = src.match(startPattern);
  if (!m) return null;
  const open = src.indexOf('{', m.index);
  let depth = 0, end = open;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
  }
  const keys = new Set();
  let nesting = 0;
  for (const line of src.slice(open + 1, end).split('\n')) {
    const trimmed = line.trim();
    if (nesting === 0) {
      const km = trimmed.match(/^(\w+)\s*:/);
      if (km) keys.add(km[1]);
    }
    nesting += (line.match(/[{[]/g) || []).length - (line.match(/[}\]]/g) || []).length;
  }
  return keys;
}

const defaults = topLevelKeys(/export const state = /);
const saved = topLevelKeys(/const snapshot = /);
const restored = topLevelKeys(/Object\.assign\(state, \{[\s\S]*?chapterIndex: asChapterIndex/);

if (!defaults || !saved || !restored) {
  console.error('state.js の構造を解析できませんでした（正規表現の見直しが必要です）');
  process.exit(1);
}

const problems = [];
for (const key of defaults) {
  if (TRANSIENT.has(key)) continue;
  if (!saved.has(key)) problems.push(`${key}: 既定値にあるが saveGame で保存されていません`);
}
for (const key of saved) {
  if (SAVE_ONLY.has(key)) continue;
  if (!restored.has(key)) problems.push(`${key}: 保存されているが loadGame で復元されていません`);
  if (!defaults.has(key)) problems.push(`${key}: 保存されているが state の既定値にありません`);
}
for (const key of TRANSIENT) {
  if (saved.has(key)) problems.push(`${key}: 保存対象外のはずが saveGame に含まれています`);
}

console.log(`既定値 ${defaults.size} / 保存 ${saved.size} / 復元 ${restored.size} 項目を検査しました`);
if (problems.length > 0) {
  console.error(`\n${problems.length} 件の不一致:`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log('保存・復元の対応に漏れはありません。');

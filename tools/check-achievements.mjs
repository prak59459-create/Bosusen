#!/usr/bin/env node
/**
 * 実績の配線を検査する。
 *
 *   node tools/check-achievements.mjs
 *
 * 1. data.js の全実績に state.js の判定（tryUnlock）があるか
 *    → 判定が無い実績は永久に解除できず、completionist も達成不能になる
 * 2. tryUnlock が存在しない ID を指していないか（改名・削除の取りこぼし）
 * 3. ui.js の ACH_PROGRESS（進捗バー）が実在する実績を指しているか
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { ACHIEVEMENTS } = await import(join(root, 'js', 'data.js'));

const stateSrc = readFileSync(join(root, 'js', 'state.js'), 'utf8');
const uiSrc = readFileSync(join(root, 'js', 'ui.js'), 'utf8');

const ids = new Set(ACHIEVEMENTS.map(a => a.id));
const problems = [];

// completionist は「他の全実績」を条件とするため tryUnlock の網羅対象から外す
const SPECIAL = new Set(['completionist']);

const unlocked = [...stateSrc.matchAll(/tryUnlock\('([^']+)'\)/g)].map(m => m[1]);
const unlockedSet = new Set(unlocked);

for (const a of ACHIEVEMENTS) {
  if (SPECIAL.has(a.id)) continue;
  if (!unlockedSet.has(a.id)) {
    problems.push(`${a.id}（${a.name}）: state.js に解除判定がありません`);
  }
}
for (const id of unlockedSet) {
  if (!ids.has(id)) problems.push(`${id}: tryUnlock されていますが data.js に定義がありません`);
}

// ACH_PROGRESS の各キーが実在するか
const progBlock = uiSrc.match(/const ACH_PROGRESS = \{([\s\S]*?)\n    \};/);
if (progBlock) {
  const keys = [...progBlock[1].matchAll(/^\s{6}(\w+):/gm)].map(m => m[1]);
  for (const k of keys) {
    if (!ids.has(k)) problems.push(`${k}: ACH_PROGRESS にありますが実績として存在しません`);
  }
  console.log(`実績 ${ACHIEVEMENTS.length} 件 / 解除判定 ${unlockedSet.size} 件 / 進捗バー ${keys.length} 件を検査しました`);
} else {
  problems.push('ui.js の ACH_PROGRESS を解析できませんでした');
}

if (problems.length > 0) {
  console.error(`\n${problems.length} 件の問題:`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log('実績の配線に問題はありません。');

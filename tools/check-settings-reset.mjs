#!/usr/bin/env node
/**
 * 設定画面の各項目が「設定を初期値に戻す」の対象に入っているか検査する。
 *
 *   node tools/check-settings-reset.mjs
 *
 * 設定を追加するとき、state の3箇所（既定値・保存・復元）に加えて
 * リセット一覧にも登録する必要があり、実際に何度か登録漏れが起きている。
 * 漏れても普段は動くため、リセットを押すまで気づけない。
 *
 * 対応関係は ui.js の `state.X = ...Checkbox.checked` などの代入から求める。
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'index.html'), 'utf8');
const ui = readFileSync(join(root, 'js', 'ui.js'), 'utf8');

/** リセット対象にしない設定（理由を添えて明示する） */
const EXCLUDED = new Map([
  ['companionName', 'プレイヤーが付けた名前のため、設定リセットでは消さない'],
]);

// 1. 設定画面にあるコントロール（末尾 -val はスライダーの数値ラベルなので除く）
const controlIds = [...new Set(
  [...html.matchAll(/id="(opt-[a-z-]+)"/g)].map(m => m[1]).filter(id => !id.endsWith('-val'))
)];

// 2. ui.js から「コントロール変数 -> state のキー」を求める
//    例: const fooCheckbox = document.getElementById('opt-foo');
//        state.someKey = fooCheckbox.checked;
const varOfId = new Map();
for (const m of ui.matchAll(/(?:const|let)\s+(\w+)\s*=\s*document\.getElementById\('(opt-[a-z-]+)'\)/g)) {
  if (!varOfId.has(m[2])) varOfId.set(m[2], m[1]);
}
const keyOfId = new Map();
for (const [id, varName] of varOfId) {
  const re = new RegExp(`state\\.(\\w+)\\s*=\\s*(?:parseFloat\\(|parseInt\\(|Number\\()?\\s*${varName}\\b`);
  const m = ui.match(re);
  if (m) keyOfId.set(id, m[1]);
}

// 3. リセット一覧のキー
const resetBlock = ui.match(/masterVolume: 0\.7[\s\S]*?\n\s*\}\);/);
if (!resetBlock) {
  console.error('ui.js のリセット一覧を解析できませんでした（検査の更新が必要です）');
  process.exit(1);
}
const resetKeys = new Set([...resetBlock[0].matchAll(/(\w+):/g)].map(m => m[1]));

const problems = [];
const unresolved = [];
for (const id of controlIds) {
  const key = keyOfId.get(id);
  if (!key) { unresolved.push(id); continue; }
  if (EXCLUDED.has(key)) continue;
  if (!resetKeys.has(key)) {
    problems.push(`${id} (state.${key}): 「設定を初期値に戻す」の対象に入っていません`);
  }
}

console.log(`設定 ${controlIds.length} 件 / 対応を特定 ${keyOfId.size} 件 / リセット対象 ${resetKeys.size} 件`);
if (unresolved.length) {
  console.log(`  ※ state キーを特定できず未検査: ${unresolved.join(', ')}`);
}
if (problems.length > 0) {
  console.error(`\n${problems.length} 件の問題:`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log('設定リセットの対象に漏れはありません。');

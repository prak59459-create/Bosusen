#!/usr/bin/env node
/**
 * まとめて静的検査を走らせる入口。
 *
 *   node tools/check-all.mjs
 *
 * 1. js/ 配下すべての構文チェック（node --check）
 * 2. 相対 import が実在する export を指しているか
 * 3. state の既定値・保存・復元の対応漏れ
 * 4. 実績の定義・解除判定・進捗バーの対応
 * 5. 章・装備・スキル・ショップなどデータ間の参照整合性
 * 6. 設定項目が「設定を初期値に戻す」の対象に入っているか
 *
 * バンドラもテストランナーも使わない構成なので、変更後にこれを通すことで
 * 「実行して該当画面に行くまで気づけない」種類の壊れ方を早期に検出する。
 * どれか一つでも失敗すれば終了コード 1 を返す。
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];

function run(label, cmd, args) {
  const res = spawnSync(cmd, args, { cwd: root, encoding: 'utf8' });
  const ok = res.status === 0;
  console.log(`${ok ? '✅' : '❌'} ${label}`);
  if (!ok) {
    const out = `${res.stdout || ''}${res.stderr || ''}`.trimEnd();
    if (out) console.log(out.split('\n').map(l => `    ${l}`).join('\n'));
    failures.push(label);
  }
  return ok;
}

// 1. 構文チェック
// 注意: `node --check foo.js` は、ファイルが ESM の import を含むと
// 構文エラーがあっても終了コード 0 を返してしまう（CommonJS として解釈できず
// 判定が短絡するため）。ESM として確実に検査するため stdin + --input-type=module を使う。
const jsFiles = readdirSync(join(root, 'js')).filter(f => f.endsWith('.js'));
const syntaxBad = [];
for (const f of jsFiles) {
  const res = spawnSync(process.execPath, ['--check', '--input-type=module'], {
    cwd: root, encoding: 'utf8', input: readFileSync(join(root, 'js', f), 'utf8'),
  });
  if (res.status !== 0) {
    syntaxBad.push(f);
    console.log(`❌ 構文エラー: js/${f}`);
    console.log((res.stderr || '').trimEnd().split('\n').map(l => `    ${l}`).join('\n'));
  }
}
if (syntaxBad.length === 0) console.log(`✅ 構文チェック（js/ ${jsFiles.length} ファイル）`);
else failures.push('構文チェック');

// 2. import/export の整合性
run('import/export の整合性', process.execPath, ['tools/check-imports.mjs']);

// 3. セーブ項目の対応
run('セーブ項目の対応', process.execPath, ['tools/check-save-fields.mjs']);

// 4. 実績の配線
run('実績の配線', process.execPath, ['tools/check-achievements.mjs']);

// 5. ゲームデータの整合性
run('ゲームデータの整合性', process.execPath, ['tools/check-data.mjs']);

// 6. 設定リセットの網羅
run('設定リセットの網羅', process.execPath, ['tools/check-settings-reset.mjs']);

console.log('');
if (failures.length > 0) {
  console.error(`${failures.length} 件の検査が失敗しました: ${failures.join(', ')}`);
  process.exit(1);
}
console.log('すべての検査に通りました。');

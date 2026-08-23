#!/usr/bin/env node
/**
 * js/ 配下の相対 import が実在する export を指しているか静的に検査する。
 *
 * このプロジェクトはバンドラを使わずブラウザが直接 ES モジュールを読むため、
 * 存在しない名前を import しても実行するまで気づけない。
 * モジュール間で定義を移動したときの取りこぼしを防ぐのが目的。
 *
 *   node tools/check-imports.mjs
 *
 * 問題があれば一覧を表示して終了コード 1 を返す。
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const jsDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'js');
const files = readdirSync(jsDir).filter(f => f.endsWith('.js'));

// 各モジュールが公開している名前を集める
const exportsOf = new Map();
for (const file of files) {
  const src = readFileSync(join(jsDir, file), 'utf8');
  const names = new Set();
  for (const m of src.matchAll(/export\s+(?:async\s+)?function\s+(\w+)/g)) names.add(m[1]);
  for (const m of src.matchAll(/export\s+(?:const|let|var)\s+(\w+)/g)) names.add(m[1]);
  for (const m of src.matchAll(/export\s*\{([^}]+)\}/g)) {
    for (const part of m[1].split(',')) {
      const name = part.trim().split(/\s+as\s+/).pop().trim();
      if (name) names.add(name);
    }
  }
  exportsOf.set(file, names);
}

// 相対 import のみ検査する（three などの外部モジュールは対象外）
const problems = [];
let checked = 0;
for (const file of files) {
  const src = readFileSync(join(jsDir, file), 'utf8');
  for (const m of src.matchAll(/import\s*\{([^{}]+)\}\s*from\s*'\.\/([\w.-]+\.js)'/g)) {
    const target = m[2];
    if (!exportsOf.has(target)) {
      problems.push(`${file} -> ${target}: モジュールが見つかりません`);
      continue;
    }
    for (const part of m[1].split(',')) {
      const name = part.trim().split(/\s+as\s+/)[0].trim();
      if (!name) continue;
      checked++;
      if (!exportsOf.get(target).has(name)) {
        problems.push(`${file}: { ${name} } を ${target} から import していますが export されていません`);
      }
    }
  }
}

// 逆方向の検査: 他モジュールの export を import せずに使っていないか。
// （import 文の書き忘れは実行するまで ReferenceError にならず気づけない）
let usageChecked = 0;
const allExports = new Map(); // 名前 -> それを export しているモジュール
for (const [file, names] of exportsOf) {
  for (const n of names) {
    if (!allExports.has(n)) allExports.set(n, []);
    allExports.get(n).push(file);
  }
}
for (const file of files) {
  const src = readFileSync(join(jsDir, file), 'utf8');
  const imported = new Set();
  for (const m of src.matchAll(/import\s*(?:\*\s*as\s+(\w+)|\{([^{}]*)\}|(\w+))\s*from/g)) {
    if (m[1]) imported.add(m[1]);
    if (m[3]) imported.add(m[3]);
    if (m[2]) {
      for (const part of m[2].split(',')) {
        const name = part.trim().split(/\s+as\s+/).pop().trim();
        if (name) imported.add(name);
      }
    }
  }
  const own = exportsOf.get(file);
  for (const [name, owners] of allExports) {
    if (own.has(name) || imported.has(name)) continue;
    if (owners.includes(file)) continue;
    // 識別子として使われているか（プロパティ参照や文字列は除く）
    const used = new RegExp(`(^|[^.\\w'"\`])${name}\\s*\\(`, 'm').test(src);
    if (used) {
      usageChecked++;
      problems.push(`${file}: ${name}() を使っていますが import されていません（${owners.join(', ')} が export）`);
    }
  }
}

console.log(`${files.length} モジュール / ${checked} 件の named import を検査しました`);
if (problems.length > 0) {
  console.error(`\n${problems.length} 件の問題:`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log('問題は見つかりませんでした。');

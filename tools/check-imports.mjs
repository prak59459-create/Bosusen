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

console.log(`${files.length} モジュール / ${checked} 件の named import を検査しました`);
if (problems.length > 0) {
  console.error(`\n${problems.length} 件の問題:`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log('問題は見つかりませんでした。');

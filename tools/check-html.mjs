#!/usr/bin/env node
/**
 * index.html の静的なミスを検査する。
 *
 *   node tools/check-html.mjs
 *
 * 1. id 属性の重複（重複すると document.getElementById は最初の1件しか
 *    返さず、後から追加した要素側の機能が黙って動かなくなる）
 * 2. <label for="..."> が実在する id を指しているか（コピペで追加した
 *    フォーム項目でよくある取りこぼし。スクリーンリーダー利用者だけが
 *    気づけない壊れ方になる）
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'index.html'), 'utf8');
const problems = [];

// --- id の重複 ---
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
const idSet = new Set();
const dupIds = new Set();
for (const id of ids) {
  if (idSet.has(id)) dupIds.add(id);
  idSet.add(id);
}
for (const id of dupIds) problems.push(`id="${id}" が複数の要素で重複しています`);

// --- label for の対応 ---
const labelFors = [...html.matchAll(/<label[^>]*\bfor="([^"]+)"/g)].map(m => m[1]);
for (const forId of labelFors) {
  if (!idSet.has(forId)) problems.push(`<label for="${forId}"> が指す id="${forId}" が存在しません`);
}

console.log(`id属性 ${ids.length} 件 / label[for] ${labelFors.length} 件を検査しました`);
if (problems.length > 0) {
  console.error(`\n${problems.length} 件の問題:`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log('index.html の静的な整合性に問題はありません。');

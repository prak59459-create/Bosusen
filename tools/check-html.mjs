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
 * 3. アイコンのみの<button>にaria-labelが無いもの、alt属性の無い<img>
 *    （見た目には何も問題が無く、スクリーンリーダー利用者だけが
 *    気づけない壊れ方になるため、見逃しやすい）
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

// --- アイコンのみのbuttonにアクセシブルな名前が無いもの ---
// 絵文字はスクリーンリーダーの読み上げに頼れない（機種依存・読み上げが無いことも
// 多い）ため、絵文字だけが残る場合もテキストが無いのと同様に扱う
const stripEmoji = s => s.replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, '').trim();
let buttonCount = 0;
for (const m of html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)) {
  buttonCount++;
  const attrs = m[1];
  const inner = m[2];
  if (/\baria-label="/.test(attrs)) continue;
  const text = stripEmoji(inner.replace(/<[^>]+>/g, ''));
  if (!text) {
    const idMatch = attrs.match(/\bid="([^"]+)"/);
    problems.push(`<button${idMatch ? ` id="${idMatch[1]}"` : ''}> がテキストもaria-labelも無いアイコンのみのボタンです`);
  }
}

// --- alt属性の無い<img> ---
let imgCount = 0;
for (const m of html.matchAll(/<img\b([^>]*)>/g)) {
  imgCount++;
  if (!/\balt="/.test(m[1])) {
    const idMatch = m[1].match(/\bid="([^"]+)"/);
    problems.push(`<img${idMatch ? ` id="${idMatch[1]}"` : ''}> にalt属性がありません`);
  }
}

console.log(`id属性 ${ids.length} 件 / label[for] ${labelFors.length} 件 / button ${buttonCount} 件 / img ${imgCount} 件を検査しました`);
if (problems.length > 0) {
  console.error(`\n${problems.length} 件の問題:`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log('index.html の静的な整合性に問題はありません。');

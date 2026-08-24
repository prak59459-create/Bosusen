#!/usr/bin/env node
/**
 * css/*.css の構文（括弧の対応・コメントの閉じ忘れ）を検査する。
 *
 *   node tools/check-css.mjs
 *
 * CSSはJSと違い、壊れた記述があってもエラーにならず黙って無視されるだけ
 * （ブラウザのパーサが極めて寛容なため）。閉じ括弧の数が合わない・
 * コメントが閉じていないといったミスは、そこから先のルールがまとめて
 * 効かなくなる/意図しない範囲がコメントアウトされるといった壊れ方をするが、
 * コンソールにも一切出ないため画面を実際に見るまで気づけない。
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const files = ['css/style.css', 'css/menu.css'];
const problems = [];

for (const rel of files) {
  const text = readFileSync(join(root, rel), 'utf8');

  // コメントの閉じ忘れ検出（/* の数と */ の数が合わない、または最後に開いたまま残る）
  const opens = [...text.matchAll(/\/\*/g)].length;
  const closes = [...text.matchAll(/\*\//g)].length;
  if (opens !== closes) {
    problems.push(`${rel}: /* と */ の数が一致しません（/* ${opens}件 / */ ${closes}件）`);
  }

  // コメントを取り除いた上で { } の対応を検査する
  const stripped = text.replace(/\/\*[\s\S]*?\*\//g, '');
  let depth = 0;
  let line = 1;
  let firstMismatchLine = null;
  for (const ch of stripped) {
    if (ch === '\n') line++;
    else if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth < 0 && firstMismatchLine === null) firstMismatchLine = line;
    }
  }
  if (firstMismatchLine !== null) {
    problems.push(`${rel}: ${firstMismatchLine}行目付近に対応しない "}" があります`);
  } else if (depth !== 0) {
    problems.push(`${rel}: "{" が ${depth} 個閉じられていません`);
  }
}

console.log(`css/*.css ${files.length} ファイルを検査しました`);
if (problems.length > 0) {
  console.error(`\n${problems.length} 件の問題:`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log('CSSの構文に問題はありません。');

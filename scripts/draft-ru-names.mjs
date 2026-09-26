#!/usr/bin/env node
// Генератор черновых русских переводов: dist/exercises.json -> i18n/ru/<id>.json
//
// Использование:
//   node scripts/draft-ru-names.mjs            # создать только отсутствующие файлы
//   node scripts/draft-ru-names.mjs --force    # перезаписать существующие черновики
//   node scripts/draft-ru-names.mjs --report   # только отчёт в stdout, без записи
//
// Файлы со статусами "reviewed"/"do_not_translate" никогда не перезаписываются.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { translateName, makeDraftRecord, upstreamKeywords } from './lib/translate.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distFile = path.join(root, 'dist', 'exercises.json');
const ruDir = path.join(root, 'i18n', 'ru');
const previewFile = path.join(root, 'scripts', '_ru_preview.txt');

const args = new Set(process.argv.slice(2));
const force = args.has('--force');
const reportOnly = args.has('--report');

const exercises = JSON.parse(fs.readFileSync(distFile, 'utf8'));
fs.mkdirSync(ruDir, { recursive: true });

const rows = [];
let created = 0;
let skippedReviewed = 0;
let needsReview = 0;

for (const ex of exercises) {
  const id = ex.id;
  const t = translateName(ex.name);
  const status = t.status || (t.source === 'override' ? 'machine_draft' : undefined);
  const record = makeDraftRecord(id, ex.name, t.name, status, t.notes, upstreamKeywords(ex));

  const dest = path.join(ruDir, `${id}.json`);
  const flag = record.review_status === 'needs_review' ? '??' : '  ';
  rows.push(`${flag} ${ex.name}\n   -> ${record.name} [${record.review_status}]`);

  if (record.review_status === 'needs_review') needsReview++;
  if (reportOnly) continue;

  if (fs.existsSync(dest)) {
    const old = JSON.parse(fs.readFileSync(dest, 'utf8'));
    if ((old.review_status === 'reviewed' || old.review_status === 'do_not_translate') && !force) {
      skippedReviewed++;
      continue;
    }
    if (!force) continue; // по умолчанию не трогаем существующие черновики
  }
  fs.writeFileSync(dest, JSON.stringify(record, null, 2) + '\n', 'utf8');
  created++;
}

if (!reportOnly) {
  fs.writeFileSync(previewFile, rows.join('\n') + '\n', 'utf8');
}

const total = exercises.length;
console.log(`Всего упражнений:      ${total}`);
console.log(`Создано/обновлено:     ${created}`);
console.log(`Пропущено (reviewed):  ${skippedReviewed}`);
console.log(`Требуют ревью:         ${needsReview}`);
if (needsReview > 0) {
  console.log('\nНазвания со статусом needs_review:');
  for (const r of rows) if (r.startsWith('??')) console.log(r);
}
if (reportOnly) {
  console.log(`\nПолный превью: ${previewFile} (файл не записывался при --report)`);
}

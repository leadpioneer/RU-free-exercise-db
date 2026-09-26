#!/usr/bin/env node
// Вливает перевод инструкций из батчей в сайдкары i18n/ru/<id>.json.
//
// Формат файла перевода (имя обязано начинаться с "ru-",
// например ru-batch-03.json, рядом должен лежать batch-03.json):
// { "<id>": ["шаг 1", "шаг 2", ...], ... }
// Массив — строго в порядке pending-шагов из батча (пропущенные индексы
// автоматически заполняются из common-словаря).
//
// Использование:
//   node scripts/apply-instructions.mjs                    # все ru-batch-*.json
//   node scripts/apply-instructions.mjs work/instructions/ru-batch-01.json
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { COMMON_INSTRUCTIONS, keyOf } from './lib/instructions-common.mjs';
import { leftoverLatin } from './lib/translate.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distFile = path.join(root, 'dist', 'exercises.json');
const ruDir = path.join(root, 'i18n', 'ru');
const workDir = path.join(root, 'work', 'instructions');

const args = process.argv.slice(2);
const statusArg = args.indexOf('--status');
const instructionsStatus = statusArg > -1 ? args[statusArg + 1] : null;
if (instructionsStatus && !['machine', 'reviewed'].includes(instructionsStatus)) {
  console.error(`--status: допустимые значения machine | reviewed, получено "${instructionsStatus}"`);
  process.exit(1);
}
const positional = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--status') { i++; continue; }
  if (!args[i].startsWith('-')) positional.push(args[i]);
}
const exercises = new Map(JSON.parse(fs.readFileSync(distFile, 'utf8')).map((e) => [e.id, e]));

let files = [];
if (positional.length) files = positional.map((a) => path.resolve(a));
else if (fs.existsSync(workDir))
  files = fs
    .readdirSync(workDir)
    .filter((f) => /^ru-batch-\d+\.json$/.test(f))
    .map((f) => path.join(workDir, f));

if (!files.length) {
  console.log('Нет файлов перевода (ru-batch-*.json) — нечего применять.');
  process.exit(0);
}

const errors = [];
let appliedExercises = 0;
let appliedSteps = 0;

for (const ruFile of files) {
  const base = path.basename(ruFile); // ru-batch-03.json
  const batchBase = base.replace(/^ru-/, ''); // batch-03.json
  const batchFile = path.join(path.dirname(ruFile), batchBase);
  if (!fs.existsSync(batchFile)) {
    errors.push(`${base}: не найден соответствующий ${batchBase}`);
    continue;
  }
  const batch = JSON.parse(fs.readFileSync(batchFile, 'utf8'));
  const pendingBy = new Map(batch.exercises.map((e) => [e.id, e]));
  const translations = JSON.parse(fs.readFileSync(ruFile, 'utf8'));

  for (const [id, ruSteps] of Object.entries(translations)) {
    const ex = exercises.get(id);
    const item = pendingBy.get(id);
    if (!ex) { errors.push(`${base}: "${id}" отсутствует в upstream`); continue; }
    if (!item) { errors.push(`${base}: "${id}" нет в ${batchBase}`); continue; }
    if (!Array.isArray(ruSteps) || ruSteps.some((s) => typeof s !== 'string' || !s.trim())) {
      errors.push(`${base}: "${id}" — пустые или нестроковые шаги`);
      continue;
    }
    if (ruSteps.length !== item.steps.length) {
      errors.push(
        `${base}: "${id}" — шагов ${ruSteps.length}, а в батче ${item.steps.length} (нужен порядок 1:1)`
      );
      continue;
    }

    const full = new Array(ex.instructions.length);
    // автозаполнение из common-словаря по всем шагам upstream
    ex.instructions.forEach((s, i) => {
      const hit = COMMON_INSTRUCTIONS[keyOf(s)];
      if (hit) full[i] = hit;
    });
    // поверх — ручной перевод pending-шагов (порядок 1:1 с батчем)
    item.steps.forEach((p, j) => { full[p.i] = ruSteps[j].trim(); });
    // ВАЖНО: some() пропускает пустые слоты разрежённого массива —
    // полноту проверяем прямым перебором индексов
    let incomplete = false;
    for (let i = 0; i < full.length; i++) {
      if (!full[i]) {
        errors.push(`${base}: "${id}" — не заполнен шаг №${i + 1}`);
        incomplete = true;
      }
    }
    if (incomplete) continue;

    for (const s of full) {
      const lat = leftoverLatin(s);
      if (lat) console.warn(`ПРЕДУПРЕЖДЕНИЕ: ${id}: возможна непереведённая вставка "${lat}"`);
    }

    const sidecarPath = path.join(ruDir, `${id}.json`);
    const rec = JSON.parse(fs.readFileSync(sidecarPath, 'utf8'));
    rec.instructions_ru = full;
    if (instructionsStatus) rec.instructions_status = instructionsStatus;
    fs.writeFileSync(sidecarPath, JSON.stringify(rec, null, 2) + '\n', 'utf8');
    appliedExercises++;
    appliedSteps += full.length;
  }

  // батч применён целиком — удаляем оба файла
  const ids = new Set(batch.exercises.map((e) => e.id));
  const allTranslated = [...ids].every((id) => translations[id]);
  const noErrors = !errors.some((e) => e.startsWith(`${base}:`));
  if (allTranslated && noErrors) {
    fs.unlinkSync(batchFile);
    fs.unlinkSync(ruFile);
  }
}

console.log(`Применено: ${appliedExercises} упражнений, ${appliedSteps} шагов.`);
if (errors.length) {
  console.error(`ОШИБКИ (${errors.length}):`);
  for (const e of errors) console.error('  ' + e);
  process.exit(1);
}

#!/usr/bin/env node
// Нарезает непереведённые инструкции на батчи для ручного перевода.
// Шаги, целиком покрытые словарём common (instructions-common.mjs),
// переводятся автоматически сразу (если у упражнения не осталось
// непокрытых шагов — сайдкар обновляется без батча).
//
// Использование:
//   node scripts/extract-instructions.mjs            # батчи по ~30 упражнений
//   node scripts/extract-instructions.mjs --size 20  # свой размер батча
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { COMMON_INSTRUCTIONS, keyOf } from './lib/instructions-common.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distFile = path.join(root, 'dist', 'exercises.json');
const ruDir = path.join(root, 'i18n', 'ru');
const workDir = path.join(root, 'work', 'instructions');

const sizeArg = process.argv.indexOf('--size');
const batchSize = sizeArg > -1 ? Number(process.argv[sizeArg + 1]) || 30 : 30;

const exercises = JSON.parse(fs.readFileSync(distFile, 'utf8'));
fs.mkdirSync(workDir, { recursive: true });

const CAT_ORDER = [
  'cardio',
  'strongman',
  'olympic weightlifting',
  'powerlifting',
  'plyometrics',
  'stretching',
  'strength',
];
const catRank = (c) => {
  const i = CAT_ORDER.indexOf(c);
  return i === -1 ? CAT_ORDER.length : i;
};

let alreadyDone = 0;
let autoApplied = 0;
let pendingExercises = [];

for (const ex of exercises) {
  const sidecarPath = path.join(ruDir, `${ex.id}.json`);
  if (!fs.existsSync(sidecarPath)) continue;
  const rec = JSON.parse(fs.readFileSync(sidecarPath, 'utf8'));
  if (Array.isArray(rec.instructions_ru) && rec.instructions_ru.length === ex.instructions.length) {
    alreadyDone++;
    continue;
  }

  const auto = [];
  const pending = [];
  ex.instructions.forEach((s, i) => {
    const hit = COMMON_INSTRUCTIONS[keyOf(s)];
    if (hit) auto[i] = hit;
    else pending.push({ i, en: s });
  });

  if (pending.length === 0) {
    rec.instructions_ru = auto;
    fs.writeFileSync(sidecarPath, JSON.stringify(rec, null, 2) + '\n', 'utf8');
    autoApplied++;
    continue;
  }
  pendingExercises.push({ id: ex.id, category: ex.category, total: ex.instructions.length, steps: pending });
}

// сортировка и нарезка на батчи
pendingExercises.sort((a, b) => catRank(a.category) - catRank(b.category) || a.id.localeCompare(b.id));

// старые батчи перезаписываем
for (const f of fs.readdirSync(workDir)) {
  if (/^batch-\d+\.json$/.test(f)) fs.unlinkSync(path.join(workDir, f));
}

const batches = [];
for (let i = 0; i < pendingExercises.length; i += batchSize) {
  batches.push(pendingExercises.slice(i, i + batchSize));
}
batches.forEach((items, idx) => {
  const name = `batch-${String(idx + 1).padStart(2, '0')}`;
  const file = path.join(workDir, `${name}.json`);
  fs.writeFileSync(
    file,
    JSON.stringify({ batch: name, exercises: items }, null, 2) + '\n',
    'utf8'
  );
});

const pendingSteps = pendingExercises.reduce((n, e) => n + e.steps.length, 0);
console.log(`Упражнений:                 ${exercises.length}`);
console.log(`Инструкции уже переведены:  ${alreadyDone}`);
console.log(`Переведено из common-словаря: ${autoApplied}`);
console.log(`Осталось упражнений:        ${pendingExercises.length} (${pendingSteps} шагов)`);
console.log(`Батчей создано:             ${batches.length} по ${batchSize} в work/instructions/`);

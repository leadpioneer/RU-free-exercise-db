#!/usr/bin/env node
// Сборка dist/exercises.ru.json: merge upstream (exercises/*.json) + локализация (i18n/ru/*.json).
// Формат: upstream-запись полностью сохраняется + добавляются name_ru, aliases_ru, review_status.
// Использование:
//   node scripts/generate-ru-dist.mjs                     # строго: все 876 должны быть переведены
//   node scripts/generate-ru-dist.mjs --allow-missing     # пропустить непереведённые
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeAlias, deriveRuAliases, upstreamKeywords } from './lib/translate.mjs';
import {
  FORCE_RU,
  LEVEL_RU,
  MECHANIC_RU,
  EQUIPMENT_RU,
  CATEGORY_RU,
  MUSCLES_RU,
  enumRu,
} from './lib/enums-ru.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const exercisesDir = path.join(root, 'exercises');
const ruDir = path.join(root, 'i18n', 'ru');
const outFile = path.join(root, 'dist', 'exercises.ru.json');

const allowMissing = process.argv.includes('--allow-missing');

// тот же порядок источников, что и в upstream Makefile: sort (wildcard ./exercises/**.json)
const files = fs
  .readdirSync(exercisesDir)
  .filter((f) => f.endsWith('.json'))
  .sort();

const merged = [];
const errors = [];
let missing = 0;

for (const file of files) {
  const ex = JSON.parse(fs.readFileSync(path.join(exercisesDir, file), 'utf8'));
  const ruFile = path.join(ruDir, `${ex.id}.json`);
  if (!fs.existsSync(ruFile)) {
    missing++;
    errors.push(`Нет локализации: ${ex.id} (ожидался ${path.relative(root, ruFile)})`);
    continue;
  }
  const ru = JSON.parse(fs.readFileSync(ruFile, 'utf8'));
  if (ru.id !== ex.id) {
    errors.push(`id не совпадает в ${path.relative(root, ruFile)}: "${ru.id}" != "${ex.id}"`);
    continue;
  }

  // алиасы для поиска: выведенные из русского названия (короткая форма,
  // ключевые слова движения) + ключевые слова инвентаря/мышц из upstream
  // + русские алиасы сайдкара + ё/е-вариант + английское название;
  // дедупликация без учёта регистра и с нормализацией ё
  const aliases = new Map(); // normalized -> original
  const add = (a) => {
    const key = normalizeAlias(a);
    // точное совпадение с именем не дублируем, но ё-вариант имени сохраняем
    if (!key || a === ru.name) return;
    if (!aliases.has(key)) aliases.set(key, a);
  };
  for (const a of deriveRuAliases(ru.name)) add(a);
  for (const a of upstreamKeywords(ex)) add(a);
  for (const a of ru.aliases || []) {
    add(a);
    if (/ё/i.test(a)) add(a.replace(/ё/g, 'е'));
  }
  add(ex.name.toLowerCase());

  // русские перечисления; непереведённое значение — ошибка сборки
  const ruMuscles = (arr) =>
    arr.map((m) => {
      const r = enumRu(MUSCLES_RU, m);
      if (!r) errors.push(`Нет перевода мышцы: "${m}" (${ex.id})`);
      return r;
    });
  const levelRu = enumRu(LEVEL_RU, ex.level);
  if (!levelRu) errors.push(`Нет перевода level: "${ex.level}" (${ex.id})`);
  const categoryRu = enumRu(CATEGORY_RU, ex.category);
  if (!categoryRu) errors.push(`Нет перевода category: "${ex.category}" (${ex.id})`);
  if (ex.equipment != null && !EQUIPMENT_RU[ex.equipment])
    errors.push(`Нет перевода equipment: "${ex.equipment}" (${ex.id})`);
  if (ex.force != null && !FORCE_RU[ex.force])
    errors.push(`Нет перевода force: "${ex.force}" (${ex.id})`);
  if (ex.mechanic != null && !MECHANIC_RU[ex.mechanic])
    errors.push(`Нет перевода mechanic: "${ex.mechanic}" (${ex.id})`);

  merged.push({
    ...ex,
    name_ru: ru.name,
    aliases_ru: [...aliases.values()],
    review_status: ru.review_status,
    level_ru: levelRu,
    category_ru: categoryRu,
    force_ru: enumRu(FORCE_RU, ex.force),
    mechanic_ru: enumRu(MECHANIC_RU, ex.mechanic),
    equipment_ru: enumRu(EQUIPMENT_RU, ex.equipment),
    primaryMuscles_ru: ruMuscles(ex.primaryMuscles),
    secondaryMuscles_ru: ruMuscles(ex.secondaryMuscles),
    ...(Array.isArray(ru.instructions_ru) ? { instructions_ru: ru.instructions_ru } : {}),
    ...(ru.instructions_status ? { instructions_status: ru.instructions_status } : {}),
  });
}

if (missing > 0 && !allowMissing) {
  console.error(
    `ОШИБКА: отсутствует локализация для ${missing} упражнений. Запустите scripts/draft-ru-names.mjs или используйте --allow-missing.`
  );
  for (const e of errors) console.error('  ' + e);
  process.exit(1);
}

fs.writeFileSync(outFile, JSON.stringify(merged, null, 2) + '\n', 'utf8');
console.log(`Записано: ${path.relative(root, outFile)} (${merged.length} упражнений)`);
if (missing > 0) console.warn(`ПРЕДУПРЕЖДЕНИЕ: пропущено без локализации: ${missing}`);

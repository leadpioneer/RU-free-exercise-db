#!/usr/bin/env node
// Валидация русской локализации: покрытие, дубли id, коллизии алиасов, схема записи.
// Выход с ненулевым кодом — для CI. Использование: node scripts/validate-localization.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeAlias, leftoverLatin } from './lib/translate.mjs';
import {
  FORCE_RU,
  LEVEL_RU,
  MECHANIC_RU,
  EQUIPMENT_RU,
  CATEGORY_RU,
  MUSCLES_RU,
} from './lib/enums-ru.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const exercisesDir = path.join(root, 'exercises');
const ruDir = path.join(root, 'i18n', 'ru');

const STATUSES = new Set(['machine_draft', 'reviewed', 'needs_review', 'do_not_translate']);

const errors = [];
const warnings = [];
const fail = (msg) => errors.push(msg);
const warn = (msg) => warnings.push(msg);
let instructionsCovered = 0;
let instructionsMissing = 0;
let latinSteps = 0;

// 1. Загружаем upstream-упражнения
const upstreamFiles = fs.readdirSync(exercisesDir).filter((f) => f.endsWith('.json')).sort();
const upstreamIds = new Map(); // id -> имя файла
const upstreamById = new Map(); // id -> упражнение
for (const f of upstreamFiles) {
  const ex = JSON.parse(fs.readFileSync(path.join(exercisesDir, f), 'utf8'));
  if (upstreamIds.has(ex.id)) fail(`Дубликат upstream id: ${ex.id}`);
  upstreamIds.set(ex.id, f);
  upstreamById.set(ex.id, ex);
}

// 1b. Перечисления: каждое значение upstream-схемы должно иметь перевод.
// Если upstream добавит новое значение — валидация упадёт, пока словарь не дополнен.
const schema = JSON.parse(fs.readFileSync(path.join(root, 'schema.json'), 'utf8'));
const enumDictionaries = [
  ['force', schema.properties.force.enum, FORCE_RU],
  ['level', schema.properties.level.enum, LEVEL_RU],
  ['mechanic', schema.properties.mechanic.enum, MECHANIC_RU],
  ['equipment', schema.properties.equipment.enum, EQUIPMENT_RU],
  ['category', schema.properties.category.enum, CATEGORY_RU],
  ['muscles', schema.properties.primaryMuscles.items[0].enum, MUSCLES_RU],
];
let enumTotal = 0;
let enumTranslated = 0;
for (const [name, values, dict] of enumDictionaries) {
  for (const v of values) {
    if (v === null || v === undefined) continue;
    enumTotal++;
    if (dict[v]) enumTranslated++;
    else fail(`Нет перевода enum "${name}": "${v}" — дополните scripts/lib/enums-ru.mjs`);
  }
}

// 2. Загружаем локализацию
const ruFiles = fs.readdirSync(ruDir).filter((f) => f.endsWith('.json') && f !== 'schema.ru.json').sort();
const ruIds = new Set();
const aliasOwner = new Map(); // normalized alias -> id владельца
const ruNameOwner = new Map(); // normalized name -> id

for (const f of ruFiles) {
  const id = f.replace(/\.json$/, '');
  const rec = JSON.parse(fs.readFileSync(path.join(ruDir, f), 'utf8'));

  if (rec.id !== id) fail(`${f}: поле id "${rec.id}" не совпадает с именем файла`);
  if (!upstreamIds.has(id)) fail(`${f}: id "${id}" отсутствует в upstream-базе`);
  ruIds.add(id);

  if (rec.locale !== 'ru') fail(`${f}: locale должен быть "ru"`);
  if (typeof rec.name !== 'string' || !rec.name.trim()) fail(`${f}: пустое поле name`);
  if (!Array.isArray(rec.aliases)) fail(`${f}: aliases должен быть массивом строк`);
  if (!STATUSES.has(rec.review_status)) fail(`${f}: некорректный review_status "${rec.review_status}"`);
  if (rec.review_status === 'reviewed' && (!rec.reviewed_by || !rec.reviewed_at)) {
    warn(`${f}: статус reviewed, но reviewed_by/reviewed_at не заполнены`);
  }

  // латиница вне скобок — подозрение на недопереведённое название
  const lat = leftoverLatin(rec.name);
  if (lat && rec.review_status !== 'do_not_translate' && rec.review_status !== 'needs_review') {
    warn(`${f}: в названии осталась латиница ("${lat}") при статусе ${rec.review_status}`);
  }
  if (!(rec.aliases || []).some((a) => /[а-яё]/i.test(a))) {
    warn(`${f}: нет ни одного русского алиаса`);
  }

  // инструкции
  if (Array.isArray(rec.instructions_ru)) {
    const ex = upstreamById.get(rec.id);
    if (ex && rec.instructions_ru.length !== ex.instructions.length) {
      fail(
        `${f}: instructions_ru шагов ${rec.instructions_ru.length}, а в upstream ${ex.instructions.length}`
      );
    } else {
      instructionsCovered++;
      for (const s of rec.instructions_ru) {
        const lat = leftoverLatin(s);
        if (lat) latinSteps++;
      }
    }
  } else if (rec.review_status !== 'do_not_translate') {
    instructionsMissing++;
  }

  const nameKey = normalizeAlias(rec.name);
  if (ruNameOwner.has(nameKey)) {
    warn(`Дубликат русского названия "${rec.name}" (${ruNameOwner.get(nameKey)} и ${id})`);
  } else {
    ruNameOwner.set(nameKey, id);
  }

  for (const a of rec.aliases || []) {
    if (typeof a !== 'string' || !a.trim()) fail(`${f}: пустой алиас`);
    const key = normalizeAlias(a);
    if (key === nameKey) continue; // алиас = своё имя — не ошибка
    // один общий алиас у нескольких упражнений — норма для поиска
    // («жим лёжа» у всех вариантов жима), статистику выведем ниже
    if (!aliasOwner.has(key)) aliasOwner.set(key, []);
    aliasOwner.get(key).push(id);
  }
}

// алиас, совпадающий с русским названием другого упражнения, допустим
// (это просто пересечение поисковых индексов) — только предупреждение
let aliasNameClashes = 0;
for (const [key, ids] of aliasOwner) {
  const nameOwner = ruNameOwner.get(key);
  if (nameOwner && !ids.includes(nameOwner)) {
    aliasNameClashes++;
    if (aliasNameClashes <= 10) {
      warn(`Алиас "${key}" (${ids.join(', ')}) совпадает с названием упражнения ${nameOwner}`);
    }
  }
}

// 3. Покрытие
const missing = [...upstreamIds.keys()].filter((id) => !ruIds.has(id));
for (const id of missing) fail(`Нет локализации для "${id}" (${upstreamIds.get(id)})`);
const orphans = [...ruIds].filter((id) => !upstreamIds.has(id));
for (const id of orphans) fail(`Локализация без upstream-упражнения: "${id}"`);

// 4. Отчёт
const counts = {};
for (const f of ruFiles) {
  const rec = JSON.parse(fs.readFileSync(path.join(ruDir, f), 'utf8'));
  counts[rec.review_status] = (counts[rec.review_status] || 0) + 1;
}

console.log(`Upstream упражнений:  ${upstreamIds.size}`);
console.log(`Локализовано:         ${ruIds.size}`);
for (const [s, c] of Object.entries(counts).sort()) console.log(`  ${s}: ${c}`);
const totalAliases = [...aliasOwner.values()].reduce((n, ids) => n + ids.length, 0) +
  ruIds.size; // + собственные имена
console.log(
  `Уникальных алиасов:   ${aliasOwner.size} (в среднем ${(totalAliases / Math.max(ruIds.size, 1)).toFixed(1)} на упражнение)`
);
console.log(
  `Инструкции переведены: ${instructionsCovered}/${upstreamIds.size}` +
    (instructionsMissing ? ` (без перевода: ${instructionsMissing})` : '')
);
console.log(`Перечисления переведены: ${enumTranslated}/${enumTotal}`);
if (latinSteps) console.warn(`Шагов с латинскими вставками: ${latinSteps}`);
for (const w of warnings) console.warn(`ПРЕДУПРЕЖДЕНИЕ: ${w}`);
if (errors.length) {
  console.error(`\nОШИБКИ (${errors.length}):`);
  for (const e of errors) console.error('  ' + e);
  process.exit(1);
}
console.log('\nВалидация локализации пройдена.');

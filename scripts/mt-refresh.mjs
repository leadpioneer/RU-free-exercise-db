// Обновление MT-кэша и сайдкаров после изменения правил postEdit.
// 1) перегоняет все значения кэша через postEdit (актуальные правила);
// 2) значения без кириллицы или с латиницей ретранслирует через API;
// 3) пересобирает instructions_ru в сайдкарах со статусом machine из кэша.
// Запуск: node scripts/mt-refresh.mjs   (нужен YANDEX_API_KEY, если есть что ретранслировать)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { keyOf } from './lib/instructions-common.mjs';
import { postEdit } from './lib/mt-postedit.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ruDir = path.join(root, 'i18n', 'ru');
const cacheFile = path.join(root, 'work', 'mt-cache.json');
const apiKey = process.env.YANDEX_API_KEY;

const exercises = JSON.parse(fs.readFileSync(path.join(root, 'dist', 'exercises.json'), 'utf8'));

// keyOf(upstream step) → EN, и обратный индекс
const enByKey = new Map();
for (const ex of exercises) for (const s of ex.instructions) enByKey.set(keyOf(s), s);

const cache = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));

// 1. postEdit по всему кэшу
for (const k of Object.keys(cache)) cache[k] = postEdit(cache[k]);

// 2. подозрительные значения → ретрансляция
const badKeys = Object.keys(cache).filter(
  (k) => !/[\u0400-\u04FF]/.test(cache[k]) || /[a-z]{2,}/.test(cache[k])
);
console.log('Подозрительных записей:', badKeys.length);

const toTranslate = [];
for (const k of badKeys) {
  const en = enByKey.get(k);
  if (!en) {
    console.log('  нет EN для ключа, удаляю:', cache[k].slice(0, 50));
    delete cache[k];
    continue;
  }
  delete cache[k];
  toTranslate.push({ k, en });
}

if (toTranslate.length) {
  if (!apiKey) {
    console.error('Нужен YANDEX_API_KEY для ретрансляции', toTranslate.length, 'шагов');
    process.exit(1);
  }
  const texts = toTranslate.map((t) => t.en);
  const res = await fetch('https://translate.api.cloud.yandex.net/translate/v2/translate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Api-Key ${apiKey}` },
    body: JSON.stringify({ sourceLanguageCode: 'en', targetLanguageCode: 'ru', format: 'PLAIN_TEXT', texts }),
  });
  if (!res.ok) {
    console.error('API error', res.status, await res.text());
    process.exit(1);
  }
  const data = await res.json();
  toTranslate.forEach((t, i) => {
    const ru = data.translations[i]?.text;
    if (!ru) {
      console.error('  пустой перевод для:', t.en.slice(0, 60));
      return;
    }
    cache[t.k] = postEdit(ru);
  });
  console.log('Ретранслировано:', toTranslate.length);
}

fs.writeFileSync(cacheFile, JSON.stringify(cache), 'utf8');

// 3. пересборка сайдкаров со статусом machine
let fixed = 0;
let rebuilt = 0;
for (const ex of exercises) {
  const p = path.join(ruDir, `${ex.id}.json`);
  if (!fs.existsSync(p)) continue;
  const rec = JSON.parse(fs.readFileSync(p, 'utf8'));
  if (!Array.isArray(rec.instructions_ru) || rec.instructions_status !== 'machine') continue;
  let changed = 0;
  rec.instructions_ru = ex.instructions.map((en, i) => {
    const k = keyOf(en);
    const hit = cache[k];
    if (hit && hit !== rec.instructions_ru[i]) changed++;
    return hit || rec.instructions_ru[i];
  });
  fs.writeFileSync(p, JSON.stringify(rec, null, 2) + '\n', 'utf8');
  rebuilt++;
  fixed += changed;
}
console.log(`Сайдкаров пересобрано: ${rebuilt}, шагов обновлено: ${fixed}`);

const stillBad = Object.values(cache).filter(
  (v) => !/[\u0400-\u04FF]/.test(v) || /[a-z]{2,}/.test(v)
);
console.log('Осталось подозрительных в кэше:', stillBad.length);
for (const v of stillBad) console.log('  BAD:', JSON.stringify(v.slice(0, 80)));

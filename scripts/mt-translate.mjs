#!/usr/bin/env node
// Машинный перевод инструкций через Yandex Cloud Translate API v2.
// Переводит pending-шаги из батчей work/instructions/batch-NN.json
// и записывает результат в формате work/instructions/ru-batch-NN.json
// для последующего apply-instructions.
//
// Кэш work/mt-cache.json: keyOf(en) → ru. Одинаковые предложения
// переводятся один раз; перезапуск после сбоя бесплатный.
//
// Использование:
//   node scripts/mt-translate.mjs --all            # все батчи
//   node scripts/mt-translate.mjs batch-02.json    # один батч
//   node scripts/mt-translate.mjs --all --dry-run  # статистика без запросов
//
// Переменные окружения: YANDEX_API_KEY (обязателен без --dry-run),
// YANDEX_FOLDER_ID (опционален), YANDEX_MT_DELAY (мс между запросами, 250).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { keyOf } from './lib/instructions-common.mjs';
import { postEdit } from './lib/mt-postedit.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workDir = path.join(root, 'work', 'instructions');
const cacheFile = path.join(root, 'work', 'mt-cache.json');

const API_URL = 'https://translate.api.cloud.yandex.net/translate/v2/translate';
const PRICE_PER_1M = 500.4; // ₽ за 1 млн символов, вкл. НДС
const MAX_TEXTS = 40; // лимит API на количество текстов в запросе
const MAX_CHARS = 5000; // запас ниже лимита 10 000 символов на запрос

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const all = args.includes('--all');
const delayMs = Number(process.env.YANDEX_MT_DELAY) || 250;
const apiKey = process.env.YANDEX_API_KEY;
const folderId = process.env.YANDEX_FOLDER_ID;

if (!dryRun && !apiKey) {
  console.error('Нет YANDEX_API_KEY в переменных окружения.');
  process.exit(1);
}

let batchFiles;
if (all) {
  batchFiles = fs
    .readdirSync(workDir)
    .filter((f) => /^batch-\d+\.json$/.test(f))
    .sort()
    .map((f) => path.join(workDir, f));
} else {
  batchFiles = args
    .filter((a) => !a.startsWith('--'))
    .map((a) => {
      const name = path.basename(a).replace(/\.json$/, '') + '.json';
      return path.join(workDir, name);
    })
    .filter((f) => fs.existsSync(f));
}

if (!batchFiles.length) {
  console.log('Нет батчей для перевода. Сначала запустите scripts/extract-instructions.mjs');
  process.exit(0);
}

const cache = fs.existsSync(cacheFile) ? JSON.parse(fs.readFileSync(cacheFile, 'utf8')) : {};
const saveCache = () => fs.writeFileSync(cacheFile, JSON.stringify(cache), 'utf8');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function translateChunk(texts) {
  const body = {
    sourceLanguageCode: 'en',
    targetLanguageCode: 'ru',
    format: 'PLAIN_TEXT',
    texts,
  };
  if (folderId) body.folderId = folderId;

  let lastErr = null;
  for (let attempt = 0; attempt < 6; attempt++) {
    if (attempt > 0) await sleep(500 * 2 ** attempt); // 1s, 2s, 4s, 8s, 16s
    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Api-Key ${apiKey}`,
        },
        body: JSON.stringify(body),
      });
      if (res.status === 429 || res.status >= 500) {
        lastErr = new Error(`HTTP ${res.status}: ${await res.text()}`);
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
      const data = await res.json();
      return data.translations.map((t) => t.text);
    } catch (e) {
      if (/^HTTP 4/.test(String(e.message))) throw e; // клиентские ошибки не ретраим
      lastErr = e;
    }
  }
  throw lastErr;
}
let charsSent = 0;
let requests = 0;
let cacheHits = 0;
let translatedSteps = 0;
let noCyrillic = 0;
const filesWritten = [];

for (const batchFile of batchFiles) {
  const batch = JSON.parse(fs.readFileSync(batchFile, 'utf8'));
  const base = path.basename(batchFile, '.json'); // batch-02
  const out = {};

  // 1. Сбор уникальных непереведённых шагов
  const todoKeys = new Set();
  const stepsByKey = new Map();
  let batchHits = 0;
  for (const item of batch.exercises) {
    for (const step of item.steps) {
      const k = keyOf(step.en);
      if (k in cache) {
        batchHits++;
        continue;
      }
      todoKeys.add(k);
      if (!stepsByKey.has(k)) stepsByKey.set(k, step.en);
    }
  }

  // 2. Чанкинг и перевод
  const todo = [...todoKeys];
  const chunks = [];
  let cur = [];
  let curChars = 0;
  for (const k of todo) {
    const en = stepsByKey.get(k);
    if (cur.length >= MAX_TEXTS || curChars + en.length > MAX_CHARS) {
      chunks.push(cur);
      cur = [];
      curChars = 0;
    }
    cur.push(k);
    curChars += en.length;
    charsSent += en.length;
  }
  if (cur.length) chunks.push(cur);

  for (const chunk of chunks) {
    if (dryRun) continue; // только статистика
    const texts = chunk.map((k) => stepsByKey.get(k));
    try {
      const result = await translateChunk(texts);
      requests++;
      chunk.forEach((k, i) => {
        cache[k] = postEdit(result[i]);
      });
      saveCache();
    } catch (e) {
      saveCache();
      console.error(`Ошибка перевода (${base}): ${e.message}`);
      process.exit(1);
    }
    if (delayMs) await sleep(delayMs);
  }

  // 3. Сборка результата в порядке батча
  let missing = 0;
  for (const item of batch.exercises) {
    out[item.id] = item.steps.map((step) => {
      const k = keyOf(step.en);
      const hit = cache[k];
      if (hit === undefined) {
        missing++;
        return stepsByKey.get(k) || step.en;
      }
      if (!/[\u0400-\u04FF]/.test(hit)) {
        noCyrillic++;
        console.warn(`ПРЕДУПРЕЖДЕНИЕ: шаг без кириллицы (${item.id}): "${hit.slice(0, 60)}"`);
      }
      return hit;
    });
    translatedSteps += item.steps.length;
  }
  cacheHits += batchHits;

  if (!dryRun) {
    const outFile = path.join(path.dirname(batchFile), `ru-${base}.json`);
    fs.writeFileSync(outFile, JSON.stringify(out, null, 2) + '\n', 'utf8');
    filesWritten.push(path.basename(outFile));
  }
  console.log(
    `${base}: ${batch.exercises.length} упр., шагов ${batch.exercises.reduce((n, i) => n + i.steps.length, 0)}, новых фраз ${todo.length}, чанков ${chunks.length}, из кэша ${batchHits}${dryRun ? ' (dry-run)' : ''}`
  );
  if (missing) console.warn(`ПРЕДУПРЕЖДЕНИЕ: ${base}: ${missing} шагов без перевода!`);
}

const rub = (charsSent / 1e6) * PRICE_PER_1M;
console.log('---');
console.log(`Шагов обработано:    ${translatedSteps}`);
console.log(`Символов отправлено: ${charsSent} (~${rub.toFixed(2)} ₽)`);
console.log(`Шагов без кириллицы: ${noCyrillic}`);
if (dryRun) {
  console.log('DRY-RUN: запросы не выполнялись.');
} else {
  console.log(`Запросов к API: ${requests}, попаданий в кэш: ${cacheHits}`);
  console.log(`Файлы перевода: ${filesWritten.join(', ') || '—'}`);
}


# RU-free-exercise-db 🇷🇺💪

[![CI](https://github.com/leadpioneer/RU-free-exercise-db/actions/workflows/ci.yaml/badge.svg)](https://github.com/leadpioneer/RU-free-exercise-db/actions/workflows/ci.yaml)
[![License: Unlicense](https://img.shields.io/badge/license-Unlicense-blue.svg)](http://unlicense.org/)

Русифицированный форк открытой базы упражнений
[yuhonas/free-exercise-db](https://github.com/yuhonas/free-exercise-db):
**876 упражнений** с русскими названиями и ~3800 поисковыми алиасами —
готово для импорта в SparkyFitness, Telegram-ботов и любых своих приложений.

Русификация — это **надстройка**: upstream-данные в `exercises/` не изменяются,
поэтому обновления из оригинального репозитория подтягиваются без конфликтов.

## Быстрый старт

Скачайте один файл и используйте:

```
https://raw.githubusercontent.com/leadpioneer/RU-free-exercise-db/main/dist/exercises.ru.json
```

Картинки упражнений лежат в upstream-репозитории — путь из поля `images`
(например `Barbell_Bench_Press_-_Medium_Grip/0.jpg`) подставьте префиксом:

```
https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/<путь из images>
```

## Формат записи

Каждая запись `dist/exercises.ru.json` — это upstream-запись целиком плюс
русские поля: перевод названия, алиасы, инструкции, статус и переводы
всех классификационных перечислений (`*_ru`):

```json
{
  "id": "Barbell_Bench_Press_-_Medium_Grip",
  "name": "Barbell Bench Press - Medium Grip",
  "name_ru": "Жим штанги лёжа средним хватом",
  "aliases_ru": [
    "Жим штанги лёжа",
    "жим лёжа",
    "жим лежа",
    "Жим штанги",
    "штанга",
    "грудные",
    "bench press"
  ],
  "review_status": "machine_draft",
  "force": "push",
  "level": "intermediate",
  "mechanic": "compound",
  "equipment": "barbell",
  "primaryMuscles": ["chest"],
  "secondaryMuscles": ["triceps", "shoulders"],
  "instructions": ["..."],
  "category": "strength",
  "images": ["Barbell_Bench_Press_-_Medium_Grip/0.jpg"],

  "level_ru": "средний",
  "category_ru": "силовые",
  "force_ru": "толкающее",
  "mechanic_ru": "базовое",
  "equipment_ru": "штанга",
  "primaryMuscles_ru": ["грудные"],
  "secondaryMuscles_ru": ["трицепс", "плечи"],
  "instructions_ru": ["..."],
  "instructions_status": "machine"
}
```

Словари перечислений: `scripts/lib/enums-ru.mjs` (force/level/mechanic/
equipment/category/muscles). `null` в upstream остаётся `null`.

### Как искать

Матчите запрос по `name_ru` **и** всем элементам `aliases_ru`, нормализовав
строку: нижний регистр, `ё → е`, схлопывание пробелов. Алиасы включают:

- короткие формы («Шраги со штангой» → «Шраги»);
- разговорные ключевые слова («становая», «присед», «брусья», «жим лёжа»,
  «тяга блока», «пресс»);
- снаряд и целевые мышцы из upstream («штанга», «гантели», «грудные») —
  русский алиас есть у каждой записи;
- английское название (двуязычный поиск).

### Статус перевода

Названия (`review_status`):

| Статус | Значение |
|---|---|
| `machine_draft` | перевод создан глоссарий-движком, не проверен человеком |
| `reviewed` | вычитано вручную (заполнены `reviewed_at` / `reviewed_by`) |
| `needs_review` | автоматика пометила неоднозначность (см. `notes`) |
| `do_not_translate` | бренд/термин оставлен как есть |

Инструкции (`instructions_status`):

| Статус | Значение |
|---|---|
| `machine` | машинный перевод (Yandex Translate + правила пост-редакта) |
| `reviewed` | вычитано человеком |

Сейчас: названия — 874 `machine_draft`, 2 `needs_review`; инструкции —
876/876 (45 вручную/по словарю, 831 `machine`). Спорные термины
(deadlift/row/curl/lunge/press и их варианты) разобраны в
[docs/GLOSSARY_RU.md](./docs/GLOSSARY_RU.md).

## Структура репозитория

```
exercises/                    # upstream: JSON + картинки (не править вручную)
i18n/ru/<id>.json             # русская локализация — сайдкар на упражнение
i18n/ru/schema.ru.json        # JSON Schema русской записи
dist/exercises.json           # upstream-сборка (генерируется)
dist/exercises.ru.json        # RU-сборка: upstream + name_ru/aliases_ru/
                              # instructions_ru/*_ru-перечисления
scripts/lib/                  # глоссарий-движок перевода названий, словари
                              # перечислений, правила пост-редакта MT
scripts/*.mjs                 # draft / merge / validate
docs/GLOSSARY_RU.md           # канонический глоссарий терминов
docs/TRANSLATION_GUIDE_RU.md  # процесс перевода, ревью и поиска
site/                         # browsable frontend (upstream, Vue.js)
```

## Сборка и проверка

Нужны [Node.js ≥ 18](https://nodejs.org), `pip install check-jsonschema`
(для `make lint*`) и [jq](https://jqlang.github.io/jq/) (upstream-сборка).

```sh
make validate-ru              # покрытие 876/876, дубли, коллизии алиасов
make lint-ru                  # сайдкары против i18n/ru/schema.ru.json
make dist/exercises.ru.json   # пересобрать RU-дистрибутив
make lint                     # upstream: JSON против schema.json
make dist/exercises.json      # upstream: пересобрать dist
```

Перегенерация черновиков перевода после правки словарей:

```sh
node scripts/draft-ru-names.mjs --force && make dist/exercises.ru.json
```

Всё это выполняется в CI: schema-линт обеих баз, валидация локализации и
проверка, что оба dist-файла пересобраны и актуальны.

## Обновление из upstream

```sh
git pull upstream main
make validate-ru              # покажет новые упражнения без локализации
node scripts/draft-ru-names.mjs && make dist/exercises.ru.json
```

Файлы со статусом `reviewed` / `do_not_translate` перегенератор не трогает.

## Данные

Поля записи: `id, name, force, level, mechanic, equipment, primaryMuscles,
secondaryMuscles, instructions, category, images` + русские `name_ru,
aliases_ru, review_status`. Enum'ы и терминология — в
[docs/GLOSSARY_RU.md](./docs/GLOSSARY_RU.md), upstream-схема — в
[schema.json](./schema.json).

## Лицензия

Данные — [Unlicense](./LICENSE.md) (public domain), как и в upstream.
Русская локализация распространяется на тех же условиях.

## Благодарности

- [yuhonas/free-exercise-db](https://github.com/yuhonas/free-exercise-db) —
  исходная база и фронтенд;
- [wrkout/exercises.json](https://github.com/wrkout/exercises.json) —
  оригинальный датасет (Ollie Jennings);
- flaticon — фавикон.

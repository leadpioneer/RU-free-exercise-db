import { WORDS } from './words.mjs';
import { PHRASES } from './phrases.mjs';
import { OVERRIDES } from './overrides.mjs';

// Ведущие модификаторы, которые в русских названиях естественно
// звучат в конце: "Standing Calf Raise" -> "Подъём на носки стоя".
const LEADING = [
  [/^bent[- ]over\b/, 'в наклоне'],
  [/^standing\b/, 'стоя'],
  [/^seated\b/, 'сидя'],
  [/^lying\b/, 'лёжа'],
  [/^kneeling\b/, 'с колен'],
  [/^prone\b/, 'лёжа на животе'],
  [/^supine\b/, 'лёжа на спине'],
  [/^side[- ]lying\b/, 'лёжа на боку'],
  [/^incline\b/, 'на наклонной скамье'],
  [/^decline\b/, 'на скамье вниз головой'],
  [/^one[- ]arm\b/, 'одной рукой'],
  [/^two[- ]arm\b/, 'двумя руками'],
  [/^single[- ]arm\b/, 'одной рукой'],
  [/^alternating\b/, 'попеременно'],
  [/^alternate\b/, 'попеременно'],
  [/^weighted\b/, 'с дополнительным весом'],
  [/^suspended\b/, 'в петлях (TRX)'],
  [/^machine\b/, 'в тренажёре'],
  [/^leverage\b/, 'в рычажном тренажёре'],
];

// Ключевые алиасы для популярных упражнений (дополняются вручную).
const ALIAS_HINTS = {
  'barbell bench press': ['жим лежа', 'жим штанги лежа', 'bench press'],
  'barbell deadlift': ['становая', 'deadlift', 'тяга'],
  'barbell squat': ['присед', 'приседания со штангой', 'squats'],
  'barbell curl': ['сгибание на бицепс', 'подъем штанги на бицепс'],
  'chin-up': ['chin up'],
  'clean and jerk': ['толчок', 'взятие и толчок'],
  'crunches': ['скручивания на пресс', 'пресс'],
  'dips - triceps version': ['брусья'],
  'face pull': ['фейс-пулл', 'тяга к лицу'],
  'front squat': ['присед со штангой на груди'],
  'glute bridge': ['ягодичный мост', 'мостик'],
  'hang clean': ['взятие с виса'],
  'hanging leg raise': ['подъем ног в висе'],
  'inverted row': ['австралийские подтягивания', 'горизонтальные подтягивания'],
  'lat pulldown': ['тяга верхнего блока', 'тяга блока'],
  'lateral raise': ['махи в стороны', 'разведения'],
  'leg press': ['жим ногами', 'жим в тренажере'],
  'military press': ['армейский жим', 'жим стоя'],
  'plank': ['планка'],
  'pull-ups': ['подтягивания', 'pull ups'],
  'push press': ['швунг'],
  'push-ups': ['отжимания'],
  'romanian deadlift': ['румынская тяга', 'рдл'],
  'snatch': ['рывок'],
  'sumo deadlift': ['становая сумо'],
  'triceps pushdown': ['пушдаун', 'разгибания на блоке'],
  'good morning': ['гуд морнинг', 'наклоны со штангой'],
};

const flatten = (s) => s.trim().replace(/\s+/g, ' ');
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Сопоставление, устойчивое к дефисам/пробелам/апострофам/слэшам.
function phraseRegex(phrase) {
  const body = escapeRegex(phrase)
    .replace(/'/g, "['’]?")
    .replace(/[/]/g, '\\s*/\\s*')
    .replace(/[\s-]+/g, '[\\s-]+');
  return new RegExp(`(?<![a-z0-9])${body}(?![a-z0-9])`, 'g');
}

const PHRASE_RULES = Object.entries(PHRASES)
  .sort(
    (a, b) =>
      b[0].split(/[\s-]+/).length - a[0].split(/[\s-]+/).length ||
      b[0].length - a[0].length
  )
  .map(([en, ru]) => ({ re: phraseRegex(en), ru }));

const WORD_RULES = Object.entries(WORDS)
  .sort((a, b) => b[0].length - a[0].length)
  .map(([en, ru]) => ({
    re: new RegExp(`(?<![a-z0-9])${escapeRegex(en)}(?![a-z0-9])`, 'g'),
    ru,
  }));

// Пост-обработка: вынос направления из начала названия в конец.
const DIRECTION_PREFIXES = [
  [/^Передний\s+/, 'вперёд'],
  [/^Передняя\s+/, 'вперёд'],
  [/^Задний\s+/, 'назад'],
  [/^Задняя\s+/, 'назад'],
  [/^Боковой\s+/, 'в сторону'],
  [/^Боковая\s+/, 'в сторону'],
  [/^Поперечный\s+/, 'поперёк'],
];

// Пост-обработка: инвентарь в начале («Штанга шраг») → дополнение в конце
// («Шраг со штангой»). Второй элемент — маркер, при наличии которого в остатке
// дополнение не добавляется (защита от дублей).
const EQUIP_REORDER = [
  [/^Штанга\s+/, 'штанг', 'со штангой'],
  [/^Гантели\s+/, 'гантел', 'с гантелями'],
  [/^Гантель\s+/, 'гантел', 'с гантелью'],
  [/^Гири\s+/, 'гир', 'с гирями'],
  [/^Гиря\s+/, 'гир', 'с гирей'],
  [/^Эспандер\s+/, 'эспандер|лент', 'с эспандером'],
  [/^Медицинбол\s+/, 'медицинбол', 'с медицинболом'],
  [/^Мяч\s+/, 'мяч', 'с мячом'],
  [/^Диск\s+/, 'диск', 'с диском'],
  [/^Скамья\s+/, 'скамь', 'на скамье'],
  [/^Тренажёр\s+/, 'тренажёр', 'в тренажёре'],
  [/^Фитбол\s+/, 'фитбол', 'на фитболе'],
  [/^Канат\s+/, 'канат', 'с канатом'],
  [/^Сани\s+/, 'сан', 'с санями'],
  [/^Резиновая лента\s+/, 'лент', 'с лентой'],
  [/^Лента\s+/, 'лент', 'с лентой'],
];

export function translateName(name) {
  const low = name.toLowerCase();
  const override = OVERRIDES[low];
  if (override) {
    const ru = typeof override === 'string' ? override : override.name;
    return {
      name: ru,
      status: typeof override === 'object' ? override.status : undefined,
      notes: typeof override === 'object' ? override.notes : undefined,
      source: 'override',
    };
  }

  let rest = low;
  const suffixes = [];
  for (const [re, suffix] of LEADING) {
    const m = rest.match(re);
    if (m) {
      rest = rest.slice(m[0].length);
      suffixes.push(suffix);
    }
  }

  // "-SMR" в конце — самомиофасциальный релиз.
  let smr = false;
  rest = rest.replace(/[-\s]+smr\b/g, () => {
    smr = true;
    return ' ';
  });

  rest = rest.replace(/\s*-\s*/g, ' ');
  // Фразы вставляются как плейсхолдеры, чтобы их русские значения
  // (в т.ч. с английскими терминами в скобках) не переводились повторно
  // словарём слов.
  const placeholders = [];
  for (const { re, ru } of PHRASE_RULES) {
    rest = rest.replace(re, () => {
      placeholders.push(ru);
      return ` \u0000${placeholders.length - 1}\u0000 `;
    });
  }
  for (const { re, ru } of WORD_RULES) rest = rest.replace(re, ` ${ru} `);
  rest = rest.replace(/\u0000(\d+)\u0000/g, (_, i) => placeholders[Number(i)]);

  const core = flatten(rest).split(' ').filter(Boolean).join(' ');
  const capitalize = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
  let result = capitalize(core);

  // вынос направления из начала («Передний подъёмы ног» → «... вперёд»)
  for (const [re, suffix] of DIRECTION_PREFIXES) {
    if (re.test(result)) {
      result = result.replace(re, '');
      suffixes.push(suffix);
      break;
    }
  }

  // инвентарь из начала («Штанга шраг») → дополнение в конце («Шраг со штангой»)
  for (const [re, dupKey, instrumental] of EQUIP_REORDER) {
    const m = result.match(re);
    if (m) {
      const restStr = result.slice(m[0].length);
      if (!new RegExp(dupKey, 'i').test(restStr.split('(')[0])) {
        result = restStr ? `${restStr} ${instrumental}` : instrumental;
      } else {
        result = restStr;
      }
      break;
    }
  }

  for (const s of suffixes.reverse()) {
    result = result ? `${result} ${s}` : capitalize(s);
  }
  result = result.replace(/\(\s+/g, '(').replace(/\s+([,)])/g, '$1');
  if (smr) result += ' (МФР)';
  return { name: result, status: undefined, notes: undefined, source: 'rules' };
}

// Остались ли латинские слова вне скобок (внутри скобок допускаются термины).
// Одиночные заглавные буквы (V-рукоять, Т-гриф) и аббревиатуры (EZ, JM) не считаются.
export function leftoverLatin(ruName) {
  const cleaned = ruName.replace(/\([^)]*\)/g, '');
  const m = cleaned.match(/[a-z]{2,}/);
  return m ? m[0] : null;
}

export function normalizeAlias(s) {
  return s.toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
}

// --- Автоматический вывод русских алиасов -------------------------------

// Ключевое слово инвентаря из upstream equipment (гарантирует русский алиас
// даже у названий без снаряда в тексте).
export const EQUIP_KEYWORDS = {
  barbell: 'штанга',
  dumbbell: 'гантели',
  kettlebell: 'гиря',
  cable: 'блок',
  machine: 'тренажёр',
  'body only': 'собственный вес',
  bands: 'эспандер',
  'medicine ball': 'медицинбол',
  'exercise ball': 'фитбол',
  'foam roll': 'МФР-ролл',
  'e-z curl bar': 'EZ-гриф',
  other: null,
};

// Ключевые слова мышц из upstream primaryMuscles.
export const MUSCLE_KEYWORDS = {
  abdominals: 'пресс',
  abductors: 'отводящие',
  adductors: 'приводящие',
  biceps: 'бицепс',
  calves: 'икры',
  chest: 'грудные',
  forearms: 'предплечья',
  glutes: 'ягодицы',
  hamstrings: 'бицепс бедра',
  lats: 'широчайшие',
  'lower back': 'поясница',
  'middle back': 'середина спины',
  neck: 'шея',
  quadriceps: 'квадрицепс',
  shoulders: 'дельты',
  traps: 'трапеции',
  triceps: 'трицепс',
};

export function upstreamKeywords(ex) {
  const out = [];
  if (ex && ex.equipment) {
    const eq = EQUIP_KEYWORDS[ex.equipment];
    if (eq) out.push(eq);
  }
  for (const m of (ex && ex.primaryMuscles) || []) {
    const k = MUSCLE_KEYWORDS[m];
    if (k && !out.includes(k)) out.push(k);
  }
  return out;
}

// Ключевые слова по содержимому русского названия.
const KEYWORD_RULES = [
  [/жим л[её]жа/, ['жим лёжа', 'bench press']],
  [/становая тяга/, ['становая тяга', 'становая']],
  [/румынская тяга/, ['румынская тяга', 'рдл']],
  [/приседани/, ['приседания', 'присед']],
  [/подтягивания/, 'подтягивания'],
  [/отжимания на брусьях/, ['отжимания на брусьях', 'брусья']],
  [/отжимания/, 'отжимания'],
  [/выпад/, 'выпады'],
  [/планка/, 'планка'],
  [/скручивани/, ['скручивания', 'пресс']],
  [/сит-ап/, ['сит-ап', 'пресс']],
  [/подъ[её]мы ног|подъ[её]м ног|коленей к груди/, 'пресс'],
  [/шраг/, 'шраги'],
  [/тяга верхнего блока|тяга нижнего блока|на блоке|тяга к подбородку/, 'тяга блока'],
  [/тяга/, 'тяга'],
  [/французский жим/, 'французский жим'],
  [/бицепс бедра/, 'бицепс бедра'],
  [/бицепс(?! бедра)/, 'бицепс'],
  [/на трицепс|трицепс/, 'трицепс'],
  [/икроножная|камбаловидная/, 'икры'],
  [/армейский жим/, ['армейский жим', 'жим стоя']],
  [/жим ногами/, 'жим ногами'],
  [/жим Арнольда/, 'жим Арнольда'],
  [/жим гантелей/, 'жим гантелей'],
  [/жим штанги/, 'жим штанги'],
  [/жим гири/, 'жим гири'],
  [/жим/, 'жим'],
  [/махи в стороны|разведения в стороны/, 'махи в стороны'],
  [/разведения|разведение/, 'разведения'],
  [/гиперэкстензия/, ['гиперэкстензия', 'поясница']],
  [/ягодичный мост/, 'ягодичный мост'],
  [/гуд морнинг/, 'гуд морнинг'],
  [/трастер/, 'трастер'],
  [/свинг|махи/, 'махи'],
  [/взятие на грудь/, 'взятие на грудь'],
  [/рывок/, 'рывок'],
  [/толчок/, 'толчок'],
  [/мельница/, 'мельница'],
  [/турецкий подъём/, 'турецкий подъём'],
  [/выкатывание|ролик для пресса/, 'ролик для пресса'],
  [/молотковые/, 'молотковые сгибания'],
  [/растяжка/, 'растяжка'],
  [/мост/, 'мост'],
  [/собственный вес/, 'собственный вес'],
];

// Хвостовые обороты, которые можно отбросить для «короткой» формы алиаса.
const TRAILING_EQUIP =
  /( со штангой| с гантелью| с гантелями| с гирей| с гирями| с эспандером| с медицинболом| с мячом| с диском| с канатом| с санями| с лентой| с цепями| с трэп-грифом| с EZ-грифом| с Т-грифом| с V-рукоятью| на скамье| на блоке| в тренажёре| в рычажном тренажёре| на фитболе| на тумбу| на тумбе| на брусьях)$/;
const TRAILING_POS =
  /( стоя| сидя| лёжа| на коленях| с колен| попеременно| одной рукой| двумя руками| с собственным весом| с дополнительным весом| с весом)$/;

// Выводит из русского названия дополнительные алиасы:
//  - базовая форма без уточнений в скобках;
//  - короткая форма без хвостовых «со штангой», «сидя» и т.п.;
//  - ключевые слова движения («жим лёжа», «становая», «пресс», «брусья»…).
export function deriveRuAliases(ruName) {
  const out = [];
  const add = (v) => {
    const t = flatten(String(v));
    if (t && !out.includes(t)) out.push(t);
  };

  const base = flatten(ruName.replace(/\s*\([^)]*\)/g, ''));
  if (base && base !== flatten(ruName)) add(base);

  let short = base || flatten(ruName);
  let prev = null;
  while (prev !== short) {
    prev = short;
    short = flatten(short.replace(TRAILING_EQUIP, '').replace(TRAILING_POS, ''));
  }
  if (short && short !== base) add(short);

  // правила регистронезависимы: имена начинаются с заглавной буквы
  const lowName = ruName.toLowerCase();
  for (const [re, kw] of KEYWORD_RULES) {
    if (re.test(lowName)) for (const k of [].concat(kw)) add(k);
  }
  return out;
}

export function buildAliases(en, ru, extra) {
  const set = new Set();
  const push = (s) => {
    const v = flatten(s);
    if (v) set.add(v);
  };
  push(en); // английское название — полезно для поиска
  push(ru);
  if (/ё/.test(ru)) push(ru.replace(/ё/g, 'е')); // ё/е-вариант
  for (const d of deriveRuAliases(ru)) push(d);
  for (const a of extra || []) push(a);
  for (const h of ALIAS_HINTS[en.toLowerCase()] || []) push(h);
  set.delete(ru); // точное имя не дублируем как алиас
  return [...set];
}

export function makeDraftRecord(id, en, ru, status, notes, extraAliases) {
  return {
    id,
    locale: 'ru',
    name: ru,
    aliases: buildAliases(en, ru, extraAliases),
    review_status:
      status || (leftoverLatin(ru) ? 'needs_review' : 'machine_draft'),
    reviewed_at: null,
    reviewed_by: null,
    ...(notes ? { notes } : {}),
  };
}

// Русские переводы фиксированных перечислений upstream-схемы (schema.json).
// При добавлении новых значений в upstream-схему дополните словари —
// валидатор и generate-ru-dist упадут на непереведённом значении.

export const FORCE_RU = {
  static: 'статическое',
  pull: 'тянущее',
  push: 'толкающее',
};

export const LEVEL_RU = {
  beginner: 'новичок',
  intermediate: 'средний',
  expert: 'продвинутый',
};

export const MECHANIC_RU = {
  isolation: 'изолирующее',
  compound: 'базовое',
};

export const EQUIPMENT_RU = {
  'medicine ball': 'медбол',
  dumbbell: 'гантели',
  'body only': 'без оборудования',
  bands: 'эспандеры',
  kettlebells: 'гири',
  'foam roll': 'пенный ролик',
  cable: 'блочный тренажёр',
  machine: 'тренажёр',
  barbell: 'штанга',
  'exercise ball': 'фитбол',
  'e-z curl bar': 'EZ-гриф',
  other: 'другое',
};

export const CATEGORY_RU = {
  powerlifting: 'пауэрлифтинг',
  strength: 'силовые',
  stretching: 'растяжка',
  cardio: 'кардио',
  'olympic weightlifting': 'тяжёлая атлетика',
  strongman: 'стронгмен',
  plyometrics: 'плиометрика',
};

export const MUSCLES_RU = {
  abdominals: 'пресс',
  abductors: 'отводящие мышцы',
  adductors: 'приводящие мышцы',
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
  quadriceps: 'квадрицепсы',
  shoulders: 'плечи',
  traps: 'трапеции',
  triceps: 'трицепс',
};

// null сохраняется как null (поле «не применимо»)
export function enumRu(dict, value) {
  if (value === null || value === undefined) return null;
  return dict[value];
}

// Shared lesson preset definitions used by the admin session creator
// and the client booking UI (to render type-specific behavior).

export type LessonType =
  | "adult_morning_mix"
  | "ages_3_6"
  | "ages_7_10"
  | "ages_11_14";

export interface LessonPreset {
  type: LessonType;
  label: string;
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
  defaultPrice: number;
  priceHint?: string;
  capacity: number;
  /** JS getDay() weekdays this preset is allowed on. 2 = Tue, 4 = Thu */
  allowedDays: number[];
  ageMin?: number;
  ageMax?: number;
  showMatchPlayOption?: boolean;
}

export const LESSON_PRESETS: LessonPreset[] = [
  {
    type: "adult_morning_mix",
    label: "Men & Women Morning Mix",
    startHour: 7, startMinute: 0,
    endHour: 8, endMinute: 30,
    defaultPrice: 35,
    priceHint: "$35 per person per session",
    capacity: 16,
    allowedDays: [2, 4],
    showMatchPlayOption: true,
  },
  {
    type: "ages_3_6",
    label: "Ages 3–6",
    startHour: 8, startMinute: 30,
    endHour: 9, endMinute: 15,
    defaultPrice: 20,
    capacity: 8,
    allowedDays: [2, 4],
    ageMin: 3, ageMax: 6,
  },
  {
    type: "ages_7_10",
    label: "Ages 7–10",
    startHour: 9, startMinute: 15,
    endHour: 10, endMinute: 15,
    defaultPrice: 25,
    capacity: 10,
    allowedDays: [2, 4],
    ageMin: 7, ageMax: 10,
  },
  {
    type: "ages_11_14",
    label: "Ages 11–14",
    startHour: 10, startMinute: 15,
    endHour: 11, endMinute: 45,
    defaultPrice: 35,
    capacity: 10,
    allowedDays: [2, 4],
    ageMin: 11, ageMax: 14,
  },
];

export function presetByType(type: string | null | undefined): LessonPreset | undefined {
  if (!type) return undefined;
  return LESSON_PRESETS.find((p) => p.type === type);
}

/** Recommend a preset for a player of a given age (null = adult). */
export function recommendedPresetForAge(age: number | null | undefined): LessonPreset | undefined {
  if (age == null) return LESSON_PRESETS.find((p) => p.type === "adult_morning_mix");
  return LESSON_PRESETS.find(
    (p) => p.ageMin != null && p.ageMax != null && age >= p.ageMin && age <= p.ageMax,
  );
}

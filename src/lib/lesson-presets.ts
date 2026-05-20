// Shared lesson preset definitions used by the admin session creator
// and the client booking UI (to render type-specific behavior).

export type LessonType =
  | "mens_womens_morning_mix"
  | "camp_3_6"
  | "camp_7_10"
  | "camp_11_14";

export interface LessonPreset {
  type: LessonType;
  label: string;
  startHour: number;   // 24h
  startMinute: number;
  endHour: number;
  endMinute: number;
  defaultPrice: number;
  priceHint?: string;
  capacity: number;
}

export const LESSON_PRESETS: LessonPreset[] = [
  {
    type: "mens_womens_morning_mix",
    label: "Men's & Women's Morning Mix",
    startHour: 7, startMinute: 0,
    endHour: 8, endMinute: 30,
    defaultPrice: 35,
    priceHint: "$35–$40",
    capacity: 8,
  },
  {
    type: "camp_3_6",
    label: "3–6 yo Summer Camp",
    startHour: 8, startMinute: 30,
    endHour: 9, endMinute: 15,
    defaultPrice: 20,
    capacity: 8,
  },
  {
    type: "camp_7_10",
    label: "7–10 yo Summer Camp",
    startHour: 9, startMinute: 15,
    endHour: 10, endMinute: 15,
    defaultPrice: 25,
    capacity: 10,
  },
  {
    type: "camp_11_14",
    label: "11–14 yo Summer Camp",
    startHour: 10, startMinute: 15,
    endHour: 11, endMinute: 45,
    defaultPrice: 35,
    capacity: 10,
  },
];

export function presetByType(type: string | null | undefined): LessonPreset | undefined {
  if (!type) return undefined;
  return LESSON_PRESETS.find((p) => p.type === type);
}

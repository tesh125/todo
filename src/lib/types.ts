export type TaskDTO = {
  id: string;
  title: string;
  notes: string | null;
  date: string | null;
  completed: boolean;
  order: number;
  estimatedMinutes: number | null;
};

export type PreferenceDTO = {
  id: string;
  text: string;
  locked: boolean;
  startMinute: number | null;
  endMinute: number | null;
  windowed: boolean;
  durationMinutes: number | null;
  windowStartMinute: number | null;
  windowEndMinute: number | null;
  order: number;
};

export type SettingsDTO = {
  workStartMinute: number;
  workEndMinute: number;
};

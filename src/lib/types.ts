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
  // Whether this non-negotiable (locked or windowed) has been checked off
  // for today specifically — resets on its own the next day.
  completedToday: boolean;
  order: number;
};

export type SettingsDTO = {
  workStartMinute: number;
  workEndMinute: number;
};

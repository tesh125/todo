export type TaskDTO = {
  id: string;
  title: string;
  notes: string | null;
  date: string | null;
  completed: boolean;
  order: number;
  estimatedMinutes: number | null;
};

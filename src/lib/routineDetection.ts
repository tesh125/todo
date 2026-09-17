/**
 * Keyword heuristic (not real AI — nothing here calls a model) that spots
 * routine-sounding preference text ("exercise", "15 min reading", "afternoon
 * walk") and suggests a sensible duration + window for it, so the add form
 * can default to "Non-negotiable" instead of making you click through the
 * mode picker yourself. The suggestion is always editable before you submit
 * — this never silently commits anything.
 */

export type RoutineSuggestion = {
  durationMinutes: number;
  windowStartMinute: number;
  windowEndMinute: number;
};

type Rule = {
  pattern: RegExp;
  // Either a fixed window, or a window relative to the workday's start
  // (e.g. "anytime before the first work session").
  window: (workStartMinute: number) => { windowStartMinute: number; windowEndMinute: number };
  durationMinutes: number;
};

const BEFORE_WORK_BUFFER = 180; // how far back "before work" reaches, in minutes

function beforeWork(workStartMinute: number) {
  return {
    windowStartMinute: Math.max(0, workStartMinute - BEFORE_WORK_BUFFER),
    windowEndMinute: workStartMinute,
  };
}

const RULES: Rule[] = [
  { pattern: /\b(exercise|workout|work out|gym|run|jog|yoga)\b/i, window: beforeWork, durationMinutes: 30 },
  { pattern: /\b(meditat\w*|stretch\w*)\b/i, window: beforeWork, durationMinutes: 10 },
  { pattern: /\b(read\w*)\b/i, window: () => ({ windowStartMinute: 21 * 60, windowEndMinute: 23 * 60 }), durationMinutes: 15 },
  { pattern: /\b(walk\w*)\b/i, window: () => ({ windowStartMinute: 12 * 60, windowEndMinute: 17 * 60 }), durationMinutes: 30 },
];

export function detectRoutine(text: string, workStartMinute: number): RoutineSuggestion | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  for (const rule of RULES) {
    if (rule.pattern.test(trimmed)) {
      const { windowStartMinute, windowEndMinute } = rule.window(workStartMinute);
      return { durationMinutes: rule.durationMinutes, windowStartMinute, windowEndMinute };
    }
  }
  return null;
}

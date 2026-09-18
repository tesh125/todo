// Keyword heuristic for how long a task probably takes when the user hasn't
// set an estimatedMinutes themselves — not a real AI estimate (see
// suggestTimeBlocks in timeBlocks.ts, and the README's "AI scheduling: still
// a stub" note). Checked in order, first match wins, so put more specific
// phrasing before the broader category it'd otherwise fall into.
const RULES: { pattern: RegExp; minutes: number }[] = [
  // Quick actions — a couple minutes of actual doing, a slot just to not lose it
  { pattern: /\b(email|text|message|dm|ping|call|reply|respond|follow[\s-]?up)\b/i, minutes: 15 },
  { pattern: /\b(quick|small|tiny|little)\b/i, minutes: 15 },

  // Short, focused single-pass tasks
  { pattern: /\b(review|edit|proofread|update|fix|tweak|schedule|book|pay|order)\b/i, minutes: 30 },

  // Medium creative/production tasks
  { pattern: /\b(write|draft|script|post|blog|record|film|design|outline)\b/i, minutes: 45 },

  // Deep-focus work
  { pattern: /\b(build|develop|code|implement|research|study|prepare|analyze|analysis|strategy|deep\s?work)\b/i, minutes: 90 },
  { pattern: /\b(project|launch|campaign|plan(ning)?)\b/i, minutes: 120 },
];

const DEFAULT_MINUTES = 30;

export function estimateTaskDuration(title: string): number {
  for (const rule of RULES) {
    if (rule.pattern.test(title)) return rule.minutes;
  }
  return DEFAULT_MINUTES;
}

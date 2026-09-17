import { Bucket } from "@/lib/buckets";

export type ParsedImport = Record<Bucket, string[]>;

const SECTION_HEADERS: { pattern: RegExp; bucket: Bucket }[] = [
  { pattern: /^today\s*:?\s*$/i, bucket: "today" },
  { pattern: /^tomorrow\s*:?\s*$/i, bucket: "tomorrow" },
  { pattern: /^later\s*:?\s*$/i, bucket: "later" },
];

/** Strips a leading bullet/checkbox marker (as Apple Notes renders lists and checklists). */
function stripBullet(line: string): string {
  return line
    .replace(/^[-*••]\s*/, "")
    .replace(/^\[[ xX]?\]\s*/, "")
    .trim();
}

/**
 * Parses freeform note text into today/tomorrow/later buckets. Expects
 * "Today" / "Tomorrow" / "Later" section headers (as the user's Apple Notes
 * layout already uses) followed by one task per line, bulleted or not.
 * Anything before the first header is treated as "later" so nothing from an
 * unstructured note silently gets dropped.
 */
export function parseImportText(text: string): ParsedImport {
  const result: ParsedImport = { today: [], tomorrow: [], later: [] };
  let current: Bucket | null = null;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const header = SECTION_HEADERS.find((h) => h.pattern.test(line));
    if (header) {
      current = header.bucket;
      continue;
    }

    const title = stripBullet(line);
    if (!title) continue;

    result[current ?? "later"].push(title);
  }

  return result;
}

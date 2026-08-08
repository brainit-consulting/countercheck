/** Vendor-name and invoice-number normalisation, plus the similarity used to
 * decide that two spellings are the same supplier.
 *
 * This is deliberately deterministic and readable. Every finding has to be
 * explainable to the person whose invoice was flagged, which rules out an opaque
 * similarity model — you cannot tell a supplier "the embedding said so".
 */

const LEGAL_SUFFIXES = [
  "ltd", "limited", "llc", "l l c", "inc", "incorporated", "plc", "gmbh",
  "pty", "corp", "corporation", "co", "company", "llp", "lp", "sa", "bv", "ag",
];

/** Lower-case, strip punctuation and legal suffixes, collapse whitespace. */
export function normaliseVendor(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const words = base.split(" ").filter((w) => !LEGAL_SUFFIXES.includes(w));
  return (words.length ? words : base.split(" ")).join(" ").trim();
}

/** Invoice numbers vary by punctuation and leading zeros far more than by content. */
export function normaliseInvoiceNumber(n: string): string {
  const stripped = n.toLowerCase().replace(/[^a-z0-9]/g, "");
  // Drop leading zeros on the numeric tail: INV-0042 and INV42 are the same document.
  return stripped.replace(/^([a-z]*)0+(\d)/, "$1$2");
}

/** Levenshtein distance, iterative with two rows. */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({length: b.length + 1}, (_, i) => i);
  let curr = new Array<number>(b.length + 1);
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length];
}

/** 0..1 similarity of two vendor names, after normalisation. */
export function vendorSimilarity(a: string, b: string): number {
  const x = normaliseVendor(a);
  const y = normaliseVendor(b);
  if (!x.length && !y.length) return 1;
  if (x === y) return 1;
  const longest = Math.max(x.length, y.length);
  return 1 - levenshtein(x, y) / longest;
}

/** Whole days between two ISO dates, absolute. */
export function daysBetween(a: string, b: string): number {
  const ms = Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`));
  return Math.round(ms / 86_400_000);
}

/**
 * True when two amounts differ only by transposed adjacent digits — 1890 vs 1980.
 * A classic keying error that a same-amount rule will never catch.
 */
export function isTransposition(a: number, b: number): boolean {
  if (a === b) return false;
  const [x, y] = [a, b].map((n) => Math.round(n * 100).toString());
  if (x.length !== y.length) return false;
  const diff: number[] = [];
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) diff.push(i);
  if (diff.length !== 2) return false;
  const [i, j] = diff;
  return x[i] === y[j] && x[j] === y[i];
}

/**
 * A vendor+amount pair that recurs on a steady monthly cadence is a subscription
 * or a contract, not a duplicate. This is the single most important guard in the
 * engine: without it, every cleaning contract and software licence in the ledger
 * is reported as fraud and people stop reading the findings.
 */
export function looksLikeRegularSchedule(dates: string[]): boolean {
  if (dates.length < 3) return false;
  const sorted = [...dates].sort();
  const gaps: number[] = [];
  for (let i = 1; i < sorted.length; i++) gaps.push(daysBetween(sorted[i - 1], sorted[i]));
  // Monthly-ish, and consistent: every gap within a few days of the average.
  const avg = gaps.reduce((s, g) => s + g, 0) / gaps.length;
  if (avg < 25 || avg > 37) return false;
  return gaps.every((g) => Math.abs(g - avg) <= 4);
}

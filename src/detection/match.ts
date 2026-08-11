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

/**
 * Whole days between two ISO dates, absolute.
 *
 * Infinity, not NaN, when a date cannot be read. Every caller compares the
 * result against a threshold, and NaN fails every comparison silently — the
 * pair sails past `gap > rekeyWindowDays` and is reported to a human as
 * "billed twice within NaN days".
 */
export function daysBetween(a: string, b: string): number {
  const ms = Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`));
  return Number.isFinite(ms) ? Math.round(ms / 86_400_000) : Infinity;
}

/**
 * True when two amounts differ only by two transposed *adjacent* digits —
 * 1890 vs 1980.
 *
 * Adjacency matters. Without it, 1,000,890 and 1,890,000 count as a keying
 * error, and the finding tells someone their supplier mistyped an amount when
 * the two numbers are nothing like each other. A finger slipping between two
 * neighbouring keys is the error this rule is named for; anything else is a
 * coincidence dressed up as evidence.
 */
export function isTransposition(a: number, b: number): boolean {
  if (a === b) return false;
  const [x, y] = [a, b].map((n) => Math.round(n * 100).toString());
  if (x.length !== y.length) return false;
  const diff: number[] = [];
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) diff.push(i);
  if (diff.length !== 2) return false;
  const [i, j] = diff;
  if (j - i !== 1) return false;
  return x[i] === y[j] && x[j] === y[i];
}

/**
 * Words that mean "a different one of these", not "a typo of this".
 *
 * Two supplier records reading *Rookwood Cleaning North* and *Rookwood Cleaning
 * South* score 0.913, well over the 0.86 the spelling rule merges at. They are
 * not one company spelled two ways. They are two sites, and reporting their
 * invoices as one company paid twice is an accusation about somebody's
 * paperwork that happens to be false.
 *
 * A typo makes a name nearly the same by accident. These tokens make it nearly
 * the same on purpose, and the nearness is the whole problem: the more
 * carefully a company names its branches, the more alike they look.
 *
 * Raised by the 2026-08-08 review as finding 20, never verified by it, and
 * still true when it was finally executed on 2026-08-11.
 */
const CONTRASTIVE = new Set([
  "north", "south", "east", "west", "northern", "southern", "eastern", "western",
  "northeast", "northwest", "southeast", "southwest", "central", "upper", "lower",
  "inner", "outer", "first", "second", "third", "fourth", "fifth",
  "one", "two", "three", "four", "five", "ii", "iii", "iv",
]);

const isContrastive = (token: string) => CONTRASTIVE.has(token) || /^\d+$/.test(token);

/**
 * True when the only thing separating two supplier names is a token naming a
 * different branch, site or number.
 *
 * Deliberately one-sided: it refuses the merge whenever the whole difference is
 * contrastive, including when one name simply carries an extra number ("Acme"
 * against "Acme 2"). Missing a real duplicate costs a finding nobody sees.
 * Inventing one costs a supplier being told they were paid twice when they were
 * not, and those two costs are not the same size.
 */
export function differsOnlyByBranch(a: string, b: string): boolean {
  const left = new Set(normaliseVendor(a).split(" ").filter(Boolean));
  const right = new Set(normaliseVendor(b).split(" ").filter(Boolean));
  const onlyLeft = [...left].filter((w) => !right.has(w));
  const onlyRight = [...right].filter((w) => !left.has(w));
  if (!onlyLeft.length && !onlyRight.length) return false;  // identical — the exact rule's job
  return [...onlyLeft, ...onlyRight].every(isContrastive);
}

/** Last four digits, however the export chose to render them. */
export const normaliseBank = (s: string | undefined) =>
  (s ?? "").replace(/\D/g, "").slice(-4).padStart(4, "0");

/**
 * A vendor+amount pair that recurs on a steady cadence is a subscription or a
 * contract, not a duplicate. This is the single most important guard in the
 * engine: without it, every cleaning contract and software licence in the ledger
 * is reported as fraud and people stop reading the findings.
 *
 * The cadence is discovered, not assumed. An earlier version accepted only a
 * monthly rhythm, which left every weekly, fortnightly and twice-monthly
 * contract unguarded — and since the re-key rule fires on any gap up to
 * `rekeyWindowDays` (21), that whole band was exactly where the false positives
 * landed. One legitimate weekly retainer took the demo ledger from 6 findings to
 * 57. The tests below pin all four rhythms.
 *
 * Tolerance scales with the cadence: a quarterly bill drifting nine days is
 * still quarterly, while a weekly one drifting nine days is not weekly at all.
 *
 * A series with one genuine duplicate inside it fails this test, and that is
 * correct — the odd gap is the finding, and the rule's own window then reports
 * only the pair that is actually close together.
 */
export function scheduleCadence(dates: string[]): number | null {
  if (dates.length < 3) return null;
  const sorted = [...dates].sort();
  const gaps: number[] = [];
  for (let i = 1; i < sorted.length; i++) gaps.push(daysBetween(sorted[i - 1], sorted[i]));

  // The median, not the mean: one irregular gap should not drag the yardstick
  // it is about to be measured against.
  const ordered = [...gaps].sort((a, b) => a - b);
  const mid = Math.floor(ordered.length / 2);
  const median = ordered.length % 2 ? ordered[mid] : (ordered[mid - 1] + ordered[mid]) / 2;

  // Below this a repeat is not a rhythm. Nobody contracts to be billed the same
  // amount every three days; that pattern is the thing we are looking for.
  if (median < 5) return null;

  // Most of the series has to keep the beat, not all of it. A year of monthly
  // billing with one invoice entered twice is still monthly — and that one
  // invoice is precisely what we want left exposed, which is why the caller
  // tests each gap against the cadence rather than skipping the whole supplier.
  const onBeat = gaps.filter((g) => Math.abs(g - median) <= cadenceTolerance(median)).length;
  return onBeat / gaps.length >= 0.7 ? median : null;
}

/** A quarterly bill drifting nine days is still quarterly. A weekly one is not. */
export const cadenceTolerance = (cadence: number) => Math.max(3, cadence * 0.15);

/** Does this gap fall on the beat of a known cadence? */
export const onSchedule = (gap: number, cadence: number) =>
  Math.abs(gap - cadence) <= cadenceTolerance(cadence);

export const looksLikeRegularSchedule = (dates: string[]): boolean =>
  scheduleCadence(dates) !== null;

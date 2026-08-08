import {DEFAULT_OPTIONS, type DetectionOptions, type Finding, type Invoice} from "../types";
import {ALL_RULES} from "./rules";

const SEVERITY_ORDER = {high: 0, medium: 1, low: 2} as const;

/**
 * Rules that answer the same question about the same rows, and so must not both
 * appear in the queue. All four say "these two rows are one payment made twice";
 * they differ only in how they noticed.
 *
 * A bank-detail change is NOT in this family. It is a different question about
 * the same rows — not "did you pay twice" but "did this money go somewhere new"
 * — and it was being deleted whenever a duplicate rule happened to cover the
 * same pair, which quietly threw away the highest-value finding the product has.
 */
const DUPLICATE_FAMILY = new Set([
  "exact-duplicate",
  "rekeyed-duplicate",
  "vendor-spelling-duplicate",
  "amount-transposition",
]);

/**
 * The same pair of rows can trip more than one duplicate rule — an exact
 * duplicate is also a same-amount pair. Keep the strongest of those so the
 * review queue shows a person one decision, not three. Findings from outside
 * that family survive alongside it.
 */
function collapse(findings: Finding[]): Finding[] {
  const best = new Map<string, Finding>();
  const kept: Finding[] = [];

  for (const f of findings) {
    if (!DUPLICATE_FAMILY.has(f.ruleId)) { kept.push(f); continue; }
    const key = [...f.invoiceIds].sort().join("|");
    const existing = best.get(key);
    if (!existing) { best.set(key, f); continue; }
    const stronger =
      SEVERITY_ORDER[f.severity] < SEVERITY_ORDER[existing.severity] ||
      (f.severity === existing.severity && f.amountAtStake > existing.amountAtStake);
    if (stronger) best.set(key, f);
  }
  return [...best.values(), ...kept];
}

export type DetectionResult = {
  findings: Finding[];
  /** Totals a finance lead reads first. */
  summary: {
    invoicesExamined: number;
    findings: number;
    totalAtStake: number;
    byRule: Record<string, {count: number; atStake: number}>;
  };
};

export function detect(rows: Invoice[], options: Partial<DetectionOptions> = {}): DetectionResult {
  const o = {...DEFAULT_OPTIONS, ...options};
  const raw = ALL_RULES.flatMap((rule) => rule(rows, o));
  const findings = collapse(raw).sort((a, b) =>
    SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || b.amountAtStake - a.amountAtStake);

  const byRule: Record<string, {count: number; atStake: number}> = {};
  for (const f of findings) {
    const entry = byRule[f.ruleId] ?? (byRule[f.ruleId] = {count: 0, atStake: 0});
    entry.count += 1;
    entry.atStake += f.amountAtStake;
  }

  return {
    findings,
    summary: {
      invoicesExamined: rows.length,
      findings: findings.length,
      totalAtStake: findings.reduce((s, f) => s + f.amountAtStake, 0),
      byRule,
    },
  };
}

import {DEFAULT_OPTIONS, type DetectionOptions, type Finding, type Invoice} from "../types";
import {ALL_RULES} from "./rules";

const SEVERITY_ORDER = {high: 0, medium: 1, low: 2} as const;

/**
 * The same pair of rows can trip more than one rule — an exact duplicate is also
 * a same-amount pair. Keep the strongest finding per set of rows so the review
 * queue shows a person one decision, not three.
 */
function collapse(findings: Finding[]): Finding[] {
  const best = new Map<string, Finding>();
  for (const f of findings) {
    const key = [...f.invoiceIds].sort().join("|");
    const existing = best.get(key);
    if (!existing) { best.set(key, f); continue; }
    const stronger =
      SEVERITY_ORDER[f.severity] < SEVERITY_ORDER[existing.severity] ||
      (f.severity === existing.severity && f.amountAtStake > existing.amountAtStake);
    if (stronger) best.set(key, f);
  }
  return [...best.values()];
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

import type {DetectionOptions, Finding, Invoice} from "../types";
import {
  daysBetween, isTransposition, onSchedule, scheduleCadence,
  normaliseBank, normaliseInvoiceNumber, normaliseVendor, vendorSimilarity,
} from "./match";
import {money} from "../../lib/money";

const payables = (rows: Invoice[]) => rows.filter((r) => r.amount > 0);
const credits = (rows: Invoice[]) => rows.filter((r) => r.amount < 0);

/**
 * Every rule that compares two amounts must first agree they are the same kind
 * of money. €5,610.75 and £5,610.75 are not a duplicate. They are two different
 * sums, and how different depends on a rate this product does not know and has
 * no business guessing — which is the whole reason they cannot be compared.
 * Reporting them as one payment, formatted in a single currency, is exactly the
 * sort of confident nonsense that ends a reader's trust in the queue.
 *
 * So currency is part of every grouping key, and the pairwise rules check it
 * again where they compare rows the key did not already separate.
 */
const cur = (r: Invoice) => (r.currency || "GBP").toUpperCase();

/** Group rows by a derived key. */
function groupBy<T>(rows: T[], key: (r: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const r of rows) {
    const k = key(r);
    const list = m.get(k);
    if (list) list.push(r); else m.set(k, [r]);
  }
  return m;
}

/**
 * Same supplier, same amount, same invoice number. The unambiguous case.
 *
 * Keyed on the *raw* supplier name, not the normalised one. When the two rows
 * carry different spellings the finding belongs to the vendor-spelling rule,
 * whose explanation tells the reader the more useful thing: that they have two
 * supplier records for one company.
 */
export function exactDuplicates(rows: Invoice[], o: DetectionOptions): Finding[] {
  const out: Finding[] = [];
  const groups = groupBy(payables(rows).filter((r) => r.amount >= o.minAmount), (r) =>
    `${r.vendorName}|${cur(r)}|${r.amount}|${normaliseInvoiceNumber(r.invoiceNumber)}`);
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const sorted = [...group].sort((a, b) => a.invoiceDate.localeCompare(b.invoiceDate));
    const extra = sorted.length - 1;
    out.push({
      ruleId: "exact-duplicate",
      severity: "high",
      amountAtStake: sorted[0].amount * extra,
      invoiceIds: sorted.map((r) => r.id),
      explanation: `${sorted[0].vendorName} invoice ${sorted[0].invoiceNumber} for ${money(sorted[0].amount, sorted[0].currency)} appears ${sorted.length} times. ${extra === 1 ? "One is" : `${extra} are`} probably a duplicate payment.`,
    });
  }
  return out;
}

/**
 * Same supplier and amount, close together, but different invoice numbers — an
 * invoice re-entered by hand. Guarded against regular contracts, which are the
 * dominant false positive in any real ledger.
 */
export function rekeyedDuplicates(rows: Invoice[], o: DetectionOptions): Finding[] {
  const out: Finding[] = [];
  const groups = groupBy(payables(rows).filter((r) => r.amount >= o.minAmount), (r) =>
    `${normaliseVendor(r.vendorName)}|${cur(r)}|${r.amount}`);

  for (const group of groups.values()) {
    if (group.length < 2) continue;
    // A steady cadence — weekly, fortnightly, monthly, quarterly — is a contract,
    // not a duplicate.
    //
    // The cadence is applied per pair rather than by skipping the supplier
    // outright. Skipping the group works for monthly billing only because a
    // 30-day gap already exceeds the re-key window; on a weekly contract every
    // adjacent pair is inside that window, so one genuine duplicate would
    // unguard the entire year and report all fifty-two.
    const cadence = scheduleCadence(group.map((r) => r.invoiceDate));

    const sorted = [...group].sort((a, b) => a.invoiceDate.localeCompare(b.invoiceDate));
    for (let i = 0; i < sorted.length - 1; i++) {
      const a = sorted[i];
      const b = sorted[i + 1];
      if (normaliseInvoiceNumber(a.invoiceNumber) === normaliseInvoiceNumber(b.invoiceNumber)) continue;
      const gap = daysBetween(a.invoiceDate, b.invoiceDate);
      if (gap > o.rekeyWindowDays) continue;
      if (cadence !== null && onSchedule(gap, cadence)) continue;
      out.push({
        ruleId: "rekeyed-duplicate",
        severity: "high",
        amountAtStake: b.amount,
        invoiceIds: [a.id, b.id],
        explanation: `${a.vendorName} was billed ${money(a.amount, a.currency)} twice within ${gap} day${gap === 1 ? "" : "s"} under different invoice numbers (${a.invoiceNumber} and ${b.invoiceNumber}). This is the pattern of an invoice entered twice.`,
      });
    }
  }
  return out;
}

/** One invoice number and amount, two spellings of the supplier. */
export function vendorSpellingDuplicates(rows: Invoice[], o: DetectionOptions): Finding[] {
  const out: Finding[] = [];
  const groups = groupBy(payables(rows).filter((r) => r.amount >= o.minAmount), (r) =>
    `${normaliseInvoiceNumber(r.invoiceNumber)}|${cur(r)}|${r.amount}`);

  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const sorted = [...group].sort((a, b) => a.invoiceDate.localeCompare(b.invoiceDate));

    /**
     * One finding per problem, not one per pair.
     *
     * Emitting every pair independently meant three supplier records for one
     * company produced three queue items for a single invoice paid three times,
     * each carrying its own amount at stake — so the headline figure counted the
     * same money more than once. The rows are gathered into one accusation
     * instead, which is also how a person would put it.
     */
    const first = sorted[0];
    const sameCompany = sorted.filter((r) =>
      r === first || vendorSimilarity(first.vendorName, r.vendorName) >= o.vendorSimilarity);
    const spellings = [...new Set(sameCompany.map((r) => r.vendorName))];
    // Identical spelling throughout is the exact rule's job. Anything else that
    // resolves to the same supplier belongs here, including names that differ
    // only by a legal suffix — those normalise to equal, which scores 1.0.
    if (sameCompany.length < 2 || spellings.length < 2) continue;

    const extra = sameCompany.length - 1;
    out.push({
      ruleId: "vendor-spelling-duplicate",
      severity: "high",
      amountAtStake: first.amount * extra,
      invoiceIds: sameCompany.map((r) => r.id),
      explanation: `Invoice ${first.invoiceNumber} for ${money(first.amount, first.currency)} was paid ${sameCompany.length} times, to supplier records that look like the same company: ${spellings.map((s) => `"${s}"`).join(", ")}.`,
    });
  }
  return out;
}

/** Two adjacent digits swapped — 1,890 keyed as 1,980. */
export function amountTranspositions(rows: Invoice[], o: DetectionOptions): Finding[] {
  const out: Finding[] = [];
  const groups = groupBy(payables(rows).filter((r) => r.amount >= o.minAmount),
    (r) => normaliseVendor(r.vendorName));

  for (const group of groups.values()) {
    const sorted = [...group].sort((a, b) => a.invoiceDate.localeCompare(b.invoiceDate));
    for (let i = 0; i < sorted.length - 1; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        const a = sorted[i];
        const b = sorted[j];
        if (daysBetween(a.invoiceDate, b.invoiceDate) > o.rekeyWindowDays) break;
        if (cur(a) !== cur(b)) continue;
        if (!isTransposition(a.amount, b.amount)) continue;
        out.push({
          ruleId: "amount-transposition",
          severity: "medium",
          amountAtStake: Math.min(a.amount, b.amount),
          invoiceIds: [a.id, b.id],
          explanation: `${a.vendorName} has two invoices days apart for ${money(a.amount, a.currency)} and ${money(b.amount, b.currency)} — the same digits in a different order, which is how a mistyped amount usually looks.`,
        });
      }
    }
  }
  return out;
}

/** A credit note nobody ever took off a later bill. */
export function unappliedCredits(rows: Invoice[], o: DetectionOptions): Finding[] {
  const out: Finding[] = [];
  const byVendor = groupBy(rows, (r) => normaliseVendor(r.vendorName));
  for (const group of byVendor.values()) {
    const vendorCredits = credits(group);
    if (!vendorCredits.length) continue;
    const vendorPayables = payables(group);
    for (const credit of vendorCredits) {
      const value = Math.abs(credit.amount);
      if (value < o.minAmount) continue;
      // Applied if any later payable is reduced by exactly this credit, or if a
      // later payable matches the credit's own amount (a straight offset).
      const applied = vendorPayables.some((p) =>
        cur(p) === cur(credit) &&
        p.invoiceDate >= credit.invoiceDate && Math.abs(p.amount - value) < 0.005);
      if (applied) continue;
      out.push({
        ruleId: "unapplied-credit",
        severity: "medium",
        amountAtStake: value,
        invoiceIds: [credit.id],
        explanation: `${credit.vendorName} issued a credit note (${credit.invoiceNumber}) for ${money(value, credit.currency)} on ${credit.invoiceDate} and nothing since appears to use it. This is money you are owed.`,
      });
    }
  }
  return out;
}

/** The bank details on a supplier changed, then money went to the new account. */
export function bankDetailChanges(rows: Invoice[], o: DetectionOptions): Finding[] {
  const out: Finding[] = [];
  const byVendor = groupBy(payables(rows).filter((r) => r.bankLast4 && r.amount >= o.minAmount),
    (r) => normaliseVendor(r.vendorName));

  for (const group of byVendor.values()) {
    const sorted = [...group].sort((a, b) => a.invoiceDate.localeCompare(b.invoiceDate));
    // Normalised, because "0042" and "42" are one account and raising a
    // payment-diversion alert over a leading zero is how a real alert gets
    // ignored.
    const seen = new Set<string>([normaliseBank(sorted[0].bankLast4)]);
    for (let i = 1; i < sorted.length; i++) {
      const row = sorted[i];
      const acct = normaliseBank(row.bankLast4);
      if (seen.has(acct)) continue;
      const previous = [...seen].join(", ");
      seen.add(acct);

      // Everything that went to the new account from here on, not just the first
      // invoice. In a redirection fraud the first payment is the test and the
      // rest is the loss — ranking this by the test amount buries the largest
      // exposure in the product beneath a stack of smaller duplicates.
      const toNewAccount = sorted.slice(i).filter((r) => normaliseBank(r.bankLast4) === acct);
      const exposure = toNewAccount.reduce((s, r) => s + r.amount, 0);
      const more = toNewAccount.length - 1;

      out.push({
        ruleId: "bank-detail-change",
        severity: "high",
        amountAtStake: exposure,
        invoiceIds: [sorted[i - 1].id, ...toNewAccount.map((r) => r.id)],
        explanation: `Payments to ${row.vendorName} moved to a new bank account ending ${acct} on ${row.invoiceDate}, after previously going to ${previous}.${more > 0 ? ` ${more + 1} invoices totalling ${money(exposure, row.currency)} have gone to the new account since.` : ""} Confirm the change by phone using a number you already hold, not one from the invoice.`,
      });
    }
  }
  return out;
}

/** Large, suspiciously round amounts that do not match how this supplier normally bills. */
export function roundNumberOutliers(rows: Invoice[], o: DetectionOptions): Finding[] {
  const out: Finding[] = [];
  const byVendor = groupBy(payables(rows), (r) => `${normaliseVendor(r.vendorName)}|${cur(r)}`);
  for (const group of byVendor.values()) {
    if (group.length < 4) continue; // not enough history to call anything unusual
    const round = (n: number) => n >= o.roundNumberThreshold && Number.isInteger(n / 1000);
    const rounds = group.filter((r) => round(r.amount));
    if (!rounds.length) continue;
    // Three or more round-thousand invoices is not an anomaly, it is how this
    // supplier bills — insurers and retainers look exactly like this. A ratio
    // test is not enough on its own, because ordinary traffic dilutes it.
    if (rounds.length >= 3 || rounds.length / group.length > 0.3) continue;
    for (const r of rounds) {
      out.push({
        ruleId: "round-number-outlier",
        severity: "low",
        amountAtStake: r.amount,
        invoiceIds: [r.id],
        explanation: `${r.vendorName} is usually billed in odd amounts, but invoice ${r.invoiceNumber} is exactly ${money(r.amount, r.currency)}. Worth confirming what it covers.`,
      });
    }
  }
  return out;
}

export const ALL_RULES = [
  exactDuplicates,
  rekeyedDuplicates,
  vendorSpellingDuplicates,
  amountTranspositions,
  unappliedCredits,
  bankDetailChanges,
  roundNumberOutliers,
] as const;

import {describe, expect, it} from "vitest";
import {detect} from "../src/detection/engine";
import {generateLedger} from "../src/demo/generate";
import {isTransposition, looksLikeRegularSchedule, normaliseInvoiceNumber, normaliseVendor, vendorSimilarity} from "../src/detection/match";

const ledger = generateLedger();
const result = detect(ledger.rows);
const flagged = new Set(result.findings.flatMap((f) => f.invoiceIds));
const findingFor = (ids: string[]) =>
  result.findings.find((f) => ids.every((id) => f.invoiceIds.includes(id)));

describe("normalisation", () => {
  it("treats legal suffixes and punctuation as noise", () => {
    expect(normaliseVendor("Westbay Electrical Ltd.")).toBe(normaliseVendor("Westbay Electrical"));
    expect(normaliseVendor("Acme & Sons, Inc")).toBe("acme and sons");
  });

  it("treats invoice numbers as the same document across formatting", () => {
    expect(normaliseInvoiceNumber("WB-2291")).toBe(normaliseInvoiceNumber("WB2291"));
    expect(normaliseInvoiceNumber("INV-0042")).toBe(normaliseInvoiceNumber("INV42"));
  });

  it("scores similar supplier names highly and different ones low", () => {
    expect(vendorSimilarity("Westbay Electrical", "Westbay Electrical Ltd")).toBe(1);
    expect(vendorSimilarity("Kestrel Logistics", "Ashworth Legal")).toBeLessThan(0.5);
  });

  it("recognises a digit transposition but not an unrelated difference", () => {
    expect(isTransposition(1890, 1980)).toBe(true);
    expect(isTransposition(1890, 1890)).toBe(false);
    expect(isTransposition(1890, 2450)).toBe(false);
  });

  it("recognises a monthly cadence", () => {
    expect(looksLikeRegularSchedule(["2025-09-01", "2025-10-01", "2025-11-01", "2025-12-01"])).toBe(true);
    expect(looksLikeRegularSchedule(["2025-09-01", "2025-09-04", "2025-09-06"])).toBe(false);
  });
});

describe("every planted issue is found", () => {
  for (const issue of ledger.planted) {
    it(`${issue.ruleId}: ${issue.note}`, () => {
      const finding = findingFor(issue.invoiceIds);
      expect(finding, `no finding covering ${issue.invoiceIds.join(" + ")}`).toBeDefined();
      expect(finding!.ruleId).toBe(issue.ruleId);
      expect(finding!.amountAtStake).toBeGreaterThan(0);
      // Every finding has to be readable by the person whose invoice was flagged.
      expect(finding!.explanation.length).toBeGreaterThan(40);
      expect(finding!.explanation).toMatch(/[.!]$/);
    });
  }
});

describe("legitimate lookalikes are left alone", () => {
  for (const trap of ledger.traps) {
    it(trap.note, () => {
      const wrongly = trap.invoiceIds.filter((id) => flagged.has(id));
      expect(wrongly, `false positive on ${wrongly.join(", ")}`).toEqual([]);
    });
  }
});

describe("the monthly contract specifically", () => {
  it("is not reported as a duplicate even though every amount is identical", () => {
    const contract = ledger.rows.filter((r) => r.invoiceNumber.startsWith("RC-CONTRACT"));
    expect(contract.length).toBe(12);
    expect(new Set(contract.map((r) => r.amount)).size).toBe(1);
    const hits = result.findings.filter((f) =>
      f.invoiceIds.some((id) => contract.some((c) => c.id === id)));
    expect(hits).toEqual([]);
  });
});

describe("precision", () => {
  /**
   * The first version of this engine reported eleven findings against six planted
   * problems — five spurious "bank account changed" alerts caused by unrealistic
   * demo data. Every test still passed, because they only asked whether real
   * problems were found and traps were left alone.
   *
   * Noise is a defect. A review queue padded with junk trains a finance team to
   * ignore the queue, which is worse than shipping nothing. So the count is
   * asserted directly.
   */
  it("reports exactly the problems that exist, and no filler", () => {
    const unexplained = result.findings.filter((f) =>
      !ledger.planted.some((p) => p.invoiceIds.every((id) => f.invoiceIds.includes(id))));
    expect(
      unexplained.map((f) => `${f.ruleId}: ${f.explanation}`),
      "findings that match nothing we planted",
    ).toEqual([]);
    expect(result.findings.length).toBe(ledger.planted.length);
  });

  it("keeps every finding tied to real money", () => {
    for (const f of result.findings) expect(f.amountAtStake).toBeGreaterThan(0);
  });
});

describe("result shape", () => {
  it("summarises what a finance lead reads first", () => {
    expect(result.summary.invoicesExamined).toBe(ledger.rows.length);
    expect(result.summary.findings).toBe(result.findings.length);
    expect(result.summary.totalAtStake).toBeGreaterThan(0);
  });

  it("orders findings by severity then by money at stake", () => {
    const rank = {high: 0, medium: 1, low: 2} as const;
    for (let i = 1; i < result.findings.length; i++) {
      const prev = result.findings[i - 1];
      const cur = result.findings[i];
      expect(rank[prev.severity]).toBeLessThanOrEqual(rank[cur.severity]);
      if (prev.severity === cur.severity) {
        expect(prev.amountAtStake).toBeGreaterThanOrEqual(cur.amountAtStake);
      }
    }
  });

  it("reports one decision per set of rows, not one per rule", () => {
    const keys = result.findings.map((f) => [...f.invoiceIds].sort().join("|"));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("is deterministic", () => {
    expect(detect(generateLedger().rows).summary).toEqual(result.summary);
  });
});

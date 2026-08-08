import {describe, expect, it} from "vitest";
import {detect} from "../src/detection/engine";
import {generateLedger} from "../src/demo/generate";
import {isTransposition, looksLikeRegularSchedule, scheduleCadence, normaliseInvoiceNumber, normaliseVendor, vendorSimilarity} from "../src/detection/match";

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

  /**
   * The cadences below are the ones a real ledger actually contains. An earlier
   * version of this guard recognised only the monthly case, which left every
   * weekly and fortnightly contract to be reported as a duplicate — a single
   * weekly retainer took the demo ledger from 6 findings to 57.
   */
  describe("the regular-schedule guard", () => {
    const every = (n: number, count: number, from = "2025-09-01") => {
      const out: string[] = [];
      const d = new Date(`${from}T00:00:00Z`);
      for (let i = 0; i < count; i++) {
        out.push(d.toISOString().slice(0, 10));
        d.setUTCDate(d.getUTCDate() + n);
      }
      return out;
    };

    it("recognises weekly, fortnightly, monthly and quarterly contracts", () => {
      expect(looksLikeRegularSchedule(every(7, 12))).toBe(true);
      expect(looksLikeRegularSchedule(every(14, 8))).toBe(true);
      expect(looksLikeRegularSchedule(every(30, 6))).toBe(true);
      expect(looksLikeRegularSchedule(every(91, 4))).toBe(true);
    });

    it("recognises calendar-monthly billing, whose gaps vary from 28 to 31 days", () => {
      expect(looksLikeRegularSchedule(
        ["2026-01-01", "2026-02-01", "2026-03-01", "2026-04-01", "2026-05-01"],
      )).toBe(true);
    });

    it("recognises two sites billed on the 1st and the 15th", () => {
      expect(looksLikeRegularSchedule(
        ["2026-01-01", "2026-01-15", "2026-02-01", "2026-02-15", "2026-03-01"],
      )).toBe(true);
    });

    it("does not mistake a burst of repeats for a rhythm", () => {
      expect(looksLikeRegularSchedule(["2025-09-01", "2025-09-04", "2025-09-06"])).toBe(false);
      expect(looksLikeRegularSchedule(["2025-09-01", "2025-09-01", "2025-09-02"])).toBe(false);
    });

    it("still reads the rhythm when one invoice inside it was entered twice", () => {
      const dates = every(30, 8);
      dates.splice(3, 0, dates[2]);   // the same month billed twice
      // The cadence survives the anomaly. Exposing that one pair is the caller's
      // job, tested end to end below — a guard that lost the rhythm here would
      // report the whole contract.
      expect(scheduleCadence(dates)).toBe(30);
    });

    it("needs three dates before it will call anything a schedule", () => {
      expect(looksLikeRegularSchedule(["2025-09-01", "2025-10-01"])).toBe(false);
    });
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

/**
 * Two defects that a code review found after the demo ledger was already clean.
 * Both are here as end-to-end runs through the real engine rather than unit
 * tests of a helper, because in both cases the helper looked reasonable in
 * isolation and only the whole pipeline showed what it did to a reader.
 */
describe("contracts that are not billed monthly", () => {
  const series = (n: number, count: number, prefix: string) =>
    Array.from({length: count}, (_, i) => {
      const d = new Date("2026-01-05T00:00:00Z");
      d.setUTCDate(d.getUTCDate() + i * n);
      return {
        id: `${prefix}-${i}`,
        vendorName: "Rookwood Cleaning",
        invoiceNumber: `${prefix}${100 + i}`,
        invoiceDate: d.toISOString().slice(0, 10),
        amount: 480,
        currency: "GBP",
        bankLast4: "1331",
      };
    });

  it("does not report a weekly retainer as 25 duplicate payments", () => {
    const {findings} = detect(series(7, 26, "RC-W"));
    expect(findings.map((f) => f.explanation)).toEqual([]);
  });

  it("does not report a fortnightly contract as duplicates", () => {
    const {findings} = detect(series(14, 12, "RC-F"));
    expect(findings.map((f) => f.explanation)).toEqual([]);
  });

  it("still reports a genuine repeat inside an otherwise weekly series", () => {
    const rows = series(7, 12, "RC-W");
    rows.splice(5, 0, {...rows[4], id: "RC-W-dup", invoiceNumber: "RC-W999"});
    const {findings} = detect(rows);
    expect(findings.length).toBe(1);
    expect(findings[0].ruleId).toBe("rekeyed-duplicate");
    expect(findings[0].invoiceIds).toContain("RC-W-dup");
  });
});

describe("currency", () => {
  const pair = (a: string, b: string) => [
    {id: "a", vendorName: "Kestrel Logistics", invoiceNumber: "KES-1",
     invoiceDate: "2026-03-02", amount: 5610.75, currency: a},
    {id: "b", vendorName: "Kestrel Logistics", invoiceNumber: "KES-2",
     invoiceDate: "2026-03-07", amount: 5610.75, currency: b},
  ];

  it("does not call the same number in two currencies a duplicate", () => {
    expect(detect(pair("GBP", "EUR")).findings).toEqual([]);
  });

  it("still catches it when both are the same currency", () => {
    const {findings} = detect(pair("GBP", "GBP"));
    expect(findings.length).toBe(1);
    expect(findings[0].ruleId).toBe("rekeyed-duplicate");
  });

  it("does not settle a euro credit note with a sterling payment", () => {
    const {findings} = detect([
      {id: "c", vendorName: "Marlow Logistics", invoiceNumber: "CN-1",
       invoiceDate: "2026-03-01", amount: -640, currency: "EUR"},
      {id: "p", vendorName: "Marlow Logistics", invoiceNumber: "ML-1",
       invoiceDate: "2026-03-20", amount: 640, currency: "GBP"},
    ]);
    expect(findings.map((f) => f.ruleId)).toEqual(["unapplied-credit"]);
  });
});

describe("a bank change is a different question from a duplicate", () => {
  // Both rules match the same two rows. Collapsing by row set alone deleted the
  // bank finding, which is the highest-value thing the product detects.
  const rows = [
    {id: "1", vendorName: "Halden Systems", invoiceNumber: "HS-1",
     invoiceDate: "2026-02-01", amount: 3200, currency: "GBP", bankLast4: "8842"},
    {id: "2", vendorName: "Halden Systems", invoiceNumber: "HS-2",
     invoiceDate: "2026-02-09", amount: 3200, currency: "GBP", bankLast4: "2077"},
  ];

  it("reports both, not the stronger one", () => {
    const ids = detect(rows).findings.map((f) => f.ruleId).sort();
    expect(ids).toEqual(["bank-detail-change", "rekeyed-duplicate"]);
  });

  it("counts everything that went to the new account, not just the first invoice", () => {
    const withMore = [
      ...rows,
      {id: "3", vendorName: "Halden Systems", invoiceNumber: "HS-3",
       invoiceDate: "2026-03-04", amount: 9100, currency: "GBP", bankLast4: "2077"},
      {id: "4", vendorName: "Halden Systems", invoiceNumber: "HS-4",
       invoiceDate: "2026-04-02", amount: 7400, currency: "GBP", bankLast4: "2077"},
    ];
    const bank = detect(withMore).findings.find((f) => f.ruleId === "bank-detail-change")!;
    expect(bank.amountAtStake).toBe(3200 + 9100 + 7400);
    expect(bank.explanation).toContain("3 invoices totalling");
  });
});

describe("money formatting", () => {
  it("does not throw on a currency code Intl does not know", () => {
    const rows = [
      {id: "1", vendorName: "Acme", invoiceNumber: "A-1",
       invoiceDate: "2026-02-01", amount: 900, currency: "ZZZ"},
      {id: "2", vendorName: "Acme", invoiceNumber: "A-2",
       invoiceDate: "2026-02-05", amount: 900, currency: "ZZZ"},
    ];
    const {findings} = detect(rows);
    expect(findings.length).toBe(1);
    expect(findings[0].explanation).toContain("ZZZ");
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

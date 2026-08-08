import type {Invoice} from "../types";

/**
 * A believable accounts-payable export.
 *
 * Two things make this useful rather than decorative. It plants real problems
 * with known identities, so detection can be asserted exactly. And it plants
 * *legitimate lookalikes* — a monthly cleaning contract, a supplier who always
 * bills round thousands, a credit note that was properly applied — because an
 * engine that cannot tell those from duplicates is worse than no engine: it
 * trains people to ignore the findings.
 *
 * Deterministic: same seed, same ledger.
 */

function mulberry32(seed: number) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const VENDORS = [
  "Northgate Facilities", "Harlow Print Services", "Bramble IT Solutions",
  "Kestrel Logistics", "Ashworth Legal", "Pinefield Catering",
  "Westbay Electrical", "Marchmont Stationery", "Verity Recruitment",
  "Oakhill Plant Hire", "Sandsend Packaging", "Torrance Security",
  "Lowfield Couriers", "Rookwood Cleaning", "Ellington Media",
  "Bridgeway Insurance", "Calder Waste Services", "Fenwick Tooling",
];

const day = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (from: string, n: number) => iso(new Date(Date.parse(`${from}T00:00:00Z`) + n * day));

export type PlantedIssue = {
  ruleId: string;
  invoiceIds: string[];
  note: string;
};

export type GeneratedLedger = {
  rows: Invoice[];
  /** What we deliberately broke. Detection should find all of these. */
  planted: PlantedIssue[];
  /** What we deliberately made *look* broken but is legitimate. Must not be flagged. */
  traps: {invoiceIds: string[]; note: string}[];
};

export function generateLedger(seed = 20260807, startDate = "2025-09-01"): GeneratedLedger {
  const rnd = mulberry32(seed);
  const rows: Invoice[] = [];
  const planted: PlantedIssue[] = [];
  const traps: {invoiceIds: string[]; note: string}[] = [];
  let n = 0;
  const id = () => `INV-ROW-${String(++n).padStart(5, "0")}`;

  const amount = (min: number, max: number) =>
    Math.round((min + rnd() * (max - min)) * 100) / 100;

  const push = (r: Omit<Invoice, "id" | "currency"> & {currency?: string}): Invoice => {
    const row: Invoice = {id: id(), currency: "GBP", ...r};
    rows.push(row);
    return row;
  };

  // A supplier has one bank account. Randomising it per invoice would make every
  // vendor look like a payment-diversion attempt — the first false positive this
  // generator produced, and a good reminder that unrealistic data hides real bugs.
  const vendorBank = new Map<string, string>();
  for (const v of VENDORS) vendorBank.set(v, String(1000 + Math.floor(rnd() * 8999)));

  // ---- ordinary traffic: odd amounts, irregular dates -----------------------
  for (const vendor of VENDORS) {
    const count = 6 + Math.floor(rnd() * 10);
    let date = addDays(startDate, Math.floor(rnd() * 20));
    for (let i = 0; i < count; i++) {
      date = addDays(date, 8 + Math.floor(rnd() * 26));
      push({
        vendorName: vendor,
        invoiceNumber: `${vendor.slice(0, 3).toUpperCase()}-${1000 + Math.floor(rnd() * 8999)}`,
        invoiceDate: date,
        amount: amount(120, 9400),
        reference: `PO-${4000 + Math.floor(rnd() * 5999)}`,
        bankLast4: vendorBank.get(vendor),
      });
    }
  }

  // ---- TRAP: a monthly contract. Same vendor, same amount, twelve times. ----
  // The single most dangerous false positive in any real ledger.
  {
    const ids: string[] = [];
    let d = startDate;
    for (let m = 0; m < 12; m++) {
      const r = push({
        vendorName: "Rookwood Cleaning",
        invoiceNumber: `RC-CONTRACT-${m + 1}`,
        invoiceDate: d,
        amount: 1450,
        reference: "Monthly cleaning contract",
        bankLast4: vendorBank.get("Rookwood Cleaning"),
      });
      ids.push(r.id);
      d = addDays(d, 30 + Math.floor(rnd() * 2));
    }
    traps.push({invoiceIds: ids, note: "Monthly cleaning contract — same amount every month, legitimate"});
  }

  // ---- TRAP: a supplier who genuinely always bills round thousands ---------
  {
    const ids: string[] = [];
    let d = addDays(startDate, 12);
    for (let i = 0; i < 6; i++) {
      const r = push({
        vendorName: "Bridgeway Insurance",
        invoiceNumber: `BW-${2200 + i}`,
        invoiceDate: d,
        amount: [8000, 12000, 6000, 15000, 9000, 11000][i],
        reference: "Premium instalment",
        bankLast4: vendorBank.get("Bridgeway Insurance"),
      });
      ids.push(r.id);
      d = addDays(d, 45);
    }
    traps.push({invoiceIds: ids, note: "Insurer bills round thousands by nature — not an anomaly"});
  }

  // ---- TRAP: a credit note that was properly applied -----------------------
  {
    const credit = push({
      vendorName: "Fenwick Tooling", invoiceNumber: "FT-CN-901",
      invoiceDate: addDays(startDate, 60), amount: -640, reference: "Returned goods",
    });
    const offset = push({
      vendorName: "Fenwick Tooling", invoiceNumber: "FT-3320",
      invoiceDate: addDays(startDate, 74), amount: 640, reference: "Replacement order",
      bankLast4: vendorBank.get("Fenwick Tooling"),
    });
    traps.push({invoiceIds: [credit.id, offset.id], note: "Credit note offset by a later invoice — correctly applied"});
  }

  // ---- PLANTED: exact duplicate -------------------------------------------
  {
    const base = {
      vendorName: "Harlow Print Services", invoiceNumber: "HAR-4471",
      amount: 3280.5, reference: "PO-8812", bankLast4: vendorBank.get("Harlow Print Services"),
    };
    const a = push({...base, invoiceDate: addDays(startDate, 40)});
    const b = push({...base, invoiceDate: addDays(startDate, 47)});
    planted.push({ruleId: "exact-duplicate", invoiceIds: [a.id, b.id], note: "Same invoice number paid twice"});
  }

  // ---- PLANTED: re-keyed duplicate ----------------------------------------
  {
    const a = push({
      vendorName: "Kestrel Logistics", invoiceNumber: "KES-7781",
      invoiceDate: addDays(startDate, 88), amount: 5610.75, bankLast4: vendorBank.get("Kestrel Logistics"),
    });
    const b = push({
      vendorName: "Kestrel Logistics", invoiceNumber: "KES-7781-A",
      invoiceDate: addDays(startDate, 93), amount: 5610.75, bankLast4: vendorBank.get("Kestrel Logistics"),
    });
    planted.push({ruleId: "rekeyed-duplicate", invoiceIds: [a.id, b.id], note: "Same amount re-entered days later under a new number"});
  }

  // ---- PLANTED: vendor spelled two ways ------------------------------------
  {
    const a = push({
      vendorName: "Westbay Electrical", invoiceNumber: "WB-2291",
      invoiceDate: addDays(startDate, 120), amount: 7420, bankLast4: vendorBank.get("Westbay Electrical"),
    });
    const b = push({
      vendorName: "Westbay Electrical Ltd.", invoiceNumber: "WB2291",
      invoiceDate: addDays(startDate, 131), amount: 7420, bankLast4: vendorBank.get("Westbay Electrical"),
    });
    planted.push({ruleId: "vendor-spelling-duplicate", invoiceIds: [a.id, b.id], note: "One invoice paid to two supplier records"});
  }

  // ---- PLANTED: transposed amount -----------------------------------------
  {
    const a = push({
      vendorName: "Marchmont Stationery", invoiceNumber: "MAR-5510",
      invoiceDate: addDays(startDate, 150), amount: 1890, bankLast4: vendorBank.get("Marchmont Stationery"),
    });
    const b = push({
      vendorName: "Marchmont Stationery", invoiceNumber: "MAR-5511",
      invoiceDate: addDays(startDate, 156), amount: 1980, bankLast4: vendorBank.get("Marchmont Stationery"),
    });
    planted.push({ruleId: "amount-transposition", invoiceIds: [a.id, b.id], note: "1890 keyed as 1980"});
  }

  // ---- PLANTED: unapplied credit ------------------------------------------
  {
    const c = push({
      vendorName: "Sandsend Packaging", invoiceNumber: "SP-CN-118",
      invoiceDate: addDays(startDate, 200), amount: -2310, reference: "Overcharge credit",
    });
    planted.push({ruleId: "unapplied-credit", invoiceIds: [c.id], note: "Credit never taken off a later bill"});
  }

  // ---- PLANTED: bank details changed mid-relationship ----------------------
  {
    const a = push({
      vendorName: "Halden Site Services", invoiceNumber: "TS-9001",
      invoiceDate: addDays(startDate, 210), amount: 4150, bankLast4: "8842",
    });
    const b = push({
      vendorName: "Halden Site Services", invoiceNumber: "TS-9002",
      invoiceDate: addDays(startDate, 240), amount: 4150.01, bankLast4: "8842",
    });
    const c = push({
      vendorName: "Halden Site Services", invoiceNumber: "TS-9014",
      invoiceDate: addDays(startDate, 268), amount: 6890, bankLast4: "2077",
    });
    planted.push({ruleId: "bank-detail-change", invoiceIds: [b.id, c.id], note: "Account changed, then a large payment followed"});
    void a;
  }

  rows.sort((x, y) => x.invoiceDate.localeCompare(y.invoiceDate) || x.id.localeCompare(y.id));
  return {rows, planted, traps};
}

/** CSV in the shape a real ERP export arrives in — deliberately awkward headers. */
export function toCsv(rows: Invoice[]): string {
  const head = "Supplier Name,Invoice No,Invoice Date,Net Amount,Currency,Reference,Bank Acc (last 4)";
  const esc = (v: string | number | undefined) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const body = rows.map((r) => [
    r.vendorName, r.invoiceNumber, r.invoiceDate, r.amount.toFixed(2),
    r.currency, r.reference, r.bankLast4,
  ].map(esc).join(","));
  return [head, ...body].join("\n");
}

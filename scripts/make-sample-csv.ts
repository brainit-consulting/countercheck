/**
 * Builds a sample accounts-payable export for trying Countercheck.
 *
 *   npx tsx scripts/make-sample-csv.ts
 *
 * Deliberately NOT the demo ledger. Two differences matter:
 *
 *  1. The headers are Xero-flavoured — "Contact Name", "Total", "Bank Account" —
 *     rather than the names the importer looks for. Countercheck's claim is that
 *     the column names do not matter because you confirm them on the next
 *     screen, and a sample file whose headers already match would never test it.
 *
 *  2. The suppliers and figures are different, so an uploaded ledger is
 *     distinguishable at a glance from the demo one.
 *
 * Every problem below is planted on purpose and listed at the end of this file,
 * so what the queue reports can be checked against what was put in. It is
 * synthetic: no real company, no real bank account, no real person.
 */
import {writeFileSync, mkdirSync} from "node:fs";
import path from "node:path";

type Row = {
  supplier: string; invoice: string; date: string;
  amount: number; currency: string; reference: string; bank: string;
};

const rows: Row[] = [];
const add = (r: Row) => rows.push(r);

/** dd/mm/yyyy — the order a UK export uses, and the one the mapping screen asks
 *  you to confirm rather than guess. */
const d = (day: number, month: number, year = 2026) =>
  `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}`;

const SUPPLIERS = [
  ["Ashford Packaging Ltd", "4471"],
  ["Bellamy Freight", "8820"],
  ["Corvid Print & Signage", "2019"],
  ["Draycott Facilities", "6634"],
  ["Elmsworth Stationery", "7712"],
  ["Fenwick Electrical", "3308"],
  ["Granthorpe Catering", "9145"],
  ["Halloway IT Services", "5527"],
];

// ---------------------------------------------------------------------------
// The ordinary majority. Nothing here should be reported.
// ---------------------------------------------------------------------------
let seq = 1000;
for (let month = 1; month <= 12; month++) {
  for (const [supplier, bank] of SUPPLIERS) {
    const n = 1 + ((month * 7 + supplier.length) % 3);   // 1–3 invoices a month
    for (let i = 0; i < n; i++) {
      const day = 1 + ((month * 5 + i * 9 + supplier.length) % 27);
      const amount = 180 + ((month * 137 + i * 91 + supplier.length * 13) % 4200);
      add({
        supplier,
        invoice: `INV-${++seq}`,
        date: d(day, month),
        amount: Math.round(amount * 100) / 100,
        currency: "GBP",
        reference: `PO-${4000 + (seq % 900)}`,
        bank,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// The lookalike. A cleaning contract billed on the same day every month for the
// same amount. It is NOT a duplicate and must not be reported — this is the row
// set that catches a rule written too loosely.
// ---------------------------------------------------------------------------
for (let month = 1; month <= 12; month++) {
  add({
    supplier: "Northgate Cleaning Services",
    invoice: `NGC-2026-${String(month).padStart(2, "0")}`,
    date: d(2, month),
    amount: 1450.0,
    currency: "GBP",
    reference: "Contract NGC-118",
    bank: "5541",
  });
}

// ---------------------------------------------------------------------------
// The planted problems.
// ---------------------------------------------------------------------------

// 1. Same invoice paid twice, eleven days apart.
add({supplier: "Bellamy Freight", invoice: "BF-88204", date: d(9, 3), amount: 3180.5, currency: "GBP", reference: "PO-4471", bank: "8820"});
add({supplier: "Bellamy Freight", invoice: "BF-88204", date: d(20, 3), amount: 3180.5, currency: "GBP", reference: "PO-4471", bank: "8820"});

// 2. Same supplier, same amount, different invoice number — a re-key.
add({supplier: "Fenwick Electrical", invoice: "FE-3312", date: d(4, 5), amount: 2240.0, currency: "GBP", reference: "PO-5108", bank: "3308"});
add({supplier: "Fenwick Electrical", invoice: "FE-3312-A", date: d(17, 5), amount: 2240.0, currency: "GBP", reference: "PO-5108", bank: "3308"});

// 3. Transposed digits: 4,150.00 keyed as 1,450.00 — and both paid.
add({supplier: "Corvid Print & Signage", invoice: "CPS-7741", date: d(12, 7), amount: 4150.0, currency: "GBP", reference: "PO-5620", bank: "2019"});
add({supplier: "Corvid Print & Signage", invoice: "CPS-7741B", date: d(15, 7), amount: 1450.0, currency: "GBP", reference: "PO-5620", bank: "2019"});

// 4. Bank details changed mid-year, then everything after goes to the new one.
for (let month = 8; month <= 12; month++) {
  add({
    supplier: "Halloway IT Services",
    invoice: `HIT-99${month}`,
    date: d(11, month),
    amount: 2875.0,
    currency: "GBP",
    reference: `PO-77${month}`,
    bank: "6108",                     // was 5527 for the first seven months
  });
}

// 5. A round number well above this supplier's usual invoice.
add({supplier: "Draycott Facilities", invoice: "DF-5000", date: d(23, 9), amount: 5000.0, currency: "GBP", reference: "PO-6001", bank: "6634"});

// 6. One invoice, entered twice under two supplier records whose names differ
//    by a letter. The invoice NUMBER has to match — that is what makes it one
//    invoice rather than two. My first attempt gave the rows different numbers
//    and nothing fired, which was the data being wrong, not the rule.
add({supplier: "Elmsworth Stationery", invoice: "ES-4410", date: d(6, 10), amount: 612.4, currency: "GBP", reference: "PO-6620", bank: "7712"});
add({supplier: "Elmsworth Stationary", invoice: "ES-4410", date: d(8, 10), amount: 612.4, currency: "GBP", reference: "PO-6620", bank: "7712"});

// ---------------------------------------------------------------------------
// Write it, with headers that do not match the importer's field names.
// ---------------------------------------------------------------------------
const HEADERS = [
  "Contact Name", "Invoice Number", "Invoice Date",
  "Total", "Currency", "Reference", "Bank Account",
];

const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

rows.sort((a, b) => {
  const key = (r: Row) => r.date.split("/").reverse().join("");
  return key(a).localeCompare(key(b));
});

const csv = [
  HEADERS.join(","),
  ...rows.map((r) =>
    [r.supplier, r.invoice, r.date, r.amount.toFixed(2), r.currency, r.reference, r.bank]
      .map(esc).join(",")),
].join("\n");

const dir = path.join(process.cwd(), "samples");
mkdirSync(dir, {recursive: true});
const out = path.join(dir, "sample-accounts-payable.csv");
writeFileSync(out, csv + "\n", "utf8");

console.log(`${out}`);
console.log(`${rows.length} rows, ${new Set(rows.map((r) => r.supplier)).size} suppliers`);
console.log("");
console.log("Planted on purpose:");
console.log("  1. Bellamy Freight BF-88204 paid twice, 11 days apart");
console.log("  2. Fenwick Electrical FE-3312 / FE-3312-A, same amount, re-keyed");
console.log("  3. Corvid Print 4,150.00 and 1,450.00 — transposed digits, both paid");
console.log("  4. Halloway IT bank account moves 5527 -> 6108 from August");
console.log("  5. Draycott Facilities, a round 5,000.00");
console.log("  6. Elmsworth Stationery / Stationary — one supplier, two spellings");
console.log("");
console.log("Planted NOT to fire: Northgate Cleaning, 1,450.00 on the 2nd of every");
console.log("month. A contract on a schedule is not a duplicate.");

/**
 * The same bytes, as a module.
 *
 * The in-app "load the sample" button runs this through the real importCsv and
 * the real rules — the same path an uploaded file takes, column mapping and
 * all. Embedding it rather than reading samples/ at runtime keeps it working on
 * a serverless filesystem without a file-tracing rule to remember.
 */
const modPath = path.join(process.cwd(), "src", "demo", "sample-csv.ts");
writeFileSync(
  modPath,
  "// GENERATED by scripts/make-sample-csv.ts — do not edit by hand.\n" +
    "// Regenerate with: npx tsx scripts/make-sample-csv.ts\n" +
    "export const SAMPLE_CSV = " + JSON.stringify(csv + "\n") + ";\n",
  "utf8",
);
console.log(`\nalso wrote ${modPath}`);

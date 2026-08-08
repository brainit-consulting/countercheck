import {detect} from "../src/detection/engine";
import {generateLedger, toCsv} from "../src/demo/generate";

const ledger = generateLedger();
const {findings, summary} = detect(ledger.rows);
const gbp = (n: number) => new Intl.NumberFormat("en-GB", {style: "currency", currency: "GBP"}).format(n);

console.log(`\nLedger: ${summary.invoicesExamined} invoices, ${new Set(ledger.rows.map((r) => r.vendorName)).size} suppliers`);
console.log(`Findings: ${summary.findings}   At stake: ${gbp(summary.totalAtStake)}\n`);

console.log("By rule");
for (const [rule, s] of Object.entries(summary.byRule).sort((a, b) => b[1].atStake - a[1].atStake)) {
  console.log(`  ${rule.padEnd(26)} ${String(s.count).padStart(2)}   ${gbp(s.atStake).padStart(12)}`);
}

console.log("\nReview queue");
for (const f of findings) {
  console.log(`\n  [${f.severity.toUpperCase()}] ${gbp(f.amountAtStake)}  (${f.ruleId})`);
  console.log(`  ${f.explanation}`);
  console.log(`  rows: ${f.invoiceIds.join(", ")}`);
}

const csv = toCsv(ledger.rows);
console.log(`\nCSV export: ${csv.split("\n").length} lines, ${(csv.length / 1024).toFixed(1)} KB`);
console.log(`Header: ${csv.split("\n")[0]}`);

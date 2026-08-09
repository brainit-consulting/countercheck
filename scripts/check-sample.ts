/**
 * Runs the sample CSV through the real importer and the real rules, so the file
 * is known to work before anyone uploads it — and, more usefully, so what the
 * queue reports can be checked against what was deliberately planted.
 *
 *   npx tsx scripts/check-sample.ts
 */
import {readFileSync} from "node:fs";
import path from "node:path";
import {importCsv} from "../src/import/csv";
import {detect} from "../src/detection/engine";

const file = path.join(process.cwd(), "samples", "sample-accounts-payable.csv");
const result = importCsv(readFileSync(file, "utf8"), {dateOrder: "dmy"});

console.log(`rows imported : ${result.rows.length}`);
console.log(`errors        : ${result.errors.length}`);
for (const e of result.errors.slice(0, 5)) console.log(`  ! ${JSON.stringify(e).slice(0, 140)}`);

console.log("\ncolumn mapping the importer suggests, before anyone confirms it:");
for (const [field, guess] of Object.entries(result.mapping)) {
  const g = guess as {header: string | null; confidence: number};
  if (!g || g.header === undefined) continue;
  console.log(`  ${field.padEnd(14)} <- ${String(g.header).padEnd(16)} ${(g.confidence * 100).toFixed(0)}%`);
}

const {findings} = detect(result.rows);
console.log(`\nfindings: ${findings.length}`);
for (const f of findings) {
  console.log(`  [${f.severity}] ${f.ruleId.padEnd(22)} £${f.amountAtStake.toFixed(2).padStart(10)}  ${f.explanation.slice(0, 74)}`);
}

// The one that must NOT be reported.
const cleaning = findings.filter((f) => f.explanation.includes("Northgate"));
console.log(
  cleaning.length === 0
    ? "\nOK — Northgate Cleaning's monthly contract was not reported."
    : `\nPROBLEM — the cleaning contract fired ${cleaning.length} finding(s); a contract on a schedule is not a duplicate.`,
);

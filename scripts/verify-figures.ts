/**
 * Every number Part 02 might say, measured rather than remembered.
 *
 *   npx tsx scripts/verify-figures.ts
 *
 * Part 01's figures were defensible because each one was measured against the
 * running application at a pinned commit, not quoted from a plan. Several have
 * moved since — the dependency list is longer, there is a second ledger, and
 * the store is now Postgres. This re-measures all of them and prints the pin,
 * so the narration brief can carry a table somebody else could reproduce.
 */
import {readFileSync} from "node:fs";
import {execSync} from "node:child_process";
import path from "node:path";
import {importCsv} from "../src/import/csv";
import {detect} from "../src/detection/engine";
import {generateLedger} from "../src/demo/generate";
import {SAMPLE_CSV} from "../src/demo/sample-csv";

const pin = execSync("git rev-parse --short HEAD", {encoding: "utf8"}).trim();
const when = execSync("git log -1 --format=%cI", {encoding: "utf8"}).trim();
const pkg = JSON.parse(readFileSync(path.join(process.cwd(), "package.json"), "utf8"));

const money = (n: number) =>
  "£" + n.toLocaleString("en-GB", {minimumFractionDigits: 2, maximumFractionDigits: 2});

console.log(`# Figures for Part 02, measured at ${pin} (${when})\n`);

// --- Dependencies ----------------------------------------------------------
const deps = Object.entries(pkg.dependencies as Record<string, string>);
console.log(`## Dependencies: ${deps.length}`);
for (const [k, v] of deps) console.log(`  ${k} ${v}`);
console.log(`  (Part 01 clip 05 shows three. It is ${deps.length} now.)`);
const devDeps = Object.keys(pkg.devDependencies ?? {}).length;
console.log(`  dev-only, not shipped: ${devDeps}\n`);

// --- The demo ledger -------------------------------------------------------
const demo = generateLedger();
const demoFindings = detect(demo.rows).findings;
const demoStake = demoFindings.reduce((s, f) => s + f.amountAtStake, 0);
console.log(`## Demo ledger`);
console.log(`  invoices      ${demo.rows.length}`);
console.log(`  findings      ${demoFindings.length}`);
console.log(`  at stake      ${money(demoStake)}`);
for (const f of demoFindings) {
  console.log(`    [${f.severity.padEnd(6)}] ${f.ruleId.padEnd(26)} ${money(f.amountAtStake).padStart(12)}`);
}
console.log("");

// --- The sample export -----------------------------------------------------
const sample = importCsv(SAMPLE_CSV, {dateOrder: "dmy"});
const sampleFindings = detect(sample.rows).findings;
const sampleStake = sampleFindings.reduce((s, f) => s + f.amountAtStake, 0);
console.log(`## Sample export (Xero-style headers)`);
console.log(`  rows          ${sample.rows.length}`);
console.log(`  import errors ${sample.errors.length}`);
console.log(`  suppliers     ${new Set(sample.rows.map((r) => r.vendorName)).size}`);
console.log(`  findings      ${sampleFindings.length}`);
console.log(`  at stake      ${money(sampleStake)}`);
for (const f of sampleFindings) {
  console.log(`    [${f.severity.padEnd(6)}] ${f.ruleId.padEnd(26)} ${money(f.amountAtStake).padStart(12)}`);
}
console.log("");

// --- The rules -------------------------------------------------------------
const ruleIds = [...new Set([...demoFindings, ...sampleFindings].map((f) => f.ruleId))];
const typesSrc = readFileSync(path.join(process.cwd(), "src", "types.ts"), "utf8");
const declared = (typesSrc.match(/"[a-z-]+"/g) ?? [])
  .map((s) => s.slice(1, -1))
  .filter((s) => s.includes("-"));
console.log(`## Rules`);
console.log(`  rule ids declared in src/types.ts : ${new Set(declared).size}`);
console.log(`  rules that fired across both sets : ${ruleIds.length}`);
console.log(`  ${[...new Set(declared)].join(", ")}\n`);

// --- Code size, for "how much of this is there" ----------------------------
const count = (glob: string) =>
  execSync(`git ls-files "${glob}"`, {encoding: "utf8"}).trim().split("\n").filter(Boolean);
const lines = (files: string[]) =>
  files.reduce((n, f) => n + readFileSync(f, "utf8").split("\n").length, 0);
const src = count("src/*.ts").concat(count("src/**/*.ts")).filter((f) => !f.endsWith("sample-csv.ts"));
const lib = count("lib/*.ts");
const tests = count("test/*.ts");
console.log(`## Size at this pin`);
console.log(`  src/  ${src.length} files, ${lines(src).toLocaleString()} lines (excludes the generated sample)`);
console.log(`  lib/  ${lib.length} files, ${lines(lib).toLocaleString()} lines`);
console.log(`  test/ ${tests.length} files, ${lines(tests).toLocaleString()} lines`);
console.log("");
console.log("Run `npx vitest run` for the test count — it is not inferred here,");
console.log("because a number of tests taken from a file listing is a guess.");

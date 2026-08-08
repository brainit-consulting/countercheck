import {randomUUID} from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type {Finding, Invoice} from "../src/types";

/**
 * A small file-backed store, so the MVP runs with no database and no environment
 * variables — you can clone it and see real findings in one command.
 *
 * Deliberately behind a narrow interface. Every read and write goes through the
 * functions below, so swapping in Drizzle and Neon later is a change to this file
 * alone rather than a change to every screen.
 */

const DATA_DIR = process.env.COUNTERCHECK_DATA ?? path.join(process.cwd(), ".data");

/** Demo and real ledgers live in separate namespaces so a demo reset can never
 * reach uploaded data. This is enforced by path, not by a conditional. */
export type Namespace = "demo" | "uploads";

export type Decision = "accepted" | "rejected" | "deferred";

export type ReviewedFinding = Finding & {
  /** Stable across re-runs of detection: the rule plus the rows it matched. */
  key: string;
  decision?: Decision;
  decidedBy?: string;
  decidedAt?: string;
  reason?: string;
};

export type Ledger = {
  id: string;
  namespace: Namespace;
  name: string;
  createdAt: string;
  rowCount: number;
  invoices: Invoice[];
  findings: ReviewedFinding[];
  /** Append-only. Every decision, in order, never rewritten. */
  audit: {at: string; who: string; action: string; detail: string}[];
};

export const findingKey = (f: Finding) => `${f.ruleId}:${[...f.invoiceIds].sort().join("+")}`;

const nsDir = (ns: Namespace) => path.join(DATA_DIR, ns);
const filePath = (ns: Namespace, id: string) => path.join(nsDir(ns), `${id}.json`);

function ensure(ns: Namespace) {
  fs.mkdirSync(nsDir(ns), {recursive: true});
}

export function saveLedger(ledger: Ledger): Ledger {
  ensure(ledger.namespace);
  fs.writeFileSync(filePath(ledger.namespace, ledger.id), JSON.stringify(ledger, null, 2), "utf8");
  return ledger;
}

export function readLedger(ns: Namespace, id: string): Ledger | null {
  const p = filePath(ns, id);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf8")) as Ledger;
}

export function listLedgers(ns: Namespace): Ledger[] {
  ensure(ns);
  return fs.readdirSync(nsDir(ns))
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(fs.readFileSync(path.join(nsDir(ns), f), "utf8")) as Ledger)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function createLedger(ns: Namespace, name: string, invoices: Invoice[], findings: Finding[]): Ledger {
  return saveLedger({
    id: randomUUID(),
    namespace: ns,
    name,
    createdAt: new Date().toISOString(),
    rowCount: invoices.length,
    invoices,
    findings: findings.map((f) => ({...f, key: findingKey(f)})),
    audit: [{at: new Date().toISOString(), who: "system", action: "created", detail: `${invoices.length} invoices, ${findings.length} findings`}],
  });
}

export function recordDecision(
  ns: Namespace, ledgerId: string, key: string,
  decision: Decision, who: string, reason?: string,
): Ledger | null {
  const ledger = readLedger(ns, ledgerId);
  if (!ledger) return null;
  const finding = ledger.findings.find((f) => f.key === key);
  if (!finding) return null;
  finding.decision = decision;
  finding.decidedBy = who;
  finding.decidedAt = new Date().toISOString();
  finding.reason = reason;
  // Append-only: a corrected decision adds a line, it never edits the previous one.
  ledger.audit.push({
    at: finding.decidedAt, who, action: decision,
    detail: `${finding.ruleId} — ${finding.explanation.slice(0, 90)}${reason ? ` (${reason})` : ""}`,
  });
  return saveLedger(ledger);
}

/**
 * Wipe and reseed the demo namespace.
 *
 * Takes no namespace argument on purpose. A reset that could be pointed at a
 * namespace is a reset that can one day be pointed at the wrong one — the
 * guard below is a second line of defence, not the only one.
 */
export function resetDemo(seedFactory: () => {name: string; invoices: Invoice[]; findings: Finding[]}) {
  const dir = nsDir("demo");
  if (!dir.includes(`${path.sep}demo`)) {
    throw new Error(`refusing to reset: ${dir} is not the demo namespace`);
  }
  fs.rmSync(dir, {recursive: true, force: true});
  const seed = seedFactory();
  return createLedger("demo", seed.name, seed.invoices, seed.findings);
}

/* ---------------------------------------------------------------------------
 * Pending uploads
 *
 * A CSV is read twice: once to suggest a column mapping, once to import under
 * the mapping the user confirmed. The file has to survive between the two, and
 * round-tripping several megabytes through a hidden form field to avoid writing
 * a temporary file is a trade nobody wins.
 * ------------------------------------------------------------------------- */

const PENDING_DIR = path.join(DATA_DIR, "pending");

/** Ids arrive from the browser, so they are checked rather than trusted. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const pendingPath = (id: string, ext: string) => {
  if (!UUID.test(id)) throw new Error("not a pending upload id");
  return path.join(PENDING_DIR, `${id}.${ext}`);
};

export function savePending(name: string, text: string): string {
  fs.mkdirSync(PENDING_DIR, {recursive: true});
  const id = randomUUID();
  fs.writeFileSync(pendingPath(id, "csv"), text, "utf8");
  fs.writeFileSync(pendingPath(id, "json"), JSON.stringify({name, at: new Date().toISOString()}), "utf8");
  return id;
}

export function readPending(id: string): {name: string; text: string} | null {
  const csv = pendingPath(id, "csv");
  if (!fs.existsSync(csv)) return null;
  const meta = JSON.parse(fs.readFileSync(pendingPath(id, "json"), "utf8")) as {name: string};
  return {name: meta.name, text: fs.readFileSync(csv, "utf8")};
}

export function discardPending(id: string) {
  for (const ext of ["csv", "json"]) fs.rmSync(pendingPath(id, ext), {force: true});
}

export function totals(ledger: Ledger) {
  const open = ledger.findings.filter((f) => !f.decision);
  const accepted = ledger.findings.filter((f) => f.decision === "accepted");
  const rejected = ledger.findings.filter((f) => f.decision === "rejected");
  const sum = (list: ReviewedFinding[]) => list.reduce((s, f) => s + f.amountAtStake, 0);
  return {
    open: open.length, openValue: sum(open),
    accepted: accepted.length, acceptedValue: sum(accepted),
    rejected: rejected.length, rejectedValue: sum(rejected),
    total: ledger.findings.length, totalValue: sum(ledger.findings),
  };
}

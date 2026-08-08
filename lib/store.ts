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

/**
 * Two answers, and no third.
 *
 * There was briefly a "deferred" state, written by the Reopen button. Nothing
 * counted it: `totals` sums open, accepted and rejected, so a deferred finding
 * left the queue, left every total, and took its money with it. A state no
 * screen can render is not a state, it is a leak — reopening now clears the
 * decision and the finding returns to the queue it came from.
 */
export type Decision = "accepted" | "rejected";

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

/** Ids arrive from the browser, so they are checked rather than trusted. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const nsDir = (ns: Namespace) => path.join(DATA_DIR, ns);
const filePath = (ns: Namespace, id: string) => {
  // The pending-upload path validated its id from the start and this one did
  // not, which is the shape most traversal holes have: one careful function and
  // a sibling nobody looked at twice. `..%2f..%2fetc%2fpasswd` reaches here as a
  // route parameter.
  if (!UUID.test(id)) throw new Error("not a ledger id");
  return path.join(nsDir(ns), `${id}.json`);
};

function ensure(ns: Namespace) {
  fs.mkdirSync(nsDir(ns), {recursive: true});
}

/**
 * Write to a sibling file, then rename over the target.
 *
 * A plain writeFileSync truncates first and fills after, so a process killed
 * between the two leaves a zero-length ledger — and since `listLedgers` parses
 * every file in the namespace, one truncated ledger takes the whole list down
 * with a JSON error and no way back through the UI. Rename is atomic on both
 * NTFS and POSIX, so a reader sees either the old file or the new one.
 */
export function saveLedger(ledger: Ledger): Ledger {
  ensure(ledger.namespace);
  const target = filePath(ledger.namespace, ledger.id);
  const tmp = `${target}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(ledger, null, 2), "utf8");
  fs.renameSync(tmp, target);
  return ledger;
}

export function readLedger(ns: Namespace, id: string): Ledger | null {
  if (!UUID.test(id)) return null;   // a malformed id is a 404, not a crash
  const p = filePath(ns, id);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf8")) as Ledger;
  } catch {
    return null;
  }
}

export function listLedgers(ns: Namespace): Ledger[] {
  ensure(ns);
  const out: Ledger[] = [];
  for (const f of fs.readdirSync(nsDir(ns))) {
    if (!f.endsWith(".json")) continue;
    try {
      out.push(JSON.parse(fs.readFileSync(path.join(nsDir(ns), f), "utf8")) as Ledger);
    } catch {
      // One unreadable file must not hide every other ledger from the front
      // page. Skip it and keep going; the file is still there to be looked at.
      continue;
    }
  }
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
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
    audit: [{
      at: new Date().toISOString(), who: "system", action: "created",
      detail: `${invoices.length.toLocaleString()} invoice${invoices.length === 1 ? "" : "s"}, ` +
        `${findings.length} finding${findings.length === 1 ? "" : "s"}`,
    }],
  });
}

/** `decision: null` reopens: the finding goes back to the queue undecided. */
export function recordDecision(
  ns: Namespace, ledgerId: string, key: string,
  decision: Decision | null, who: string, reason?: string,
): Ledger | null {
  const ledger = readLedger(ns, ledgerId);
  if (!ledger) return null;
  const finding = ledger.findings.find((f) => f.key === key);
  if (!finding) return null;

  const at = new Date().toISOString();
  if (decision === null) {
    delete finding.decision;
    delete finding.decidedBy;
    delete finding.decidedAt;
    delete finding.reason;
  } else {
    finding.decision = decision;
    finding.decidedBy = who;
    finding.decidedAt = at;
    finding.reason = reason;
  }

  // Append-only: a corrected decision adds a line, it never edits the previous
  // one. Clearing the decision on the finding is not rewriting history — the
  // history is here.
  ledger.audit.push({
    at, who, action: decision ?? "reopened",
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

const pendingPath = (id: string, ext: string) => {
  if (!UUID.test(id)) throw new Error("not a pending upload id");
  return path.join(PENDING_DIR, `${id}.${ext}`);
};

/**
 * How long an unconfirmed upload survives.
 *
 * The upload page tells the reader the file is "held only until you confirm the
 * mapping, and then discarded". That was true of confirmed uploads and false of
 * abandoned ones, which stayed on disk forever — a customer's entire accounts
 * payable ledger, kept indefinitely by a product whose main claim is that it
 * does not keep things. A promise in the interface is a retention policy.
 */
const PENDING_TTL_MS = 6 * 60 * 60 * 1000;

/** Cheap and opportunistic: runs on upload, which is the only path that adds. */
function sweepPending() {
  if (!fs.existsSync(PENDING_DIR)) return;
  const cutoff = Date.now() - PENDING_TTL_MS;
  for (const f of fs.readdirSync(PENDING_DIR)) {
    const p = path.join(PENDING_DIR, f);
    try {
      if (fs.statSync(p).mtimeMs < cutoff) fs.rmSync(p, {force: true});
    } catch {
      /* a file that vanished under us needs no sweeping */
    }
  }
}

export function savePending(name: string, text: string): string {
  fs.mkdirSync(PENDING_DIR, {recursive: true});
  sweepPending();
  const id = randomUUID();
  fs.writeFileSync(pendingPath(id, "csv"), text, "utf8");
  fs.writeFileSync(pendingPath(id, "json"), JSON.stringify({name, at: new Date().toISOString()}), "utf8");
  return id;
}

export function readPending(id: string): {name: string; text: string} | null {
  if (!UUID.test(id)) return null;
  const csv = pendingPath(id, "csv");
  const json = pendingPath(id, "json");
  // Both halves, or neither. A sweep can remove one before the other, and
  // "expired" is the message for that — not a crash.
  if (!fs.existsSync(csv) || !fs.existsSync(json)) return null;
  const meta = JSON.parse(fs.readFileSync(json, "utf8")) as {name: string};
  return {name: meta.name, text: fs.readFileSync(csv, "utf8")};
}

export function discardPending(id: string) {
  for (const ext of ["csv", "json"]) fs.rmSync(pendingPath(id, ext), {force: true});
}

/**
 * The one currency this ledger is denominated in, or null if it holds more than
 * one. Totals across currencies are meaningless, and a single sum stamped with a
 * pound sign is worse than meaningless — so callers that get null must say so
 * rather than pick a symbol.
 */
export function ledgerCurrency(ledger: Ledger): string | null {
  let found: string | null = null;
  for (const r of ledger.invoices) {
    const c = (r.currency || "GBP").toUpperCase();
    if (found === null) found = c;
    else if (found !== c) return null;
  }
  return found ?? "GBP";
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

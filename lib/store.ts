import {randomUUID} from "node:crypto";
import type {Finding, Invoice} from "../src/types";
import {ensureSchema, sql, T} from "./db";

/**
 * The store, backed by Postgres.
 *
 * Part 01 ran this on a JSON file per ledger, which was right while the
 * specification was the product. It is behind a narrow interface for exactly
 * this reason: swapping the substrate is a change to this file and the `await`
 * keyword at its callers, not a change to every screen.
 *
 * Every function here is async now. That is the only part of the change that
 * reaches outside this file.
 */

/** Demo and real ledgers live in separate namespaces so a demo reset can never
 * reach uploaded data. This is now a column with a check constraint — the
 * database refuses a third value rather than trusting the caller. */
export type Namespace = "demo" | "uploads";

/**
 * Two answers, and no third.
 *
 * There was briefly a "deferred" state, written by the Reopen button. Nothing
 * counted it: `totals` sums open, accepted and rejected, so a deferred finding
 * left the queue, left every total, and took its money with it. A state no
 * screen can render is not a state, it is a leak — reopening now deletes the
 * decision row and the finding returns to the queue it came from.
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
  /**
   * Whose it is. Null for demo ledgers, which belong to nobody and are readable
   * by everyone on purpose, and null for uploads that predate 2026-08-13 — see
   * the column's comment in `db.ts` for why null is the closed case.
   */
  ownerEmail: string | null;
  /** Append-only. Every decision, in order, never rewritten. */
  audit: {at: string; who: string; action: string; detail: string}[];
};

export const findingKey = (f: Finding) => `${f.ruleId}:${[...f.invoiceIds].sort().join("+")}`;

/** Ids arrive from the browser, so they are checked rather than trusted. Query
 * parameters make injection a non-issue, but a malformed id should be a 404
 * rather than a database round trip and a type error. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const iso = (v: unknown): string =>
  v instanceof Date ? v.toISOString() : String(v);

type LedgerRow = {
  id: string; namespace: Namespace; name: string; created_at: unknown;
  row_count: number; invoices: Invoice[]; findings: ReviewedFinding[];
  owner_email: string | null;
};
type DecisionRow = {
  ledger_id: string; finding_key: string; decision: Decision;
  decided_by: string; decided_at: unknown; reason: string | null;
};
type AuditRow = {ledger_id: string; at: unknown; who: string; action: string; detail: string};

/** Stitches the three tables into the shape every screen already expects. */
function assemble(row: LedgerRow, decisions: DecisionRow[], audit: AuditRow[]): Ledger {
  const byKey = new Map(decisions.map((d) => [d.finding_key, d]));
  return {
    id: row.id,
    namespace: row.namespace,
    name: row.name,
    createdAt: iso(row.created_at),
    rowCount: row.row_count,
    ownerEmail: row.owner_email ?? null,
    invoices: row.invoices,
    findings: row.findings.map((f) => {
      const d = byKey.get(f.key);
      if (!d) return {...f, decision: undefined, decidedBy: undefined, decidedAt: undefined, reason: undefined};
      return {
        ...f,
        decision: d.decision,
        decidedBy: d.decided_by,
        decidedAt: iso(d.decided_at),
        reason: d.reason ?? undefined,
      };
    }),
    audit: audit.map((a) => ({at: iso(a.at), who: a.who, action: a.action, detail: a.detail})),
  };
}

/**
 * Who is asking. Every read of a ledger now has to say.
 *
 * It is a required argument rather than an optional one so that adding a screen
 * cannot accidentally add a hole: a call site that does not pass a viewer does
 * not compile. The exposure this closes existed because reads were the one path
 * nobody had to think about.
 */
export type Viewer = {email: string | null; isInstanceOwner: boolean};

/** A viewer for the paths that are public by design. Demo only — it can read nothing else. */
export const ANONYMOUS: Viewer = {email: null, isInstanceOwner: false};

/**
 * Demo ledgers are public. Uploads belong to the address that uploaded them.
 *
 * An upload with no recorded owner is readable only by the instance owner. Rows
 * written before 2026-08-13 have no owner, and treating them as public would be
 * deciding on somebody else's behalf that their payment data is everyone's.
 */
export function mayRead(
  ledger: {namespace: Namespace; ownerEmail: string | null},
  viewer: Viewer,
): boolean {
  if (ledger.namespace === "demo") return true;
  if (viewer.isInstanceOwner) return true;
  if (!ledger.ownerEmail || !viewer.email) return false;
  return ledger.ownerEmail.toLowerCase() === viewer.email.toLowerCase();
}

export async function readLedger(ns: Namespace, id: string, viewer: Viewer): Promise<Ledger | null> {
  const ledger = await readLedgerUnchecked(ns, id);
  if (!ledger) return null;
  /* Not yours is indistinguishable from not there. A 403 confirms the id names
     a real ledger, which is a fact about somebody else's data. */
  if (!mayRead(ledger, viewer)) return null;
  return ledger;
}

/**
 * The same read with no access decision, for the two paths that have already
 * made one: returning the ledger a caller just created, and returning the one
 * whose decision they were just authorised to record.
 *
 * Not exported. A second exported way to read a ledger is a second place for the
 * check to be forgotten, and forgetting it once is what this whole change is
 * about.
 */
async function readLedgerUnchecked(ns: Namespace, id: string): Promise<Ledger | null> {
  if (!UUID.test(id)) return null;   // a malformed id is a 404, not a crash
  await ensureSchema();
  const rows = (await sql.query(
    `select * from ${T.ledgers} where id = $1 and namespace = $2`, [id, ns],
  )) as LedgerRow[];
  if (!rows.length) return null;
  const decisions = (await sql.query(
    `select * from ${T.decisions} where ledger_id = $1`, [id],
  )) as DecisionRow[];
  const audit = (await sql.query(
    `select * from ${T.audit} where ledger_id = $1 order by id`, [id],
  )) as AuditRow[];
  return assemble(rows[0], decisions, audit);
}

export async function listLedgers(ns: Namespace, viewer: Viewer): Promise<Ledger[]> {
  await ensureSchema();
  const all = (await sql.query(
    `select * from ${T.ledgers} where namespace = $1 order by created_at desc`, [ns],
  )) as LedgerRow[];
  /* Filtered here rather than in SQL so that one function decides who may read
     a ledger, and both paths ask it the same question. */
  const rows = all.filter((r) => mayRead({namespace: r.namespace, ownerEmail: r.owner_email ?? null}, viewer));
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  // Two queries for the whole page rather than two per ledger.
  const decisions = (await sql.query(
    `select * from ${T.decisions} where ledger_id = any($1::uuid[])`, [ids],
  )) as DecisionRow[];
  const audit = (await sql.query(
    `select * from ${T.audit} where ledger_id = any($1::uuid[]) order by id`, [ids],
  )) as AuditRow[];
  return rows.map((r) =>
    assemble(r, decisions.filter((d) => d.ledger_id === r.id), audit.filter((a) => a.ledger_id === r.id)));
}

export async function createLedger(
  ns: Namespace, name: string, invoices: Invoice[], findings: Finding[],
  /**
   * The address this ledger belongs to. Required for uploads and refused for
   * demo, so neither can be got wrong by omission: a demo ledger with an owner
   * would stop being the public demonstration, and an upload without one is the
   * defect this argument exists to prevent.
   */
  ownerEmail: string | null = null,
): Promise<Ledger> {
  if (ns === "uploads" && !ownerEmail) throw new Error("an uploaded ledger must record whose it is");
  if (ns === "demo" && ownerEmail) throw new Error("the demo ledger belongs to nobody");
  await ensureSchema();
  const id = randomUUID();
  const at = new Date().toISOString();
  const withKeys = findings.map((f) => ({...f, key: findingKey(f)}));
  await sql.query(
    `insert into ${T.ledgers} (id, namespace, name, created_at, row_count, invoices, findings, owner_email)
     values ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [id, ns, name, at, invoices.length, JSON.stringify(invoices), JSON.stringify(withKeys), ownerEmail],
  );
  await sql.query(
    `insert into ${T.audit} (ledger_id, at, who, action, detail) values ($1, $2, $3, $4, $5)`,
    [id, at, "system", "created",
      `${invoices.length.toLocaleString()} invoice${invoices.length === 1 ? "" : "s"}, ` +
      `${findings.length} finding${findings.length === 1 ? "" : "s"}`],
  );
  return (await readLedgerUnchecked(ns, id))!;
}

/** `decision: null` reopens: the finding goes back to the queue undecided. */
export async function recordDecision(
  ns: Namespace, ledgerId: string, key: string,
  decision: Decision | null, who: string, reason?: string,
): Promise<Ledger | null> {
  if (!UUID.test(ledgerId)) return null;
  await ensureSchema();

  // The finding has to exist on this ledger before anything is written. The
  // check is against the stored document, so a key invented in the browser
  // cannot create a decision for a finding that was never raised.
  const rows = (await sql.query(
    `select findings from ${T.ledgers} where id = $1 and namespace = $2`, [ledgerId, ns],
  )) as {findings: ReviewedFinding[]}[];
  if (!rows.length) return null;
  const finding = rows[0].findings.find((f) => f.key === key);
  if (!finding) return null;

  const at = new Date().toISOString();
  if (decision === null) {
    await sql.query(
      `delete from ${T.decisions} where ledger_id = $1 and finding_key = $2`, [ledgerId, key],
    );
  } else {
    await sql.query(
      `insert into ${T.decisions} (ledger_id, finding_key, decision, decided_by, decided_at, reason)
       values ($1, $2, $3, $4, $5, $6)
       on conflict (ledger_id, finding_key) do update set
         decision = excluded.decision, decided_by = excluded.decided_by,
         decided_at = excluded.decided_at, reason = excluded.reason`,
      [ledgerId, key, decision, who, at, reason ?? null],
    );
  }

  // Append-only: a corrected decision adds a line, it never edits the previous
  // one. Clearing the decision row is not rewriting history — the history is
  // this table, and nothing in this file updates or deletes from it.
  await sql.query(
    `insert into ${T.audit} (ledger_id, at, who, action, detail) values ($1, $2, $3, $4, $5)`,
    // The whole explanation, not the first 90 characters of it.
    //
    // It used to be sliced, which cut lines mid-word — "to supplier records
    // that look like the sam". An audit trail holding a mangled copy of the
    // reason is worse than one holding a long one: the column is text, the
    // rows are few, and someone reading back a decision months later needs the
    // sentence that was actually put to them.
    [ledgerId, at, who, decision ?? "reopened",
      `${finding.ruleId} — ${finding.explanation}${reason ? ` (${reason})` : ""}`],
  );
  return readLedgerUnchecked(ns, ledgerId);
}

/**
 * Wipe and reseed the demo namespace.
 *
 * Takes no namespace argument on purpose. A reset that could be pointed at a
 * namespace is a reset that can one day be pointed at the wrong one. The delete
 * names 'demo' literally; there is no variable to get wrong.
 */
export async function resetDemo(
  seedFactory: () => {name: string; invoices: Invoice[]; findings: Finding[]},
): Promise<Ledger> {
  await ensureSchema();
  await sql.query(`delete from ${T.ledgers} where namespace = 'demo'`);
  const seed = seedFactory();
  return createLedger("demo", seed.name, seed.invoices, seed.findings);
}

/**
 * The name the sample export is stored under.
 *
 * Matching on a name is a blunt way to find a row and would be wrong for
 * anything a person created. It is right here precisely because this ledger is
 * not a person's: it is a fixture the owner reloads while showing the product,
 * and it should be replaced rather than accumulated.
 */
export const SAMPLE_NAME = "Sample export — Xero-style headers";

/**
 * Remove previous copies of the sample export. Deliberately narrow.
 *
 * This is NOT a general delete path for uploaded ledgers. Countercheck still
 * has no way to remove one, which is a real gap between what the upload page
 * promises and what the system does — see PLAN.md, Part 03. Widening this
 * function into that fix by accident would be the easiest possible mistake, so
 * it names one string and takes no arguments.
 */
export async function removeSampleLedgers(): Promise<void> {
  await ensureSchema();
  await sql.query(
    `delete from ${T.ledgers} where namespace = 'uploads' and name = $1`, [SAMPLE_NAME],
  );
}

/* ---------------------------------------------------------------------------
 * Pending uploads
 *
 * A CSV is read twice: once to suggest a column mapping, once to import under
 * the mapping the user confirmed. The file has to survive between the two, and
 * round-tripping several megabytes through a hidden form field to avoid storing
 * it is a trade nobody wins.
 * ------------------------------------------------------------------------- */

/**
 * How long an unconfirmed upload survives.
 *
 * The upload page tells the reader the file is "held only until you confirm the
 * mapping, and then discarded". That was true of confirmed uploads and false of
 * abandoned ones, which stayed forever — a customer's entire accounts payable
 * ledger, kept indefinitely by a product whose main claim is that it does not
 * keep things. A promise in the interface is a retention policy.
 */
const PENDING_TTL_MS = 6 * 60 * 60 * 1000;

/** Cheap and opportunistic: runs on upload, which is the only path that adds. */
async function sweepPending(): Promise<void> {
  const cutoff = new Date(Date.now() - PENDING_TTL_MS).toISOString();
  await sql.query(`delete from ${T.pending} where created_at < $1`, [cutoff]);
}

export async function savePending(name: string, text: string): Promise<string> {
  await ensureSchema();
  await sweepPending();
  const id = randomUUID();
  await sql.query(
    `insert into ${T.pending} (id, name, csv, created_at) values ($1, $2, $3, $4)`,
    [id, name, text, new Date().toISOString()],
  );
  return id;
}

export async function readPending(id: string): Promise<{name: string; text: string} | null> {
  if (!UUID.test(id)) return null;
  await ensureSchema();
  const rows = (await sql.query(
    `select name, csv from ${T.pending} where id = $1`, [id],
  )) as {name: string; csv: string}[];
  if (!rows.length) return null;
  return {name: rows[0].name, text: rows[0].csv};
}

export async function discardPending(id: string): Promise<void> {
  if (!UUID.test(id)) return;
  await ensureSchema();
  await sql.query(`delete from ${T.pending} where id = $1`, [id]);
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

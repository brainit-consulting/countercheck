import {neon} from "@neondatabase/serverless";

/**
 * The database connection, and the schema it expects.
 *
 * Part 01 ran on a file in `.data`, which was the right call while the
 * specification was the product: no database, no environment variables, clone
 * and see real findings in one command. That choice expires the moment the
 * thing runs somewhere real — a serverless filesystem is read-only apart from
 * /tmp, and /tmp is per-instance and vanishes between requests. An app that
 * silently forgets a decision is worse than one that plainly refuses, for a
 * product whose entire claim is that a person decided and it was written down.
 */

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error(
    "DATABASE_URL is not set. Run `vercel env pull .env.local` if you are working locally.",
  );
}

/**
 * Tests run against the same database in their own schema rather than against a
 * mock. A mock of a database tells you your mock works. The schema name is the
 * isolation, so a test run can never touch a real ledger.
 */
export const SCHEMA = process.env.COUNTERCHECK_SCHEMA ?? "countercheck";

export const sql = neon(url);

/** Schema-qualified identifier. Never interpolate user input here. */
const q = (table: string) => `${SCHEMA}.${table}`;
export const T = {
  ledgers: q("ledgers"),
  decisions: q("decisions"),
  audit: q("audit"),
  pending: q("pending_uploads"),
};

let ready: Promise<void> | null = null;

/**
 * Create the schema if it is not there yet.
 *
 * Idempotent and run once per process, not once per request. This is a
 * deliberate choice over a migration tool: the schema is four tables, the app
 * is the only writer, and a reader of this repository should be able to see the
 * whole shape of the storage in one screen.
 */
export function ensureSchema(): Promise<void> {
  if (ready) return ready;
  ready = (async () => {
    await sql.query(`create schema if not exists ${SCHEMA}`);

    // Invoices stay as one jsonb document. They are written once at import,
    // never edited, and always read whole — a row per invoice would buy
    // queryability the product does not use and cost a join on every page.
    await sql.query(`
      create table if not exists ${T.ledgers} (
        id          uuid primary key,
        namespace   text not null check (namespace in ('demo','uploads')),
        name        text not null,
        created_at  timestamptz not null,
        row_count   integer not null,
        invoices    jsonb not null,
        findings    jsonb not null
      )
    `);

    /**
     * Whose ledger this is.
     *
     * Added 2026-08-13, after the deployed application was found serving every
     * uploaded ledger to anonymous visitors — supplier names, amounts and four
     * digits of a bank account. The defect was not a missing check. It was that
     * nothing recorded whose ledger it was, so there was no check to write.
     * **An access decision needs something to decide against.**
     *
     * Nullable, and null is the closed case rather than the open one. Rows that
     * predate this column have no recorded owner, and the read path treats an
     * unowned upload as readable only by the instance owner. Anything else would
     * mean choosing, on behalf of whoever uploaded it, that their data is public
     * because we did not write it down at the time.
     *
     * Demo ledgers are owned by nobody and readable by everyone on purpose. That
     * is the product's public demonstration and the namespace is the boundary.
     */
    await sql.query(`alter table ${T.ledgers} add column if not exists owner_email text`);
    await sql.query(`create index if not exists ledgers_owner_idx on ${T.ledgers} (namespace, owner_email)`);

    // Decisions are their own table rather than a field inside the findings
    // document, so that "reopened" is a row that goes away and the finding
    // underneath it is untouched. Primary key is the finding key, which is
    // stable across re-runs of detection.
    await sql.query(`
      create table if not exists ${T.decisions} (
        ledger_id   uuid not null references ${T.ledgers}(id) on delete cascade,
        finding_key text not null,
        decision    text not null check (decision in ('accepted','rejected')),
        decided_by  text not null,
        decided_at  timestamptz not null,
        reason      text,
        primary key (ledger_id, finding_key)
      )
    `);

    // Append-only, and enforced by having no update path in the code above it.
    // A corrected decision adds a line here; it never edits one.
    await sql.query(`
      create table if not exists ${T.audit} (
        id         bigserial primary key,
        ledger_id  uuid not null references ${T.ledgers}(id) on delete cascade,
        at         timestamptz not null,
        who        text not null,
        action     text not null,
        detail     text not null
      )
    `);
    await sql.query(`create index if not exists audit_ledger_idx on ${T.audit} (ledger_id, id)`);

    // A CSV held between "suggest a mapping" and "import under it". The upload
    // page promises the file is kept only until the mapping is confirmed, so
    // created_at exists to make that promise enforceable rather than decorative.
    await sql.query(`
      create table if not exists ${T.pending} (
        id          uuid primary key,
        name        text not null,
        csv         text not null,
        created_at  timestamptz not null
      )
    `);
  })();
  return ready;
}

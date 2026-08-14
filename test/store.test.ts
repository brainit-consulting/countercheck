import {afterAll, beforeAll, describe, expect, it} from "vitest";
import type {Ledger, Viewer} from "../lib/store";
import fs from "node:fs";

/**
 * The invariant Part 01 says should have existed and did not.
 *
 * The engine's findings were counted by test/engine.test.ts. The money on the
 * front page was not. Reopen wrote a fourth decision state that none of the
 * three columns counted, so a confirmed finding could leave Open, Confirmed and
 * Dismissed at once and take its value out of the total — and nothing reported a
 * fault, because nothing was watching that sum.
 *
 * So: after any sequence of decisions a reviewer can perform, the three columns
 * must account for every finding, and for every pound.
 *
 * These run against a real Postgres in a throwaway schema, not against a mock.
 * A mock of a database tells you your mock works — and the bug this file exists
 * to catch was a disagreement between what was stored and what was counted,
 * which is exactly the class of bug a mock cannot see.
 */

// Next loads .env.local for `next dev` and `next build`; vitest does not, so a
// test run would otherwise fail on a missing DATABASE_URL while the app works.
if (!process.env.DATABASE_URL && fs.existsSync(".env.local")) process.loadEnvFile(".env.local");
if (!process.env.DATABASE_URL) {
  throw new Error(
    "These tests run against a real Postgres. Run `vercel env pull .env.local` first.",
  );
}

// Set before importing the store, which reads the schema name once at load.
// Per-process, so two runs in parallel cannot share a table.
const SCHEMA = `countercheck_test_${process.pid}`;
process.env.COUNTERCHECK_SCHEMA = SCHEMA;

const db = await import("../lib/db");
const store = await import("../lib/store");
const {generateLedger} = await import("../src/demo/generate");
const {detect} = await import("../src/detection/engine");

afterAll(async () => {
  await db.sql.query(`drop schema if exists ${SCHEMA} cascade`);
});

/** The address the fixture belongs to, and a second person who is not them. */
const OWNER: Viewer = {email: "owner@example.test", isInstanceOwner: false};
const STRANGER: Viewer = {email: "stranger@example.test", isInstanceOwner: false};

let ledger: Awaited<ReturnType<typeof makeLedger>>;

async function makeLedger() {
  const demo = generateLedger();
  const {findings} = detect(demo.rows);
  return store.createLedger("uploads", "invariant fixture", demo.rows, findings, OWNER.email!);
}

beforeAll(async () => {
  ledger = await makeLedger();
});

const reread = async () => (await store.readLedger("uploads", ledger.id, OWNER))!;

const accountsForEverything = (l: Ledger) => {
  const t = store.totals(l);
  const pennies = (n: number) => Math.round(n * 100);
  return {
    counts: t.open + t.accepted + t.rejected === t.total,
    money: pennies(t.openValue) + pennies(t.acceptedValue) + pennies(t.rejectedValue) === pennies(t.totalValue),
    t,
  };
};

describe("every finding and every pound is in exactly one column", () => {
  it("holds before anything is decided", async () => {
    const {counts, money, t} = accountsForEverything(await reread());
    expect(counts, `open ${t.open} + accepted ${t.accepted} + rejected ${t.rejected} ≠ ${t.total}`).toBe(true);
    expect(money).toBe(true);
    expect(t.open).toBe(t.total);
  });

  it("holds after every sequence of decisions a reviewer can perform", async () => {
    const keys = (await reread()).findings.map((f) => f.key);
    // Accept, reject, reopen, decide again, reopen again — the orderings a
    // person actually produces when they change their mind.
    const script: Array<[string, "accepted" | "rejected" | null]> = [
      [keys[0], "accepted"],
      [keys[1], "rejected"],
      [keys[2], "accepted"],
      [keys[0], null],
      [keys[1], "accepted"],
      [keys[2], null],
      [keys[3], "rejected"],
      [keys[0], "rejected"],
      [keys[3], null],
      [keys[4], "accepted"],
    ];

    for (const [key, decision] of script) {
      await store.recordDecision("uploads", ledger.id, key, decision, "test reviewer");
      const {counts, money, t} = accountsForEverything(await reread());
      expect(
        counts,
        `after ${decision ?? "reopen"} on ${key}: open ${t.open} + accepted ${t.accepted} + rejected ${t.rejected} ≠ total ${t.total}`,
      ).toBe(true);
      expect(money, `after ${decision ?? "reopen"} on ${key}: the columns do not sum to ${t.totalValue}`).toBe(true);
    }
  });

  it("returns a reopened finding to the queue with its money", async () => {
    const l = await reread();
    const key = l.findings[0].key;
    await store.recordDecision("uploads", ledger.id, key, "accepted", "test reviewer");
    const confirmed = store.totals(await reread());
    await store.recordDecision("uploads", ledger.id, key, null, "test reviewer");
    const reopened = store.totals(await reread());

    expect(confirmed.acceptedValue).toBeGreaterThan(0);
    expect(reopened.acceptedValue).toBe(confirmed.acceptedValue - l.findings[0].amountAtStake);
    expect(reopened.openValue).toBe(confirmed.openValue + l.findings[0].amountAtStake);
    expect(reopened.open).toBe(confirmed.open + 1);
  });

  it("keeps the audit trail append-only through all of it", async () => {
    const audit = (await reread()).audit;
    // One creation line plus one per decision recorded above; never fewer, and
    // never edited in place.
    expect(audit.length).toBeGreaterThan(10);
    expect(audit[0].action).toBe("created");
    expect(audit.every((a) => typeof a.at === "string" && a.at.length > 0)).toBe(true);
    const times = audit.map((a) => a.at);
    expect([...times].sort()).toEqual(times);
  });
});

describe("the demo reset cannot reach uploaded data", () => {
  it("leaves the uploads namespace alone", async () => {
    const before = (await store.listLedgers("uploads", OWNER)).map((l) => l.id).sort();
    await store.resetDemo(() => {
      const demo = generateLedger();
      return {name: "demo", invoices: demo.rows, findings: detect(demo.rows).findings};
    });
    expect((await store.listLedgers("uploads", OWNER)).map((l) => l.id).sort()).toEqual(before);
  });
});

describe("ids from the browser are not trusted", () => {
  it("refuses a traversal attempt instead of querying for it", async () => {
    expect(await store.readLedger("uploads", "../../../../etc/passwd", OWNER)).toBeNull();
    expect(await store.readLedger("uploads", "not-a-uuid", OWNER)).toBeNull();
    expect(await store.readPending("../../secrets")).toBeNull();
  });
});

describe("a finding key invented in the browser cannot create a decision", () => {
  it("refuses a key that is not on the ledger", async () => {
    const before = (await reread()).audit.length;
    expect(await store.recordDecision("uploads", ledger.id, "made-up:key", "accepted", "attacker")).toBeNull();
    // And it wrote nothing on the way out.
    expect((await reread()).audit.length).toBe(before);
  });
});

/**
 * The exposure found on 2026-08-13.
 *
 * The deployed application served every uploaded ledger to anonymous visitors:
 * supplier names, invoice numbers, amounts, four digits of a bank account.
 * Nothing was misconfigured. There was no column recording whose ledger it was,
 * so there was no check anybody could have written.
 *
 * These are about reading, because reading was the path nobody had to think
 * about. Signing in arrived in Part 02 and it protected deciding and uploading.
 */
describe("an uploaded ledger belongs to the address that uploaded it", () => {
  it("is refused to an anonymous visitor", async () => {
    expect(await store.readLedger("uploads", ledger.id, store.ANONYMOUS)).toBeNull();
  });

  it("is refused to a different signed-in person", async () => {
    expect(await store.readLedger("uploads", ledger.id, STRANGER)).toBeNull();
  });

  it("is readable by the person who uploaded it", async () => {
    expect((await store.readLedger("uploads", ledger.id, OWNER))?.id).toBe(ledger.id);
  });

  it("is readable by the owner of the instance", async () => {
    expect((await store.readLedger("uploads", ledger.id, {email: "other@example.test", isInstanceOwner: true}))?.id)
      .toBe(ledger.id);
  });

  it("does not appear in a list for anyone else", async () => {
    expect((await store.listLedgers("uploads", store.ANONYMOUS)).map((l) => l.id)).not.toContain(ledger.id);
    expect((await store.listLedgers("uploads", STRANGER)).map((l) => l.id)).not.toContain(ledger.id);
    expect((await store.listLedgers("uploads", OWNER)).map((l) => l.id)).toContain(ledger.id);
  });

  it("matches the address case-insensitively, because email is", async () => {
    const shouty = {email: OWNER.email!.toUpperCase(), isInstanceOwner: false};
    expect((await store.readLedger("uploads", ledger.id, shouty))?.id).toBe(ledger.id);
  });

  /**
   * Not-yours has to be indistinguishable from not-there. A 403 confirms the id
   * names a real ledger, which is itself a fact about somebody else's data.
   */
  it("answers the same for someone else's ledger as for one that does not exist", async () => {
    expect(await store.readLedger("uploads", "00000000-0000-4000-8000-000000000000", OWNER)).toBeNull();
    expect(await store.readLedger("uploads", ledger.id, STRANGER)).toBeNull();
  });

  /** The demo is public on purpose, and the namespace is the boundary. */
  it("still lets anyone read the demo", async () => {
    const rows = generateLedger().rows;
    const d = await store.createLedger("demo", "public demo", rows, detect(rows).findings);
    expect((await store.readLedger("demo", d.id, store.ANONYMOUS))?.id).toBe(d.id);
  });

  it("refuses to create an upload with nobody to own it", async () => {
    const rows = generateLedger().rows;
    await expect(store.createLedger("uploads", "ownerless", rows, detect(rows).findings))
      .rejects.toThrow(/must record whose it is/);
  });

  it("refuses to give the demo an owner", async () => {
    const rows = generateLedger().rows;
    await expect(store.createLedger("demo", "owned demo", rows, detect(rows).findings, OWNER.email!))
      .rejects.toThrow(/belongs to nobody/);
  });
});

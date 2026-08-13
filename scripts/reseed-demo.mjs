/**
 * Reseed the demo ledger, the way the product does it.
 *
 * WHY THIS EXISTS RATHER THAN A CLICK. The Reset control is owner-gated and its
 * server action calls requireOwner(), which needs a signed-in session. Sign-in
 * is a magic link by email, so an email outage puts the button out of reach.
 * This does the same two things resetDemo() does and nothing else:
 *
 *   1. delete from ledgers where namespace = 'demo'
 *   2. let ensureDemoLedger() reseed on the next page view
 *
 * Step 2 is the important one, and it is deliberately NOT done here. The reseed
 * runs inside the deployed application, through its own code path, so the audit
 * line it writes says who = "system" — which is what actually created it.
 * Nothing in this script writes a decision, an actor, or an audit row.
 *
 * WHAT IT REFUSES TO DO. It stops if the demo ledger carries any decision. A
 * decision is a person saying a finding was worth chasing or was not, and
 * deleting one leaves no record it existed. The demo ledger normally has none;
 * if it has some they belong to a session someone ran, and a maintenance script
 * is not the thing that decides they did not matter.
 *
 * The uploads namespace is never touched, and there is no namespace argument:
 * a reset that can be pointed at a namespace is a reset that can one day be
 * pointed at the wrong one.
 *
 *   node scripts/reseed-demo.mjs
 */
import {neon} from "@neondatabase/serverless";
import fs from "node:fs";

const env = fs.readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const url = /^DATABASE_URL=(.+)$/m.exec(env)?.[1]?.trim().replace(/^["']|["']$/g, "");
if (!url) throw new Error("no DATABASE_URL in .env.local");
const sql = neon(url);

const before = await sql`select id, name from countercheck.ledgers where namespace = 'demo'`;
if (!before.length) {
  console.log("no demo ledger present — the next page view will seed one");
  process.exit(0);
}

for (const l of before) {
  const [{n}] = await sql`select count(*)::int as n from countercheck.decisions where ledger_id = ${l.id}`;
  if (n > 0) {
    console.error(`refusing: demo ledger ${l.id} carries ${n} decision(s).`);
    console.error("Reopen them or keep them deliberately. A script does not get to decide they did not happen.");
    process.exit(1);
  }
  console.log(`removing ${l.id}  ${l.name}  (0 decisions)`);
}

await sql`delete from countercheck.ledgers where namespace = 'demo'`;

const [{n: uploads}] = await sql`select count(*)::int as n from countercheck.ledgers where namespace = 'uploads'`;
console.log(`\ndemo removed. uploads untouched: ${uploads} ledger(s).`);
console.log("Now load the site once so ensureDemoLedger() reseeds it inside the app,");
console.log("then run scripts/demo-state.mjs and read the result there rather than on the page.");

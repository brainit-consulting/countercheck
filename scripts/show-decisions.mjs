/**
 * What the database actually holds, for the two ledgers on the front page.
 *
 * Written because a page can be stale and a claim can be mistaken, and the only
 * way to tell those apart is to ask the database rather than the HTML.
 *
 *   node scripts/show-decisions.mjs
 */
import {neon} from "@neondatabase/serverless";

process.loadEnvFile(".env.local");
const sql = neon(process.env.DATABASE_URL);
const SCHEMA = process.env.COUNTERCHECK_SCHEMA ?? "countercheck";

const ledgers = await sql.query(
  `select id, namespace, name from ${SCHEMA}.ledgers order by created_at`,
);

for (const l of ledgers) {
  const decisions = await sql.query(
    `select finding_key, decision, decided_by, decided_at
       from ${SCHEMA}.decisions where ledger_id = $1 order by decided_at desc`, [l.id],
  );
  const audit = await sql.query(
    `select at, who, action from ${SCHEMA}.audit where ledger_id = $1 order by at desc limit 3`, [l.id],
  );
  console.log(`\n${l.namespace}  ${l.name}`);
  console.log(`  ${decisions.length} live decision(s)`);
  for (const d of decisions) {
    console.log(`    ${d.decision.padEnd(9)} ${d.decided_by}  ${d.decided_at}  ${d.finding_key.slice(0, 46)}`);
  }
  console.log(`  newest audit lines:`);
  for (const a of audit) console.log(`    ${a.at}  ${a.action.padEnd(9)} ${a.who}`);
}

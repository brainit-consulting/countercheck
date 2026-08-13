/**
 * What is actually in the demo namespace right now.
 *
 * Read-only. Run this before and after any reseed: the page is not evidence of
 * the database, which is the lesson from Part 02's reopen — the page was checked
 * first and would have been believed.
 *
 *   node scripts/demo-state.mjs
 */
import {neon} from "@neondatabase/serverless";
import fs from "node:fs";

const env = fs.readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const url = /^DATABASE_URL=(.+)$/m.exec(env)?.[1]?.trim().replace(/^["']|["']$/g, "");
if (!url) throw new Error("no DATABASE_URL in .env.local");
const sql = neon(url);

const ledgers = await sql`
  select id, name, row_count, created_at, jsonb_array_length(findings::jsonb) as findings
  from countercheck.ledgers where namespace = 'demo'`;

for (const l of ledgers) {
  console.log(`ledger   ${l.id}`);
  console.log(`name     ${l.name}`);
  console.log(`rows     ${l.row_count}   findings ${l.findings}`);
  console.log(`created  ${l.created_at}`);

  const decisions = await sql`select count(*)::int as n from countercheck.decisions where ledger_id = ${l.id}`;
  const audit = await sql`select count(*)::int as n from countercheck.audit where ledger_id = ${l.id}`;
  console.log(`decisions ${decisions[0].n}    audit lines ${audit[0].n}`);

  const explain = await sql`
    select f->>'ruleId' as rule, f->>'explanation' as explanation
    from countercheck.ledgers, jsonb_array_elements(findings::jsonb) f
    where id = ${l.id} and f->>'ruleId' = 'vendor-spelling-duplicate'`;
  for (const e of explain) console.log(`\n  ${e.rule}\n  ${e.explanation}`);
}
if (!ledgers.length) console.log("no demo ledger — the next page view will seed one");

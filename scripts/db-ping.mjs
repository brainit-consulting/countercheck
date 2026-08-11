/**
 * Round-trip latency to the database, five times.
 *
 * Written because the test suite went from 9 seconds to 126 and one test
 * started timing out, with no code change between the two runs. A suite that is
 * slow for an environmental reason and a suite that is slow for a code reason
 * look identical from the outside; this tells them apart in ten seconds.
 *
 *   node scripts/db-ping.mjs
 */
import {neon} from "@neondatabase/serverless";

process.loadEnvFile(".env.local");
const sql = neon(process.env.DATABASE_URL);

for (let i = 0; i < 5; i++) {
  const started = Date.now();
  await sql`select 1`;
  console.log(`round trip ${i + 1}: ${Date.now() - started} ms`);
}

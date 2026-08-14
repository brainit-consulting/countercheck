/**
 * Does the deployed application say what this code says it should?
 *
 *   node scripts/check-live.mjs
 *   CC_BASE=http://localhost:3000 node scripts/check-live.mjs
 *
 * WHY THIS IS NOT THE SAME AS A DEPLOY CHECK.
 *
 * Countercheck computes its findings once, when a ledger is created, and stores
 * them. So a fix to the wording of a finding changes nothing that anyone can see
 * until the data is regenerated. On 2026-08-13 the live demo was still saying
 * "was paid 2 times" — a claim the model cannot support, since it has no payment
 * status — two days after the code stopped saying it, because the ledger had been
 * seeded before the fix. The commit was green, the deploy was green, the product
 * was wrong.
 *
 * The same day, the ledger's own name described it as "12 months of accounts
 * payable" while the home page and the manual both said eleven. That one had
 * been wrong for months and was found in a video capture.
 *
 * **A deployed fix and a live fix are different events.** This checks the second
 * one, by generating the expected text from the code in this working copy and
 * looking for it in what the running application actually serves.
 *
 * It is deliberately about text a person reads, not about internals. Every
 * assertion here is one a non-programmer could make with the page open, which is
 * the argument of Part 03 applied to our own operations.
 */
import {generateLedger} from "../src/demo/generate.js";

const BASE = (process.env.CC_BASE ?? "https://countercheck-brainit.vercel.app").replace(/\/$/, "");

const get = async (path) => {
  const r = await fetch(`${BASE}${path}`, {headers: {"user-agent": "countercheck-check-live"}});
  if (!r.ok) throw new Error(`${path} returned ${r.status}`);
  return (await r.text()).replace(/<[^>]+>/g, " ").replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, "&").replace(/&pound;/g, "£").replace(/\s+/g, " ");
};

const failures = [];
const check = (name, ok, detail) => {
  if (ok) console.log(`  ok    ${name}`);
  else {
    console.log(`  FAIL  ${name}`);
    if (detail) console.log(`        ${detail}`);
    failures.push(name);
  }
};

const home = await get("/");

/**
 * The span, stated in three places that must agree.
 *
 * The generator is the authority: it is a fixed seed, so the number of months it
 * covers is a fact about the data rather than a matter of taste. Both the prose
 * and the stored ledger name are compared against it.
 */
const rows = generateLedger().rows;
const dates = rows.map((r) => r.invoiceDate).sort();
const spanDays = Math.round((Date.parse(dates[dates.length - 1]) - Date.parse(dates[0])) / 86_400_000);
const spanMonths = Math.round(spanDays / 30.44);
const spelled = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"][spanMonths];

check(
  `the span is ${spanDays} days and the home page says ${spelled}`,
  new RegExp(`\\b${spelled}\\s+months\\b`, "i").test(home),
  `expected "${spelled} months" — a generated span of ${spanDays} days`,
);

const wrongSpans = [...home.matchAll(/\b(\d{1,2}|eleven|twelve|ten)\s+months\b/gi)]
  .map((m) => m[1].toLowerCase())
  .filter((v) => v !== spelled);
check(
  "no other month count anywhere on the home page",
  wrongSpans.length === 0,
  wrongSpans.length ? `also found: ${[...new Set(wrongSpans)].join(", ")}` : "",
);

/* The published figures, which are spoken in three videos and cannot move. */
check("237 invoices", /\b237\b/.test(home));
check("six open findings", /Open\s*6\b/i.test(home) || /Review\s*6\s*findings/i.test(home));
check("£27,401.25 at stake", /27,401\.25/.test(home));

/**
 * The ledger's own stored name, which only appears on screens that read it and
 * is therefore the string most likely to be stale.
 */
const reviewHref = /href="(\/review\/demo\/[^"]+)"/.exec(await (await fetch(`${BASE}/`)).text())?.[1];
if (!reviewHref) {
  check("a demo review queue is linked from the home page", false);
} else {
  const queue = await get(reviewHref);
  check(
    `the ledger's stored name says ${spelled} months`,
    new RegExp(`Demo ledger .{0,3} ${spelled} months`, "i").test(queue),
    "the ledger row predates the fix — reseed it, do not just redeploy",
  );

  /**
   * The wording finding 49 corrected. The model has no payment status and the
   * upload page asks for invoices that were paid OR approved, so "was paid"
   * asserts something the data cannot support.
   */
  check(
    'no finding claims an invoice "was paid" N times',
    !/was paid \d+ times/i.test(queue),
    'found "was paid N times" — the stored findings predate the fix; reseed',
  );
  check(
    'findings say "appears N times" instead',
    /appears \d+ times/i.test(queue),
  );
}

/**
 * The exposure closed on 2026-08-13, checked where it actually mattered.
 *
 * The unit tests prove the store refuses. This proves the deployed thing does,
 * from outside, with no session — which is the only place the original defect
 * was ever visible. A test suite passing against a store is not a product
 * refusing a stranger.
 */
const rawHome = await (await fetch(`${BASE}/`)).text();
const uploadLinks = [...rawHome.matchAll(/href="(\/review\/uploads\/[^"]+)"/g)].map((m) => m[1]);
check(
  "no uploaded ledger is listed to an anonymous visitor",
  uploadLinks.length === 0,
  uploadLinks.length ? `still listing: ${uploadLinks.join(", ")}` : "",
);

/**
 * A known id, asked for without a session. It has to answer the same as an id
 * that names nothing — a 403 would confirm the ledger exists, which is itself a
 * fact about somebody else's data.
 */
const KNOWN_UPLOAD_ID = "95f9c3ab-b77c-4814-aa5b-7d47ba368877";
const [exposed, missing] = await Promise.all([
  fetch(`${BASE}/review/uploads/${KNOWN_UPLOAD_ID}`),
  fetch(`${BASE}/review/uploads/00000000-0000-4000-8000-000000000000`),
]);
check(
  "an uploaded ledger is not readable without a session",
  exposed.status === 404,
  `returned ${exposed.status}; before 2026-08-13 this returned 200 with supplier names and bank digits`,
);
check(
  "and refusing looks the same as not existing",
  exposed.status === missing.status,
  `${exposed.status} for a real ledger, ${missing.status} for one that does not exist`,
);

/**
 * The retention wording, which changed when the delete button was built.
 *
 * Part 03 filmed this page saying there was not yet a way to delete, and that
 * was true when it was filmed. Part 04 built the button, so the assertion moves
 * with the product rather than pinning it to a sentence in an old video.
 */
const upload = await get("/upload");
check(
  "the upload page says what is kept",
  /What is kept is the parsed rows and the findings/i.test(upload),
);
check(
  "and names the button that removes it",
  /Delete this ledger/i.test(upload) && /Nothing is kept/i.test(upload),
  "the page must describe the delete path now that one exists",
);
check(
  "and no longer claims deletion is impossible",
  !/not yet a way for you to delete/i.test(upload),
  "the old sentence is still there and is now false",
);

console.log("");
if (failures.length) {
  console.log(`${failures.length} live check(s) failed against ${BASE}.`);
  console.log("A green deploy is not a green product: findings are computed once and stored.\n");
  process.exit(1);
}
console.log(`All live checks passed against ${BASE}.\n`);

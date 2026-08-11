# Countercheck

Read-only spend integrity. Point it at an accounts-payable export and it reports
what looks wrong — duplicate payments, unapplied credits, transposed amounts,
changed bank details — with the rows behind each finding and a note on how to
settle it.

It never connects to a finance system and has no write path back to one. Every
finding is a question for a person, not a decision.

Running at <https://countercheck-brainit.vercel.app> — the demo ledger is
readable without an account.

It is built in public as BrainIT **Master Build No. 1**, a series that takes one
real application from an idea to a system you own, mistakes included:
<https://guides.brainitconsulting.com/>

## Running it

It needs a Postgres database. Any will do — it creates its own tables on first
use — and Neon's free tier is what this runs on.

```bash
npm install
cp .env.example .env.local     # then fill in the two required values
npm run dev
```

| Variable | Needed for | Notes |
| --- | --- | --- |
| `DATABASE_URL` | starting at all | Any Postgres connection string |
| `BETTER_AUTH_SECRET` | starting at all | Any long random string |
| `RESEND_API_KEY` | signing in | Only when a magic link is actually sent |
| `SENDER_EMAIL` | signing in | A verified sender on your Resend domain |
| `OWNER_EMAILS` | one demo button | Comma-separated; gates nothing else |

Open <http://localhost:3000>. The demo ledger seeds itself on first view: 237
invoices over eleven months with six planted problems, generated from a fixed
seed so it is the same every time. **Reading the demo needs no account.** Signing
in is only required to record a decision or to upload your own export.

## What it looks for

Seven rules, in `src/detection/rules.ts`:

| Rule | What it catches |
| --- | --- |
| `exact-duplicate` | The same supplier, invoice number and amount, more than once. |
| `rekeyed-duplicate` | Same supplier and amount, different invoice number, days apart. |
| `vendor-spelling-duplicate` | Two supplier records for one company letting an invoice through twice. |
| `amount-transposition` | An amount that is a digit-swap away from another invoice from the same supplier. |
| `unapplied-credit` | A credit note that no later payment deducts. |
| `bank-detail-change` | Payments to a supplier moving to a new account. |
| `round-number-outlier` | A round figure — a multiple of £500 above £5,000 — from a supplier who invoices to the penny. |

The single most important piece of code is not a rule. It is
`looksLikeRegularSchedule` in `src/detection/match.ts`, which stops a monthly
cleaning contract being reported as a duplicate every month. Without it every
subscription and standing contract in the ledger is an accusation, and people
stop reading the findings — which costs more than the duplicates would have.

## Your own export

`/upload` takes a CSV. Column names do not matter: the importer scores every
header, proposes a mapping with a reason you can argue with, and shows you the
first rows and every row it could not read **before** anything is analysed.

Genuinely ambiguous dates — `03/04/2026` — are never guessed. It asks. An import
silently shifted by months is the kind of error that survives all the way to a
board pack.

## Storage

Postgres, through `@neondatabase/serverless`, behind the narrow interface in
`lib/store.ts`. Four tables in a `countercheck` schema — ledgers, decisions,
audit, pending uploads — created on first use. Better Auth owns four more in
`public`.

A decision is a row, so reopening one deletes that row rather than editing it.
The audit table is append-only in the strongest sense available: nothing in the
codebase updates or deletes from it, so a corrected decision adds a line and the
line before it stays exactly as written.

**It used to be JSON files under `.data/`,** one per ledger, and that is worth
knowing rather than hiding. It ran fine on a laptop and returned an error the
moment it was deployed, because a serverless host will not let a program keep
files. The one-line fix — point it at temporary space — was available and was
not taken: that version works and quietly loses decisions, in a product whose
only claim is that a person decided and it was written down. `git log lib/store.ts`
has both.

`demo` and `uploads` remain separate namespaces, and the demo reset takes no
namespace argument on purpose: a reset that can be pointed at a namespace is a
reset that can one day be pointed at the wrong one.

## Tests

```bash
npm test
```

`npm test` prints the count. This README said 109 tests when there were 154,
then 154 when there were 155, and "three files" when there were five — the file
count drifted within a day of the test count being removed for exactly this
reason. A number copied into a document has to be maintained there, and it is
not.

`test/store.test.ts` needs `DATABASE_URL` and runs against a real Postgres in a
throwaway schema named after the process id. A fake one would not have caught
the things this suite exists to catch.

The one to read first is the precision test in `test/engine.test.ts`,
which asserts the demo ledger produces exactly the planted findings and nothing
else. It was added after a demo run reported eleven findings for six problems —
green tests said the rules worked; the report said they were unusable.

## Design

`DESIGN.md` carries the visual reasoning and the verified contrast tables.
`app/brand.css` holds the tokens; `app/globals.css` is structure only and never
names a raw colour.

## Licence

MIT — see `LICENSE`. Copy it, change it, run it, sell it. A Master Build that a
reader cannot legally reuse is a demonstration rather than a build, and "all
rights reserved" is what a repository says by default when nobody chooses.

Copyright is held by Blueridge Web Services LLC, the Florida company that
BrainIT Consulting trades under.

# Countercheck

Read-only spend integrity. Point it at an accounts-payable export and it reports
what looks wrong — duplicate payments, unapplied credits, transposed amounts,
changed bank details — with the rows behind each finding and a note on how to
settle it.

It never connects to a finance system and has no write path back to one. Every
finding is a question for a person, not a decision.

```bash
npm install && npm run dev
```

Open <http://localhost:3000>. The demo ledger seeds itself on first view: 237
invoices over twelve months with six planted problems, generated from a fixed
seed so it is the same every time.

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
| `round-number-outlier` | A round figure from a supplier who invoices to the penny. |

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

Ledgers, decisions and the audit trail are JSON files under `.data/`, behind the
narrow interface in `lib/store.ts`. That is deliberate for an MVP you can clone
and run in one command with no database and no environment variables.

It is also the thing to replace first for a real deployment: a serverless host
has an ephemeral filesystem, so decisions would not survive. Swapping in Postgres
is a change to `lib/store.ts` alone — no screen reads or writes data any other
way.

`.data/demo/` and `.data/uploads/` are separate namespaces, and the demo reset
takes no namespace argument on purpose: a reset that can be pointed at a
namespace is a reset that can one day be pointed at the wrong one.

## Tests

```bash
npm test
```

109 tests. The one to read first is the precision test in `test/engine.test.ts`,
which asserts the demo ledger produces exactly the planted findings and nothing
else. It was added after a demo run reported eleven findings for six problems —
green tests said the rules worked; the report said they were unusable.

## Design

`DESIGN.md` carries the visual reasoning and the verified contrast tables.
`app/brand.css` holds the tokens; `app/globals.css` is structure only and never
names a raw colour.

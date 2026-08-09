import {ensureDemoLedger} from "./actions";
import {ledgerCurrency, listLedgers, totals, SAMPLE_NAME, type Ledger} from "../lib/store";
import {isOwner} from "../lib/owner";
import {SampleButton} from "./sample-button";
import {money, mixed} from "../lib/money";
import {ResetDemoButton} from "./reset-button";

/* Reads the ledger store on every request. Without this Next prerenders the page
   at build time, and the counts freeze at whatever the demo looked like when it
   was built — decisions made afterwards would never show up here. */
export const dynamic = "force-dynamic";

const fmt = (ledger: Ledger) => {
  const code = ledgerCurrency(ledger);
  return (n: number) => (code ? money(n, code) : mixed(n));
};

export default async function Home() {
  const demo = await ensureDemoLedger();
  const uploads = await listLedgers("uploads");
  const owner = await isOwner();
  const sampleLoaded = uploads.some((l) => l.name === SAMPLE_NAME);
  const t = totals(demo);
  const gbp = fmt(demo);

  return (
    <div className="page">
      <section className="intro">
        <h1>Check your payments before someone else does.</h1>
        <p className="lede">
          Export accounts payable from whatever system you already use. Countercheck
          reads it and reports what looks wrong — duplicates, unapplied credits,
          transposed amounts, changed bank details — with the evidence behind each one.
          It never connects to your finance system and never writes anything back.
        </p>
      </section>

      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>Demo ledger</h2>
            <p className="muted">
              {demo.rowCount.toLocaleString()}{" "}
              invoices, twelve months, generated. Nobody&rsquo;s real data — but the
              problems in it are the real ones.
            </p>
          </div>
          <ResetDemoButton />
        </div>

        <dl className="stats">
          <div>
            <dt>Open</dt>
            <dd className="figure">{t.open}</dd>
          </div>
          <div>
            <dt>At stake</dt>
            <dd className="figure">{gbp(t.openValue)}</dd>
          </div>
          <div>
            <dt>Confirmed</dt>
            <dd className="figure accepted">{t.accepted ? gbp(t.acceptedValue) : "—"}</dd>
          </div>
          <div>
            <dt>Dismissed</dt>
            <dd className="figure muted">{t.rejected || "—"}</dd>
          </div>
        </dl>

        <a className="primary" href={`/review/demo/${demo.id}`} title="Open the review queue: each finding with the rows behind it, ordered by severity then money at stake.">
          Review {t.open} finding{t.open === 1 ? "" : "s"}{" "}&rarr;
        </a>
        <a className="secondary spaced" href={`/ledger/demo/${demo.id}`}>
          Read all {demo.rowCount.toLocaleString()} rows &rarr;
        </a>
      </section>

      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>Your own export</h2>
            <p className="muted">
              A CSV from your accounting system. You map the columns; nothing is guessed
              silently.
            </p>
          </div>
        </div>
        {uploads.length ? (
          <ul className="ledger-list">
            {uploads.map((l) => {
              const lt = totals(l);
              const gbp = fmt(l);
              return (
                <li key={l.id}>
                  <a href={`/review/uploads/${l.id}`}>
                    <span>{l.name}</span>
                    <span className="muted">
                      {l.rowCount.toLocaleString()} rows · {lt.open} open · {gbp(lt.openValue)}
                    </span>
                  </a>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="muted">No uploads yet.</p>
        )}
        <a className="secondary" href="/upload" title="Check your own accounts payable export. You confirm the column mapping; nothing is guessed silently.">Upload a CSV &rarr;</a>
      </section>

      {owner && (
        <section className="panel owner-panel">
          <h2>Showing this to someone</h2>
          <p className="muted small-print">
            Only you see this. It imports a second synthetic ledger — different
            suppliers, Xero-style headers — through the real column mapping and
            the real rules, so there are two datasets to switch between without
            uploading a file mid-conversation. Six problems are planted in it,
            and one lookalike that should not be reported.
          </p>
          <SampleButton loaded={sampleLoaded} />
        </section>
      )}
    </div>
  );
}

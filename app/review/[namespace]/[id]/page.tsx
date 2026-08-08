import {notFound} from "next/navigation";
import {ledgerCurrency, readLedger, totals, type Namespace} from "../../../../lib/store";
import {money, mixed} from "../../../../lib/money";
import {FindingCard} from "./finding-card";

export default async function Review({params}: {params: Promise<{namespace: string; id: string}>}) {
  const {namespace, id} = await params;
  if (namespace !== "demo" && namespace !== "uploads") notFound();
  const ledger = readLedger(namespace as Namespace, id);
  if (!ledger) notFound();

  const t = totals(ledger);
  // A single sum across currencies is meaningless; saying so is the honest option.
  const code = ledgerCurrency(ledger);
  const gbp = (n: number) => (code ? money(n, code, {round: true}) : mixed(n));
  const invoiceById = new Map(ledger.invoices.map((i) => [i.id, i]));
  const open = ledger.findings.filter((f) => !f.decision);
  const closed = ledger.findings.filter((f) => f.decision);

  return (
    <div className="page">
      <nav className="crumbs">
        <a href="/">Countercheck</a> <span aria-hidden="true">/</span> <span>{ledger.name}</span>
      </nav>

      <section className="review-head">
        <h1>Review queue</h1>
        <p className="lede">
          Ordered by severity, then by money at stake. Each finding names the rule that
          fired and shows the rows behind it, because every one of these is an
          accusation about someone&rsquo;s paperwork.
        </p>
        <dl className="stats">
          <div><dt>Open</dt><dd className="figure">{t.open}</dd></div>
          <div><dt>At stake</dt><dd className="figure">{gbp(t.openValue)}</dd></div>
          <div><dt>Confirmed</dt><dd className="figure accepted">{t.accepted ? gbp(t.acceptedValue) : "—"}</dd></div>
          <div><dt>Dismissed</dt><dd className="figure muted">{t.rejected || "—"}</dd></div>
        </dl>
      </section>

      {open.length === 0 ? (
        <p className="empty">
          Everything in this ledger has been reviewed.{" "}
          {t.accepted > 0
            ? `${gbp(t.acceptedValue)} was confirmed as worth chasing.`
            : "Nothing was confirmed."}
        </p>
      ) : (
        <ol className="findings">
          {open.map((f) => (
            <FindingCard
              key={f.key}
              finding={f}
              rows={f.invoiceIds.map((i) => invoiceById.get(i)!).filter(Boolean)}
              namespace={namespace as Namespace}
              ledgerId={ledger.id}
            />
          ))}
        </ol>
      )}

      {closed.length > 0 && (
        <section className="panel">
          <h2>Decided</h2>
          <ol className="findings decided">
            {closed.map((f) => (
              <FindingCard
                key={f.key}
                finding={f}
                rows={f.invoiceIds.map((i) => invoiceById.get(i)!).filter(Boolean)}
                namespace={namespace as Namespace}
                ledgerId={ledger.id}
              />
            ))}
          </ol>
        </section>
      )}

      <section className="panel">
        <h2>Audit trail</h2>
        <p className="muted">
          Append-only. A changed decision adds a line; it never edits the one before it.
        </p>
        <ol className="audit">
          {[...ledger.audit].reverse().map((a, i) => (
            <li key={i}>
              <time dateTime={a.at}>{new Date(a.at).toLocaleString("en-GB")}</time>
              <span className={`tag tag-${a.action}`}>{a.action}</span>
              <span className="muted">{a.who}</span>
              <span>{a.detail}</span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

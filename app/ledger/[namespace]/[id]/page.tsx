import {notFound} from "next/navigation";
import {ledgerCurrency, readLedger, type Namespace} from "../../../../lib/store";
import {money, mixed} from "../../../../lib/money";

/**
 * The rows, as read.
 *
 * Countercheck's whole claim is that it reports what it saw and shows the
 * evidence. Until now a reader could see the six findings and never see the
 * other two hundred and thirty-one rows the engine looked at — which makes the
 * findings an assertion rather than a conclusion. This is the page that says
 * "here is everything I read, and here is which of it I had something to say
 * about."
 *
 * Read-only, like everything else. Nothing here can be edited, and no rule runs
 * from this page.
 */
export const dynamic = "force-dynamic";

export default async function Ledger({params, searchParams}: {
  params: Promise<{namespace: string; id: string}>;
  searchParams: Promise<{supplier?: string}>;
}) {
  const {namespace, id} = await params;
  const {supplier} = await searchParams;
  if (namespace !== "demo" && namespace !== "uploads") notFound();
  const ledger = readLedger(namespace as Namespace, id);
  if (!ledger) notFound();

  const code = ledgerCurrency(ledger);
  const fmt = (n: number) => (code ? money(n, code) : mixed(n));

  // Which rows a finding touches, so a reader can see the queue's reach without
  // the page taking a position on any individual row.
  const flagged = new Map<string, string>();
  for (const f of ledger.findings) {
    for (const rowId of f.invoiceIds) flagged.set(rowId, f.ruleId);
  }

  /**
   * One supplier at a time, when asked. A year of a contract is twelve rows
   * scattered through a thousand, and the question "does this supplier bill me
   * the same amount every month" is unanswerable until they sit together.
   */
  const all = [...ledger.invoices].sort((a, b) =>
    a.invoiceDate.localeCompare(b.invoiceDate) || a.vendorName.localeCompare(b.vendorName));
  const rows = supplier
    ? all.filter((r) => r.vendorName.toLowerCase().includes(supplier.toLowerCase()))
    : all;

  const suppliers = new Set(all.map((r) => r.vendorName)).size;
  const span = all.length ? `${all[0].invoiceDate} to ${all[all.length - 1].invoiceDate}` : "—";

  return (
    <div className="page">
      <nav className="crumbs">
        <a href="/">Countercheck</a> <span aria-hidden="true">/</span>{" "}
        <a href={`/review/${namespace}/${ledger.id}`}>{ledger.name}</a>{" "}
        <span aria-hidden="true">/</span> <span>Rows</span>
      </nav>

      <section className="review-head">
        <h1>Every row, as read</h1>
        <p className="lede">
          The whole export, in date order, exactly as Countercheck parsed it. The
          findings are drawn from these rows and nothing else — if a row is not
          here, it was not read, and the count at the top of the review queue says
          how many of those there were.
        </p>
        {supplier ? (
          <p className="filter-note">
            Showing <strong>{rows.length}</strong> row{rows.length === 1 ? "" : "s"}{" "}
            for suppliers matching &ldquo;{supplier}&rdquo;.{" "}
            <a href={`/ledger/${namespace}/${ledger.id}`}>Show all {all.length.toLocaleString()}</a>
          </p>
        ) : null}
        <dl className="stats">
          <div><dt>{supplier ? "Shown" : "Rows"}</dt><dd className="figure">{rows.length.toLocaleString()}</dd></div>
          <div><dt>Suppliers</dt><dd className="figure">{suppliers}</dd></div>
          <div><dt>Flagged</dt><dd className="figure">{flagged.size}</dd></div>
          <div><dt>Period</dt><dd className="figure period">{span}</dd></div>
        </dl>
      </section>

      <section className="panel">
        <div className="scroller">
          <table className="evidence ledger-table">
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Supplier</th>
                <th scope="col">Invoice</th>
                <th scope="col" className="num">Amount</th>
                <th scope="col">Bank</th>
                <th scope="col">Reference</th>
                <th scope="col">In a finding</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className={flagged.has(r.id) ? "is-flagged" : undefined}>
                  <td className="mono">{r.invoiceDate}</td>
                  <td>{r.vendorName}</td>
                  <td className="mono">{r.invoiceNumber}</td>
                  <td className={`num mono${r.amount < 0 ? " credit" : ""}`}>{fmt(r.amount)}</td>
                  <td className="mono">{r.bankLast4 ? `••${r.bankLast4}` : "—"}</td>
                  <td className="muted">{r.reference ?? "—"}</td>
                  <td className="muted small-note">{flagged.get(r.id) ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

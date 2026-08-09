import {notFound} from "next/navigation";
import {readPending} from "../../../lib/store";
import {importCsv, parseCsvRecords, FIELDS, type Field} from "../../../src/import/csv";
import {MappingForm} from "./mapping-form";

const LABELS: Record<Field, {name: string; note: string}> = {
  vendorName: {name: "Supplier", note: "Required. Who was paid."},
  invoiceNumber: {name: "Invoice number", note: "Required. What identifies the document."},
  invoiceDate: {name: "Invoice date", note: "Required. Any common format."},
  amount: {name: "Amount", note: "Required. Credits negative, or in brackets."},
  currency: {name: "Currency", note: "Optional. Assumed GBP if absent."},
  reference: {name: "Reference / PO", note: "Optional. Shown as evidence, not matched on."},
  bankLast4: {name: "Bank account", note: "Optional — but this is what catches redirection fraud."},
};

export default async function MapColumns({params}: {params: Promise<{id: string}>}) {
  const {id} = await params;
  const pending = await readPending(id);
  if (!pending) notFound();

  const records = parseCsvRecords(pending.text);
  const headers = records[0]?.cells ?? [];
  const sample = records.slice(1, 6);
  // A trial run under the suggested mapping: the point of this screen is that the
  // user sees what the guess would do before it is allowed to do it.
  const trial = importCsv(pending.text);

  const ambiguousDates = trial.errors.filter((e) => /ambiguous|could be read/i.test(e.reason)).length;

  return (
    <div className="page">
      <nav className="crumbs">
        <a href="/">Countercheck</a> <span aria-hidden="true">/</span>{" "}
        <a href="/upload">Upload</a> <span aria-hidden="true">/</span>{" "}
        <span>{pending.name}</span>
      </nav>

      <section className="intro">
        <h1>Confirm the columns.</h1>
        <p className="lede">
          {headers.length} columns, {(records.length - 1).toLocaleString()} rows. Below is
          what each guess was based on. Change anything that looks wrong — a mis-read
          amount column produces confident nonsense, and nothing downstream can tell.
        </p>
      </section>

      <MappingForm
        pendingId={id}
        headers={headers}
        mapping={trial.mapping}
        labels={LABELS}
        fields={FIELDS}
        needsDateOrder={ambiguousDates > 0}
        ambiguousDates={ambiguousDates}
      />

      <section className="panel">
        <h2>First rows, as the file has them</h2>
        <div className="scroller">
          <table className="evidence">
            <thead>
              <tr>{headers.map((h, i) => <th key={i} scope="col">{h || `(column ${i + 1})`}</th>)}</tr>
            </thead>
            <tbody>
              {sample.map((r) => (
                <tr key={r.line}>
                  {headers.map((_, i) => <td key={i} className="mono">{r.cells[i] ?? ""}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {trial.unmapped.length > 0 && (
          <p className="muted">
            Not used: {trial.unmapped.join(", ")}. Nothing is silently dropped — these
            columns are simply not something any rule looks at.
          </p>
        )}
      </section>

      {trial.errors.length > 0 && (
        <section className="panel">
          <h2>{trial.errors.length.toLocaleString()} rows the guess could not read</h2>
          <p className="muted">
            Shown before you commit, not after. Fix the mapping if these look like a
            column problem; otherwise they are skipped and the count is recorded.
          </p>
          <div className="scroller">
            <table className="evidence">
              <thead>
                <tr>
                  <th scope="col">Line</th><th scope="col">Column</th>
                  <th scope="col">Value</th><th scope="col">Why</th>
                </tr>
              </thead>
              <tbody>
                {trial.errors.slice(0, 12).map((e, i) => (
                  <tr key={i}>
                    <td className="mono">{e.row}</td>
                    <td>{e.column}</td>
                    <td className="mono">{e.value || "—"}</td>
                    <td className="muted">{e.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {trial.errors.length > 12 && (
            <p className="muted">…and {(trial.errors.length - 12).toLocaleString()} more.</p>
          )}
        </section>
      )}
    </div>
  );
}

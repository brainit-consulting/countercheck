import {UploadForm} from "./upload-form";
import {currentUser} from "../../lib/session";

export const dynamic = "force-dynamic";

export default async function Upload() {
  const who = await currentUser();

  return (
    <div className="page">
      <nav className="crumbs">
        <a href="/">Countercheck</a> <span aria-hidden="true">/</span> <span>Upload</span>
      </nav>

      <section className="intro">
        <h1>Give it an export.</h1>
        <p className="lede">
          A CSV of paid or approved invoices — supplier, invoice number, date and
          amount at a minimum. Sage, Xero, QuickBooks, NetSuite and SAP all export
          something close enough; the column names don&rsquo;t matter, you confirm
          them on the next screen.
        </p>
      </section>

      <section className="panel">
        {who ? (
          <UploadForm />
        ) : (
          <div>
            <h2>Sign in first.</h2>
            <p className="lede">
              Reading the demo needs no account. Sending us your own ledger does
              — a real export carries your suppliers&rsquo; names, what you paid
              them and part of their bank details, and nobody should be able to
              put that here anonymously.
            </p>
            <p>
              <a className="primary" href="/sign-in" title="A real export carries supplier names, amounts and part of their bank details. Nobody should be able to put that here anonymously.">Sign in to upload</a>
            </p>
          </div>
        )}
      </section>

      <section className="panel">
        <h2>What the file needs to contain</h2>
        <p className="lede">
          The <em>names</em> of your columns do not matter — you confirm which is
          which on the next screen, and nothing is guessed silently. What matters
          is that the information is in there somewhere.
        </p>

        <table className="fields">
          <thead>
            <tr>
              <th scope="col">Column</th>
              <th scope="col">Needed?</th>
              <th scope="col">Example</th>
              <th scope="col">Why</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Supplier name</td><td>Required</td><td>Bellamy Freight</td>
              <td>Nearly every rule groups by supplier first.</td>
            </tr>
            <tr>
              <td>Invoice number</td><td>Required</td><td>BF-88204</td>
              <td>Two rows sharing one number is the clearest duplicate there is.</td>
            </tr>
            <tr>
              <td>Invoice date</td><td>Required</td><td>09/03/2026</td>
              <td>Distinguishes a re-key from a contract billed monthly. You confirm day-first or month-first.</td>
            </tr>
            <tr>
              <td>Amount</td><td>Required</td><td>3180.50</td>
              <td>The money at stake. Symbols, commas and brackets for negatives are all handled.</td>
            </tr>
            <tr>
              <td>Currency</td><td>Optional</td><td>GBP</td>
              <td>Without it everything is assumed to be one currency. Totals across currencies are never summed.</td>
            </tr>
            <tr>
              <td>Reference / PO</td><td>Optional</td><td>PO-4471</td>
              <td>Shown in the evidence so a row can be found again in your own system.</td>
            </tr>
            <tr>
              <td>Bank account</td><td>Optional</td><td>8820</td>
              <td>Without it, changed bank details cannot be detected at all. Last four digits are enough.</td>
            </tr>
          </tbody>
        </table>

        <p className="muted small-print">
          Extra columns are ignored, not rejected — export what your system gives
          you. Anything Countercheck cannot read is reported to you rather than
          dropped quietly, because a row that vanished between the export and the
          report is worse than one that never imported.
        </p>

        <p>
          <a className="secondary" href="/sample.csv" title="A synthetic 218-row export with the same shape. No real company, no real bank account — open it in a spreadsheet to see what is expected.">
            Download an example CSV &rarr;
          </a>
        </p>
      </section>

      <section className="panel">
        <h2>What happens to the file</h2>
        <p className="lede">
          It is uploaded to this application&rsquo;s own server and held in its
          database until you confirm the mapping, then deleted — and swept after
          six hours if you never confirm. What is kept is the parsed rows and the
          findings, and there is not yet a way for you to delete those yourself.
          It goes nowhere else: no third party sees it, nothing is sent to a
          model, and Countercheck has no write path back to any finance system.
          If a finding is real, a person acts on it.
        </p>
      </section>
    </div>
  );
}

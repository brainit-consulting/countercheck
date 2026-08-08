import {UploadForm} from "./upload-form";

export default function Upload() {
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
        <UploadForm />
      </section>

      <section className="panel">
        <h2>What happens to the file</h2>
        <p className="lede">
          It is read on this machine, held only until you confirm the mapping, and
          then discarded — what is kept is the parsed rows and the findings. Nothing
          is sent anywhere, and Countercheck has no write path back to any finance
          system. If a finding is real, a person acts on it.
        </p>
      </section>
    </div>
  );
}

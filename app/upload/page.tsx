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

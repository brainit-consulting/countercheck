import {SignInForm} from "./sign-in-form";
import {currentUser} from "../../lib/session";
import {SignOutButton} from "./sign-out-button";

export const dynamic = "force-dynamic";

export default async function SignIn() {
  const who = await currentUser();

  return (
    <div className="page">
      <nav className="crumbs">
        <a href="/">Countercheck</a> <span aria-hidden="true">/</span> <span>Sign in</span>
      </nav>

      <section className="intro">
        <h1>{who ? "You are signed in." : "Sign in to decide."}</h1>
        <p className="lede">
          {who ? (
            <>
              Decisions you record are attributed to <strong>{who}</strong>, and
              that is what appears in the audit trail beside them.
            </>
          ) : (
            <>
              Anyone can read the demo ledger, the evidence behind every finding,
              and the audit trail. Recording a decision needs a person, because
              &ldquo;a person decided&rdquo; is the whole claim — and an audit
              trail that names a placeholder is not evidence of anything.
            </>
          )}
        </p>
      </section>

      <section className="panel">{who ? <SignOutButton /> : <SignInForm />}</section>

      <section className="panel">
        <h2>What is kept</h2>
        <p className="lede">
          Your email address, and the times you signed in. It is used to attribute
          decisions and to send you a sign-in link — nothing else, and it is not
          passed to anyone. Countercheck still cannot pay, void, or alter anything
          in any system.
        </p>
      </section>
    </div>
  );
}

"use client";

import {useState} from "react";
import {createAuthClient} from "better-auth/react";
import {magicLinkClient} from "better-auth/client/plugins";

const client = createAuthClient({plugins: [magicLinkClient()]});

/**
 * Ask for a link. Nothing else.
 *
 * The same message is shown whether or not the address is known. Telling a
 * stranger "no account with that email" answers a question they should have to
 * ask a person — it turns the form into a way of finding out who has an account
 * here, one address at a time.
 */
export function SignInForm() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    const {error} = await client.signIn.magicLink({email, callbackURL: "/"});
    if (error) {
      setState("error");
      setMessage("The link could not be sent just now. Try again in a moment.");
      return;
    }
    setState("sent");
    setMessage("");
  }

  if (state === "sent") {
    return (
      <div>
        <h2>Check that inbox.</h2>
        <p className="lede">
          If <strong>{email}</strong> can sign in here, a link is on its way. It
          works once and expires in fifteen minutes.
        </p>
        <p className="muted small-print">
          Nothing has changed on your account, and no one has been told you asked.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="upload-form">
      <label className="text-field">
        <span className="field-label">Email address</span>
        <input
          type="email"
          name="email"
          required
          autoComplete="email"
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@yourcompany.com"
          disabled={state === "sending"}
        />
      </label>

      {state === "error" && <p className="form-error" role="alert">{message}</p>}

      <button className="primary" type="submit" disabled={state === "sending" || email.length === 0}>
        {state === "sending" ? "Sending…" : "Email me a link"}
      </button>

      <p className="muted small-print">
        No password. The link is the sign-in, and your email address is what
        appears next to any decision you record.
      </p>
    </form>
  );
}

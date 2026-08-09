"use client";

import {useState} from "react";
import {createAuthClient} from "better-auth/react";

const client = createAuthClient();

export function SignOutButton() {
  const [busy, setBusy] = useState(false);
  return (
    <button
      className="secondary"
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await client.signOut();
        // A full navigation, not a router push: every page reads the session on
        // the server, so the whole tree has to be rebuilt without it.
        window.location.href = "/";
      }}
    >
      {busy ? "Signing out…" : "Sign out"}
    </button>
  );
}

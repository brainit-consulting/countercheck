"use client";

import {useState, useTransition} from "react";
import {resetDemoLedger} from "./actions";

/**
 * Reset is confirmed in two steps rather than guarded by a dialog. It only ever
 * touches the demo namespace, but it still destroys a reviewer's decisions, and
 * a single mis-click doing that quietly is exactly the kind of thing that makes
 * people distrust a tool.
 */
export function ResetDemoButton() {
  const [armed, setArmed] = useState(false);
  const [pending, start] = useTransition();

  if (!armed) {
    return (
      <button className="ghost" onClick={() => setArmed(true)} disabled={pending}>
        Reset demo data
      </button>
    );
  }

  return (
    <span className="confirm">
      <span className="muted">Discard demo decisions?</span>
      <button
        className="danger"
        disabled={pending}
        onClick={() => start(async () => {
          await resetDemoLedger();
          setArmed(false);
        })}
      >
        {pending ? "Resetting…" : "Yes, reset"}
      </button>
      <button className="ghost" onClick={() => setArmed(false)} disabled={pending}>
        Cancel
      </button>
    </span>
  );
}

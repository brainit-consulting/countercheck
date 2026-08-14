"use client";

import {useState, useTransition} from "react";
import {deleteMyLedger} from "./actions";

/**
 * Delete this ledger, in two steps.
 *
 * Same shape as the demo reset, and for a stronger reason: that one discards
 * decisions on synthetic data, this one destroys a real company's supplier
 * names, amounts and partial bank details. Two steps is not friction here, it is
 * the point — the second click is the one a person means.
 *
 * The confirm text says what goes and that nothing is kept. Part 03 published a
 * promise that the rows are kept and cannot be removed; a button that quietly
 * left a copy behind would make the correction worse than the original.
 */
export function DeleteLedgerButton({id, rowCount}: {id: string; rowCount: number}) {
  const [armed, setArmed] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!armed) {
    return (
      <button
        className="ghost"
        onClick={() => setArmed(true)}
        disabled={pending}
        title="Delete this ledger, its findings, the decisions recorded on it and its audit trail. Nothing is kept."
      >
        Delete this ledger
      </button>
    );
  }

  return (
    <span className="confirm">
      <span className="muted">
        Delete {rowCount.toLocaleString()} rows, the findings and every decision? Nothing is kept.
      </span>
      <button
        className="danger"
        disabled={pending}
        onClick={() => start(async () => {
          try {
            await deleteMyLedger(id);
          } catch (e) {
            /* redirect() throws by design, so only a real failure reaches here
               with a message worth showing. */
            const message = e instanceof Error ? e.message : "That did not work.";
            if (!/NEXT_REDIRECT/.test(message)) setError(message);
          }
        })}
      >
        {pending ? "Deleting…" : "Yes, delete it"}
      </button>
      <button className="ghost" onClick={() => {setArmed(false); setError(null);}} disabled={pending}>
        Cancel
      </button>
      {error ? <span className="muted">{error}</span> : null}
    </span>
  );
}

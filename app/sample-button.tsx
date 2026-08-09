"use client";

import {useTransition} from "react";
import {loadSampleLedger} from "./actions";

/**
 * Owner-only. Loads a second synthetic ledger so two datasets can be switched
 * between while showing Countercheck to someone.
 *
 * The server checks ownership too — this component is only ever rendered for an
 * owner, but a client component deciding who may call a server action is not a
 * check, it is a suggestion.
 */
export function SampleButton({loaded}: {loaded: boolean}) {
  const [pending, start] = useTransition();

  return (
    <button
      className="ghost"
      disabled={pending}
      onClick={() => start(async () => { await loadSampleLedger(); })}
      title={
        loaded
          ? "Rebuild the sample export from scratch and open it. Any decisions recorded on the current copy are discarded."
          : "Import a second synthetic ledger — 218 rows with Xero-style headers — through the real column mapping and the real rules. Six problems are planted in it, and one lookalike that should not be reported."
      }
    >
      {pending ? "Importing…" : loaded ? "Rebuild sample export" : "Load sample export"}
    </button>
  );
}

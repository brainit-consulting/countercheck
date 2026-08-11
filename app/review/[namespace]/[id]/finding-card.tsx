"use client";

import {useEffect, useState, useTransition} from "react";
import type {Invoice, RuleId} from "../../../../src/types";
import type {Decision, Namespace, ReviewedFinding} from "../../../../lib/store";
import {decide} from "../../../actions";
import {money, isoDate} from "../../../../lib/money";

/**
 * A rule id is a fact about the engine; a reviewer needs a name and a next step.
 * The "check" line is what stops a finding being a shrug — it says who to ask
 * and what evidence settles it.
 */
const RULES: Record<RuleId, {label: string; check: string}> = {
  "exact-duplicate": {
    label: "Same invoice, paid twice",
    check: "Pull both payment records. If the second one cleared, it is a recovery — raise a credit request with the supplier.",
  },
  "rekeyed-duplicate": {
    label: "Re-keyed duplicate",
    check: "Same supplier, same amount, different invoice number, days apart. Usually a paper invoice entered twice. Compare the two source documents.",
  },
  "vendor-spelling-duplicate": {
    label: "One supplier, two spellings",
    check: "Two supplier records for the same company let the same invoice through twice. Check the master file for a merge candidate.",
  },
  "amount-transposition": {
    label: "Digits transposed",
    check: "The amount paid is a digit-swap away from another invoice from the same supplier. Read the original document, not the ledger line.",
  },
  "unapplied-credit": {
    label: "Credit note never applied",
    check: "The supplier issued a credit that no later payment deducts. Ask them to confirm the balance before the next run.",
  },
  "bank-detail-change": {
    label: "Bank details changed",
    check: "Confirm by phone on a number you already hold — never a number from the email that requested the change. This is how invoice-redirection fraud works.",
  },
  "round-number-outlier": {
    label: "Unusually round amount",
    check: "Round figures from a supplier who normally invoices to the penny are worth a glance — often a manual entry, occasionally an invented one.",
  },
};

export function FindingCard({
  finding, rows, namespace, ledgerId, signedIn,
}: {
  finding: ReviewedFinding;
  rows: Invoice[];
  namespace: Namespace;
  ledgerId: string;
  /** Anonymous visitors read everything and decide nothing. The server refuses
   * either way; this is so the interface does not offer what it will refuse. */
  signedIn: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState(finding.reason ?? "");
  const [pending, start] = useTransition();
  const rule = RULES[finding.ruleId];

  /**
   * A note is kept in this browser until a decision is recorded.
   *
   * It is deliberately NOT saved to the server as you type. A note stored
   * without a decision would be a fourth state that nothing counts — the same
   * shape as the "deferred" bug that took findings and their money out of every
   * total. The note is an attribute of the decision, not a thing of its own.
   *
   * But losing carefully typed words because someone clicked away is its own
   * kind of dishonesty, so the draft lives in localStorage, keyed by the
   * finding, and is cleared the moment the decision it belongs to is recorded.
   */
  const draftKey = `countercheck:note:${ledgerId}:${finding.key}`;

  useEffect(() => {
    if (finding.reason) return;              // a recorded reason wins over a draft
    try {
      const saved = window.localStorage.getItem(draftKey);
      if (saved) setReason(saved);
    } catch {
      /* private browsing, or storage full. A missing draft is not an error. */
    }
  }, [draftKey, finding.reason]);

  const onReason = (value: string) => {
    setReason(value);
    try {
      if (value.trim()) window.localStorage.setItem(draftKey, value);
      else window.localStorage.removeItem(draftKey);
    } catch {
      /* nothing to do, and nothing worth telling the reader about */
    }
  };

  const act = (decision: Decision | null) =>
    start(async () => {
      await decide(namespace, ledgerId, finding.key, decision, reason.trim() || undefined);
      try {
        window.localStorage.removeItem(draftKey);
      } catch {
        /* see above */
      }
    });

  return (
    <li className={`finding sev-${finding.severity}${finding.decision ? ` is-${finding.decision}` : ""}`}>
      <div className="finding-head">
        <div>
          <span className={`sev sev-${finding.severity}`}>{finding.severity}</span>
          <h3>{rule.label}</h3>
        </div>
        <p className="stake" title="Money at risk if this finding is real">{money(finding.amountAtStake, rows[0]?.currency)}</p>
      </div>

      <p className="explanation">{finding.explanation}</p>

      <details open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
        <summary>{rows.length} row{rows.length === 1 ? "" : "s"} of evidence</summary>
        <table className="evidence">
          <thead>
            <tr>
              <th scope="col">Date</th>
              <th scope="col">Supplier</th>
              <th scope="col">Invoice</th>
              <th scope="col" className="num">Amount</th>
              <th scope="col">Bank</th>
              <th scope="col">Reference</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.invoiceDate}</td>
                <td>{r.vendorName}</td>
                <td className="mono">{r.invoiceNumber}</td>
                <td className={`num mono${r.amount < 0 ? " credit" : ""}`}>{money(r.amount, r.currency)}</td>
                <td className="mono">{r.bankLast4 ? `••${r.bankLast4}` : "—"}</td>
                <td className="muted">{r.reference ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="check"><strong>How to settle it.</strong> {rule.check}</p>
      </details>

      {finding.decision ? (
        <p className="decided-note">
          <span className={`tag tag-${finding.decision}`}>{finding.decision}</span>
          <span>
            by {finding.decidedBy} on {isoDate(finding.decidedAt!)}
            {finding.reason ? ` — ${finding.reason}` : ""}
          </span>
          <button className="ghost small" disabled={pending || !signedIn} onClick={() => act(null)}
            title={signedIn ? "Clear this decision and return the finding to the open queue. The audit trail keeps both entries." : "Sign in to change a decision."}>
            Reopen
          </button>
        </p>
      ) : (
        <div className="decide">
          <input
            type="text"
            placeholder="Why — required to dismiss, optional to confirm"
            value={reason}
            onChange={(e) => onReason(e.target.value)}
            disabled={pending || !signedIn}
            title="Saved with the decision, not as you type. What you have written is kept in this browser until then, so leaving the page will not lose it."
          />
          <button className="decision decision-accept small" disabled={pending || !signedIn} onClick={() => act("accepted")}
            title={signedIn ? "Record that this finding is real. Nothing is paid, voided or altered — it is written down against your name." : "Sign in to record a decision. Anyone may read; deciding needs a person."}>
            Confirm — worth chasing
          </button>
          {/* Dismissing needs the sentence. A confirmed finding carries its own
              reason — the evidence is on the card — but a dismissed one throws
              the judgement away unless somebody writes it down. The server
              refuses it too; this only saves the reader a round trip. */}
          <button className="decision decision-reject small"
            disabled={pending || !signedIn || !reason.trim()}
            onClick={() => act("rejected")}
            title={
              !signedIn ? "Sign in to record a decision. Anyone may read; deciding needs a person."
                : !reason.trim() ? "Write why it is fine first. A dismissal with no reason is not a record of anything."
                  : "Record that this finding is not a problem. It leaves the queue but stays on the ledger with your reason."
            }>
            Dismiss — it&rsquo;s fine
          </button>
        </div>
      )}
    </li>
  );
}

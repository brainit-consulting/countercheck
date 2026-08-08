"use client";

import {useState, useTransition} from "react";
import type {Invoice, RuleId} from "../../../../src/types";
import type {Decision, Namespace, ReviewedFinding} from "../../../../lib/store";
import {decide} from "../../../actions";
import {money} from "../../../../lib/money";

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
  finding, rows, namespace, ledgerId,
}: {
  finding: ReviewedFinding;
  rows: Invoice[];
  namespace: Namespace;
  ledgerId: string;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState(finding.reason ?? "");
  const [pending, start] = useTransition();
  const rule = RULES[finding.ruleId];

  const act = (decision: Decision | null) =>
    start(async () => {
      await decide(namespace, ledgerId, finding.key, decision, reason.trim() || undefined);
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
            by {finding.decidedBy} on {new Date(finding.decidedAt!).toLocaleDateString("en-GB")}
            {finding.reason ? ` — ${finding.reason}` : ""}
          </span>
          <button className="ghost small" disabled={pending} onClick={() => act(null)}>
            Reopen
          </button>
        </p>
      ) : (
        <div className="decide">
          <input
            type="text"
            placeholder="Note (optional) — what you found, or why it's fine"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            disabled={pending}
          />
          <button className="decision decision-accept small" disabled={pending} onClick={() => act("accepted")}>
            Confirm — worth chasing
          </button>
          <button className="decision decision-reject small" disabled={pending} onClick={() => act("rejected")}>
            Dismiss — it&rsquo;s fine
          </button>
        </div>
      )}
    </li>
  );
}

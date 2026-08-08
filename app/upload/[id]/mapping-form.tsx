"use client";

import {useActionState, useState} from "react";
import type {ColumnMapping, Field} from "../../../src/import/csv";
import {confirmImport} from "../../actions";

/** Below this the guess is a suggestion, not a claim, and the row is flagged so
 * the eye goes to it. The threshold is presentational — the import itself uses
 * whatever the user leaves selected. */
const SHAKY = 0.6;

export function MappingForm({
  pendingId, headers, mapping, labels, fields, needsDateOrder, ambiguousDates,
}: {
  pendingId: string;
  headers: string[];
  mapping: ColumnMapping;
  labels: Record<Field, {name: string; note: string}>;
  fields: Field[];
  needsDateOrder: boolean;
  ambiguousDates: number;
}) {
  const [state, action, pending] = useActionState(confirmImport, null);
  const [chosen, setChosen] = useState<Record<string, string>>(
    Object.fromEntries(fields.map((f) => [f, mapping[f].column === null ? "" : String(mapping[f].column)])),
  );

  const missingRequired = (["vendorName", "invoiceNumber", "invoiceDate", "amount"] as Field[])
    .filter((f) => chosen[f] === "");

  return (
    <form action={action} className="panel">
      <input type="hidden" name="pendingId" value={pendingId} />

      <table className="mapping">
        <colgroup>
          <col className="c-field" />
          <col className="c-pick" />
          <col />
        </colgroup>
        <thead>
          <tr>
            <th scope="col">Field</th>
            <th scope="col">Column in your file</th>
            <th scope="col">Why this one</th>
          </tr>
        </thead>
        <tbody>
          {fields.map((field) => {
            const guess = mapping[field];
            const shaky = guess.column !== null && guess.confidence < SHAKY;
            return (
              <tr key={field} className={shaky ? "shaky" : undefined}>
                <th scope="row">
                  {labels[field].name}
                  <span className="field-note">{labels[field].note}</span>
                </th>
                <td>
                  <select
                    name={`map-${field}`}
                    value={chosen[field]}
                    disabled={pending}
                    onChange={(e) => setChosen({...chosen, [field]: e.target.value})}
                  >
                    <option value="">— not in this file —</option>
                    {headers.map((h, i) => (
                      <option key={i} value={i}>{h || `(column ${i + 1})`}</option>
                    ))}
                  </select>
                </td>
                <td className="muted reason">
                  {guess.column === null ? guess.reason : (
                    <>
                      <span className={`confidence${shaky ? " low" : ""}`}>
                        {Math.round(guess.confidence * 100)}%
                      </span>{" "}
                      {guess.reason}
                    </>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {needsDateOrder && (
        <fieldset className="date-order">
          <legend>
            {ambiguousDates.toLocaleString()} dates could be read two ways
          </legend>
          <p className="muted">
            A date like 03/04/2026 is the 3rd of April or the 4th of March depending on
            who exported it. Countercheck will not pick for you: an import silently
            shifted by months is the kind of error that survives all the way to a board
            pack.
          </p>
          <label><input type="radio" name="dateOrder" value="dmy" defaultChecked /> Day first — 03/04 is 3 April</label>
          <label><input type="radio" name="dateOrder" value="mdy" /> Month first — 03/04 is 4 March</label>
        </fieldset>
      )}

      {state?.error && <p className="form-error" role="alert">{state.error}</p>}
      {missingRequired.length > 0 && (
        <p className="form-error">
          Still needed: {missingRequired.map((f) => labels[f].name).join(", ")}.
        </p>
      )}

      <button className="primary" type="submit" disabled={pending || missingRequired.length > 0}>
        {pending ? "Checking…" : "Check these payments"}
      </button>
    </form>
  );
}

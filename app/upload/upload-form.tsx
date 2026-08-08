"use client";

import {useActionState} from "react";
import {stageUpload} from "../actions";

export function UploadForm() {
  const [state, action, pending] = useActionState(stageUpload, null);

  return (
    <form action={action} className="upload-form">
      <label className="file-field">
        <span className="field-label">CSV file</span>
        <input type="file" name="file" accept=".csv,text/csv" required disabled={pending} />
      </label>

      {state?.error && <p className="form-error" role="alert">{state.error}</p>}

      <button className="primary" type="submit" disabled={pending}>
        {pending ? "Reading…" : "Read the columns"}
      </button>
      <p className="muted small-print">
        Nothing is analysed until you have confirmed which column is which.
      </p>
    </form>
  );
}

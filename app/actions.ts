"use server";

import {revalidatePath} from "next/cache";
import {redirect} from "next/navigation";
import {detect} from "../src/detection/engine";
import {generateLedger} from "../src/demo/generate";
import {importCsv, FIELDS, type DateOrder, type Field} from "../src/import/csv";
import {
  createLedger, discardPending, listLedgers, readPending, recordDecision,
  resetDemo, savePending, type Decision, type Ledger,
} from "../lib/store";

/** Until sign-in is added, decisions are attributed to a single reviewer. Auth
 * replaces this one function, not every call site. */
const currentUser = () => "demo reviewer";

function buildDemoSeed() {
  const ledger = generateLedger();
  const {findings} = detect(ledger.rows);
  return {name: "Demo ledger — 12 months of accounts payable", invoices: ledger.rows, findings};
}

/** The demo ledger is seeded on first view so the app is never empty. */
export async function ensureDemoLedger(): Promise<Ledger> {
  const existing = listLedgers("demo");
  if (existing.length) return existing[0];
  const seed = buildDemoSeed();
  return createLedger("demo", seed.name, seed.invoices, seed.findings);
}

export async function resetDemoLedger() {
  const ledger = resetDemo(buildDemoSeed);
  revalidatePath("/");
  revalidatePath(`/review/demo/${ledger.id}`);
  return ledger;
}

export async function decide(
  namespace: "demo" | "uploads", ledgerId: string, key: string,
  decision: Decision, reason?: string,
) {
  recordDecision(namespace, ledgerId, key, decision, currentUser(), reason);
  revalidatePath(`/review/${namespace}/${ledgerId}`);
}

/* -------------------------------------------------------------------------- */

/** Large enough for a year of a mid-sized ledger, small enough that a mis-drop
 * of a database dump fails fast instead of filling the disk. */
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

export async function stageUpload(_prev: unknown, form: FormData): Promise<{error: string} | never> {
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return {error: "Choose a CSV file to check."};
  if (file.size > MAX_UPLOAD_BYTES) {
    return {error: `That file is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is 25 MB — export a narrower date range.`};
  }
  const text = await file.text();
  const id = savePending(file.name, text);
  redirect(`/upload/${id}`);
}

/**
 * Import under the mapping the user confirmed, then run detection.
 *
 * Rows that failed coercion are left out and reported rather than guessed at —
 * a ledger that silently lost 40 rows produces a finding count nobody can
 * reconcile against their own system.
 */
export async function confirmImport(_prev: unknown, form: FormData): Promise<{error: string} | never> {
  const id = String(form.get("pendingId") ?? "");
  const pending = readPending(id);
  if (!pending) return {error: "That upload has expired. Choose the file again."};

  const mapping: Partial<Record<Field, number>> = {};
  for (const field of FIELDS) {
    const raw = form.get(`map-${field}`);
    const column = raw === null || raw === "" ? -1 : Number(raw);
    if (Number.isInteger(column) && column >= 0) mapping[field] = column;
  }
  const dateOrderRaw = String(form.get("dateOrder") ?? "");
  const dateOrder = dateOrderRaw === "dmy" || dateOrderRaw === "mdy" ? (dateOrderRaw as DateOrder) : undefined;

  const result = importCsv(pending.text, {mapping, dateOrder});
  if (!result.rows.length) {
    return {
      error: result.errors[0]?.reason ?? "No rows could be read from that file.",
    };
  }

  const {findings} = detect(result.rows);
  const skipped = result.errors.length;
  const name = `${pending.name} — ${result.rows.length.toLocaleString()} rows${skipped ? `, ${skipped} skipped` : ""}`;
  const ledger = createLedger("uploads", name, result.rows, findings);

  discardPending(id);
  revalidatePath("/");
  redirect(`/review/uploads/${ledger.id}`);
}

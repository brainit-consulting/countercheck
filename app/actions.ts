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
  const existing = await listLedgers("demo");
  if (existing.length) return existing[0];
  const seed = buildDemoSeed();
  return await createLedger("demo", seed.name, seed.invoices, seed.findings);
}

export async function resetDemoLedger() {
  const ledger = await resetDemo(buildDemoSeed);
  revalidatePath("/");
  revalidatePath(`/review/demo/${ledger.id}`);
  return ledger;
}

/**
 * A server action is a public HTTP endpoint, so its arguments are checked here
 * rather than trusted because the UI only offers three buttons. An unvalidated
 * decision string would be written straight into the ledger, and a value no
 * screen counts makes a finding — and its money — vanish from every total.
 *
 * `decision: null` reopens.
 */
export async function decide(
  namespace: "demo" | "uploads", ledgerId: string, key: string,
  decision: Decision | null, reason?: string,
) {
  if (namespace !== "demo" && namespace !== "uploads") throw new Error("unknown namespace");
  if (decision !== null && decision !== "accepted" && decision !== "rejected") {
    throw new Error("a finding is either accepted, rejected, or reopened");
  }
  const trimmed = typeof reason === "string" ? reason.slice(0, 500) : undefined;
  const saved = await recordDecision(namespace, ledgerId, key, decision, currentUser(), trimmed);
  if (!saved) throw new Error("that finding is no longer in this ledger");
  revalidatePath(`/review/${namespace}/${ledgerId}`);
  revalidatePath("/");
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
  const id = await savePending(file.name, text);
  redirect(`/upload/${id}`);
}

/**
 * Import under the mapping the user confirmed, then run detection.
 *
 * Rows that failed coercion are left out and reported rather than guessed at —
 * a ledger that silently lost 40 rows produces a finding count nobody can
 * reconcile against their own system.
 */
export type ImportProblem = {error: string; needsDateOrder?: boolean};

export async function confirmImport(_prev: unknown, form: FormData): Promise<ImportProblem | never> {
  const id = String(form.get("pendingId") ?? "");
  const pending = id ? await readPending(id) : null;
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

  /**
   * Ambiguous dates stop the import rather than costing it rows.
   *
   * The mapping screen only offers the day-first/month-first question when its
   * own first guess happened to find the date column. If the guess missed it and
   * the user picked the column by hand, the ambiguity surfaces here for the first
   * time — and without this, every ambiguous row would simply be dropped and
   * counted as "skipped", which is the silent months-long shift the product
   * promises not to do. Asking again is the whole point.
   */
  const ambiguous = result.errors.filter((e) => /ambiguous/i.test(e.reason));
  if (ambiguous.length && !dateOrder) {
    return {
      needsDateOrder: true,
      error: `${ambiguous.length.toLocaleString()} date${ambiguous.length === 1 ? "" : "s"} in this file could be read two ways. Choose which before importing.`,
    };
  }

  if (!result.rows.length) {
    return {error: result.errors[0]?.reason ?? "No rows could be read from that file."};
  }

  const {findings} = detect(result.rows);
  // Rows, not errors: one row can fail three coercions, and a count the user
  // cannot reconcile against their own export is worse than no count at all.
  const skipped = new Set(result.errors.map((e) => e.row)).size;
  const name = `${pending.name} — ${result.rows.length.toLocaleString()} rows${skipped ? `, ${skipped} skipped` : ""}`;
  const ledger = await createLedger("uploads", name, result.rows, findings);

  await discardPending(id);
  revalidatePath("/");
  redirect(`/review/uploads/${ledger.id}`);
}

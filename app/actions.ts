"use server";

import {revalidatePath} from "next/cache";
import {redirect} from "next/navigation";
import {detect} from "../src/detection/engine";
import {generateLedger} from "../src/demo/generate";
import {importCsv, FIELDS, type DateOrder, type Field} from "../src/import/csv";
import {
  createLedger, deleteUploadedLedger, discardPending, listLedgers, readPending, recordDecision,
  resetDemo, savePending, removeSampleLedgers, SAMPLE_NAME, ANONYMOUS,
  type Decision, type Ledger,
} from "../lib/store";
import {requireUser} from "../lib/session";
import {isOwner, requireOwner} from "../lib/owner";
import {SAMPLE_CSV} from "../src/demo/sample-csv";

/* currentUser now lives in lib/session.ts and reads the signed-in person from
 * the request. The comment that used to sit here said replacing it would be a
 * change to one function rather than to every call site. That held. */

function buildDemoSeed() {
  const ledger = generateLedger();
  const {findings} = detect(ledger.rows);
  /* Eleven, not twelve. The generated span is 336 days, and everywhere else
     that says so — the home page and the manual — was corrected to eleven when
     finding 55 was worked through. This string was missed because it is stored
     on the ledger row at seed time rather than rendered from the data, so it
     only shows on screens that read the ledger's name. It was found in a video
     capture of the review queue, not by reading the code. */
  return {name: "Demo ledger — eleven months of accounts payable", invoices: ledger.rows, findings};
}

/** The demo ledger is seeded on first view so the app is never empty. */
export async function ensureDemoLedger(): Promise<Ledger> {
  const existing = await listLedgers("demo", ANONYMOUS);
  if (existing.length) return existing[0];
  const seed = buildDemoSeed();
  return await createLedger("demo", seed.name, seed.invoices, seed.findings);
}

/**
 * Reset destroys every decision on the demo ledger and the audit trail with
 * them, and it had no check on it at all — an anonymous visitor could call it.
 * The comment thirty lines below says a server action is a public HTTP endpoint
 * whose arguments must be checked rather than trusted because the UI only
 * offers three buttons. The same sentence applies to whether it may be called,
 * and this one was not held to it.
 *
 * Found on 2026-08-11 while checking that nothing in Part 02 lied. Nothing did;
 * this was underneath.
 */
export async function resetDemoLedger() {
  await requireOwner();
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
  const trimmed = typeof reason === "string" ? reason.trim().slice(0, 500) || undefined : undefined;
  /**
   * A dismissal has to say why. Confirming does not.
   *
   * DESIGN.md has said so since the first draft — "rejecting opens a required
   * reason field", and "a rejection without a visible reason is a bug" — while
   * the manual called the note optional and the code followed the manual. Three
   * statements of intent, two of them wrong, and the one that shipped was the
   * weakest.
   *
   * The asymmetry is the point. A confirmed finding carries its own reason: the
   * evidence is on the card. A dismissed one destroys the only record of the
   * judgement unless somebody writes the sentence down, and "we looked at that
   * and it was fine" six months later is worth nothing without it.
   *
   * Checked here and not only in the form, because a server action is a public
   * endpoint whether or not a button points at it.
   */
  if (decision === "rejected" && !trimmed) {
    throw new Error("Dismissing a finding needs a reason — write what you found.");
  }
  // Deciding is the act this product exists to record, so it requires a person.
  // An anonymous visitor may read every finding and every row of evidence, and
  // decide nothing — the alternative is an audit trail that names a constant.
  const who = await requireUser();
  const saved = await recordDecision(namespace, ledgerId, key, decision, who, trimmed);
  if (!saved) throw new Error("that finding is no longer in this ledger");
  revalidatePath(`/review/${namespace}/${ledgerId}`);
  revalidatePath("/");
}

/* -------------------------------------------------------------------------- */

/** Large enough for a year of a mid-sized ledger, small enough that a mis-drop
 * of a database dump fails fast instead of filling the disk. */
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

export async function stageUpload(_prev: unknown, form: FormData): Promise<{error: string} | never> {
  // Uploading is the act that makes us the holder of someone else's supplier
  // names, amounts and partial bank details. It requires a person, on the same
  // reasoning as deciding — and more urgently, because deciding on synthetic
  // data is harmless and this is not.
  await requireUser();
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
  // Gated separately rather than trusting that stageUpload ran first. A pending
  // id is a UUID in a URL, and "the earlier step checked" is how the check gets
  // skipped.
  //
  // The address is kept now rather than discarded: it becomes the ledger's
  // owner, and it is the only thing that makes a later access decision possible.
  const uploader = await requireUser();
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
  const ledger = await createLedger("uploads", name, result.rows, findings, uploader);

  await discardPending(id);
  revalidatePath("/");
  redirect(`/review/uploads/${ledger.id}`);
}


/**
 * Load the sample export, for showing Countercheck to someone.
 *
 * Runs the embedded CSV through the same importCsv and the same rules an
 * uploaded file goes through — the point of having a second dataset is to show
 * the real path, and a shortcut that built rows directly would demonstrate
 * something the product does not actually do.
 *
 * Replaces any previous copy rather than accumulating one per demonstration.
 * That is a reset of this one ledger, not a general delete path. The general
 * one is `deleteMyLedger` below, added in Part 04.
 */
export async function loadSampleLedger() {
  /* requireOwner rather than isOwner: it returns the address, which the sample
     ledger now needs as its owner. The fixture is the instance owner's. */
  const owner = await requireOwner();

  const result = importCsv(SAMPLE_CSV, {dateOrder: "dmy"});
  if (result.errors.length) {
    throw new Error(`the sample export did not import cleanly: ${JSON.stringify(result.errors[0])}`);
  }
  const {findings} = detect(result.rows);

  await removeSampleLedgers();
  const ledger = await createLedger("uploads", SAMPLE_NAME, result.rows, findings, owner);
  revalidatePath("/");
  redirect(`/review/uploads/${ledger.id}`);
}

/**
 * Delete your own uploaded ledger.
 *
 * Part 03 said, in a published video and on a public page, that the rows are
 * kept and no button removes them. This is that button.
 *
 * The check is ownership, not sign-in. A session says a person came back; it
 * does not say the data is theirs. `deleteUploadedLedger` matches the ledger's
 * recorded owner against the address in the session and deletes nothing when
 * they differ — the same query does the finding and the deciding, so there is no
 * gap between checking and acting.
 *
 * It refuses without a reason, and deliberately: telling a caller "that exists
 * but is not yours" tells them it exists.
 */
export async function deleteMyLedger(id: string) {
  const who = await requireUser();
  const gone = await deleteUploadedLedger(id, {email: who, isInstanceOwner: false});
  if (!gone) throw new Error("That ledger is not there.");
  revalidatePath("/");
  redirect("/?deleted=1");
}

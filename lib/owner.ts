import {currentUser} from "./session";

/**
 * Who owns this instance.
 *
 * Two things are gated on this, and the second is a promotion that the earlier
 * version of this comment predicted and warned against — so it is recorded here
 * rather than quietly absorbed.
 *
 * 1. A button that loads a second synthetic ledger, so two datasets can be
 *    switched between while showing Countercheck to someone. A convenience.
 * 2. **Resetting the demo ledger**, which destroys every decision recorded on it
 *    and the whole audit trail with them. Until 2026-08-11 that server action
 *    had no check at all and any anonymous visitor could call it.
 *
 * This comment used to say a comma-separated environment variable "is fine for
 * a button and is not fine for anything else". That is still true, and (2) is
 * the anything else. The gate is here because the alternative was leaving the
 * hole open, not because this is the right long-term mechanism:
 *
 * - `OWNER_EMAILS` is deployment configuration, so ownership cannot be granted
 *   or revoked without a redeploy, and it is invisible inside the application.
 * - Nothing records who was an owner at the time an action was taken.
 * - It is now checked in two places. Three is where this stops being reviewable.
 *
 * The real answer is a role on the user record, checked once, with the check
 * tested. Part 04 of the Master Build is about deciding who may come in, and
 * this belongs there.
 */
const OWNERS = (process.env.OWNER_EMAILS ?? "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

export async function isOwner(): Promise<boolean> {
  if (!OWNERS.length) return false;      // unset means nobody, never everybody
  const who = await currentUser();
  return who !== null && OWNERS.includes(who.toLowerCase());
}

/**
 * The server-side half of the gate.
 *
 * Hiding the button is presentation. This is the check that matters, because a
 * server action is an endpoint whether or not anything on screen points at it —
 * which is exactly how the reset came to be callable by anyone in the first
 * place.
 */
export async function requireOwner(): Promise<string> {
  const who = await currentUser();
  if (who === null) throw new Error("Not signed in.");
  if (!(await isOwner())) throw new Error("That action is limited to the owner of this instance.");
  return who;
}

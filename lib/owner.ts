import {currentUser} from "./session";

/**
 * Who owns this instance.
 *
 * There is exactly one thing gated on this: a button that loads a second,
 * synthetic ledger so Emile can switch between two datasets while showing
 * Countercheck to someone. It is a demo convenience, not a permission system —
 * nothing an owner can see is hidden from anyone for confidentiality reasons,
 * and nothing here decides who may read or decide anything.
 *
 * Said plainly because "admin" flags grow. If this ever gates something that
 * matters, it needs to become a real role on the user record, checked in one
 * place, with the check tested. A comma-separated environment variable is fine
 * for a button and is not fine for anything else.
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

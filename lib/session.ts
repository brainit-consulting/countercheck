import {headers} from "next/headers";
import {auth} from "./auth";

/**
 * Who is signed in, or nobody.
 *
 * `currentUser()` in app/actions.ts returned the literal string "demo reviewer"
 * for the whole of Part 01, and every audit line still carries it. The comment
 * above it said replacing it would be a change to one function rather than to
 * every call site. This is that function, and the claim held.
 */
export async function currentUser(): Promise<string | null> {
  const session = await auth.api.getSession({headers: await headers()});
  // The email is the identity on purpose. A display name is something a person
  // types, and an audit trail wants the thing they had to prove they own.
  return session?.user?.email ?? null;
}

/**
 * The same, for paths that must not proceed without a person.
 *
 * Deciding is the act the product exists to record. An anonymous visitor may
 * read everything and decide nothing — so this throws rather than returning a
 * placeholder, because the placeholder is exactly the bug being fixed.
 */
export async function requireUser(): Promise<string> {
  const who = await currentUser();
  if (!who) throw new Error("Sign in to record a decision.");
  return who;
}

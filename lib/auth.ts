import {betterAuth} from "better-auth";
import {magicLink} from "better-auth/plugins";
import {Pool} from "@neondatabase/serverless";

/**
 * Sign-in.
 *
 * Part 01 recorded every decision against the string "demo reviewer", because
 * `currentUser()` returned a constant. An audit trail whose "who" column is a
 * hardcoded string is decoration — the product's central claim is that a person
 * decided, and until now no person was identified. This is what makes that claim
 * checkable rather than asserted.
 *
 * Magic link, and no passwords. Not for fashion: a password means a hash to
 * store, a reset flow to build, and a class of breach to be responsible for, in
 * exchange for nothing this application needs. The email address is the
 * identity, and it is the thing that appears in the audit trail.
 *
 * Better Auth is a library here, not a marketplace integration — it is not on
 * the Vercel marketplace at all. It takes the Neon driver's pg-compatible Pool
 * directly, so there is no ORM and no new dependency for its sake.
 *
 * Better Auth owns its four tables in the default `public` schema; the
 * application's own tables live in `countercheck` (see lib/db.ts). The split is
 * deliberate: those tables are Better Auth's business and are migrated by its
 * CLI, not by our ensureSchema.
 */

const required = (name: string): string => {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set. Run \`vercel env pull .env.local\` if you are working locally.`);
  return v;
};

/** The URL the magic link points at. Getting this wrong sends people to
 * localhost from their phone, so it is read from the environment rather than
 * guessed from the request. */
const baseURL =
  process.env.BETTER_AUTH_URL ??
  (process.env.VERCEL_ENV === "production"
    ? "https://countercheck-brainit.vercel.app"
    : "http://localhost:3000");

export const auth = betterAuth({
  database: new Pool({connectionString: required("DATABASE_URL")}),
  secret: required("BETTER_AUTH_SECRET"),
  baseURL,
  emailAndPassword: {enabled: false},
  plugins: [
    magicLink({
      /** Long enough to walk to another device, short enough to matter. */
      expiresIn: 15 * 60,
      sendMagicLink: async ({email, url}) => {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${required("RESEND_API_KEY")}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: required("SENDER_EMAIL"),
            to: [email],
            subject: "Your Countercheck sign-in link",
            text: [
              "Someone asked to sign in to Countercheck with this address.",
              "",
              url,
              "",
              "The link works once and expires in fifteen minutes.",
              "",
              "If that was not you, nothing has happened and you can ignore this.",
              "Countercheck cannot pay, void, or alter anything — it only reads",
              "what it is given, and records what a person decided.",
            ].join("\n"),
          }),
        });
        if (!res.ok) {
          // Fail loudly. A sign-in link that was never sent looks exactly like
          // one the user has not opened yet, and they will wait for it.
          const body = await res.text().catch(() => "");
          throw new Error(`Resend refused the sign-in email (HTTP ${res.status}): ${body.slice(0, 200)}`);
        }
      },
    }),
  ],
});

export type Session = typeof auth.$Infer.Session;

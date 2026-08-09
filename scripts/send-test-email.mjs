/**
 * Sends one real email through Resend to prove the path works.
 *
 *   node scripts/send-test-email.mjs <recipient>
 *
 * Reads the key from .env.local and never prints it. A table of environment
 * variables tells you they exist, not that the key, the verified domain and the
 * From line agree with each other — only a delivered message does that.
 */
import {readFileSync} from "node:fs";

const to = process.argv[2];
if (!to) {
  console.error("usage: node scripts/send-test-email.mjs <recipient>");
  process.exit(1);
}

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trimStart().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")];
    }),
);

const key = env.RESEND_API_KEY;
const from = env.SENDER_EMAIL;
if (!key) { console.error("RESEND_API_KEY missing from .env.local"); process.exit(1); }
if (!from) { console.error("SENDER_EMAIL missing from .env.local"); process.exit(1); }

const stamp = new Date().toISOString();
console.log(`from  ${from}`);
console.log(`to    ${to}`);
console.log(`key   ${key.slice(0, 3)}…${key.slice(-4)}   (${key.length} chars)`);

const res = await fetch("https://api.resend.com/emails", {
  method: "POST",
  headers: {Authorization: `Bearer ${key}`, "Content-Type": "application/json"},
  body: JSON.stringify({
    from,
    to: [to],
    subject: "Countercheck — Resend path check",
    text: [
      "This is a delivery test for Countercheck, BrainIT Master Build No. 1.",
      "",
      "It confirms three things agree with each other:",
      "  - the API key stored in the countercheck Vercel project",
      "  - the domain verified in Resend (dreamforgeworld.com)",
      `  - the From address (${from})`,
      "",
      `Sent ${stamp}`,
      "",
      "Nothing was written to any system to produce this message.",
    ].join("\n"),
  }),
});

const body = await res.json().catch(() => ({}));
if (!res.ok) {
  console.error(`\nFAILED  HTTP ${res.status}`);
  console.error(JSON.stringify(body, null, 2));
  process.exit(1);
}
console.log(`\nAccepted by Resend.  id: ${body.id}`);
console.log("Delivery is a separate question — check the inbox and the headers.");

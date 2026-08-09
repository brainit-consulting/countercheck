import type {Metadata} from "next";
import {Fraunces, IBM_Plex_Sans, DM_Mono} from "next/font/google";
import "./brand.css";
import "./globals.css";
import {HelpBook} from "./help/help-book";

/* Self-hosted at build time — no runtime CDN, which matters for a tool people
 * will run against their own ledger. Fraunces is axis-locked sober in brand.css;
 * DM Mono carries every figure in the product, because a column of amounts that
 * does not line up is a column nobody scans. */
const display = Fraunces({subsets: ["latin"], variable: "--font-fraunces", axes: ["SOFT", "WONK"]});
const body = IBM_Plex_Sans({subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-plex-sans"});
const mono = DM_Mono({subsets: ["latin"], weight: ["400", "500"], variable: "--font-dm-mono"});

import {currentUser} from "../lib/session";

export const metadata: Metadata = {
  title: "Countercheck — spend integrity",
  description:
    "Find duplicate and erroneous payments in an accounts-payable export. Read-only: it never writes back to any system.",
};

export default async function RootLayout({children}: {children: React.ReactNode}) {
  // Read once here rather than in every page: the masthead is the one place
  // that has to say who you are on every screen.
  const who = await currentUser();

  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body>
        <header className="masthead">
          <a className="wordmark" href="/">
            Countercheck
            <span className="wordmark-sub">spend integrity</span>
          </a>
          <div className="masthead-tools">
            <p className="readonly-badge" title="Countercheck cannot pay, void, or alter anything. It only reads what you give it.">
              Read-only
            </p>
            <a
              className="who"
              href="/sign-in"
              title={
                who
                  ? `Signed in as ${who} — decisions you record are attributed to this address. Click to sign out.`
                  : "Anyone can read Countercheck. Recording a decision needs a person. Click to sign in."
              }
            >
              {/* Never truncated and never abbreviated: a person has to be able
                  to see which account they are signed in as, and the domain is
                  half of that. The masthead wraps instead. */}
              {who ?? "Sign in"}
            </a>
            <HelpBook />
          </div>
        </header>
        <main>{children}</main>
        <footer className="foot">
          Countercheck reads an export and reports what looks wrong. Every finding is a
          question for a person, not a decision. Press{" "}
          <kbd>?</kbd> for the manual.
        </footer>
      </body>
    </html>
  );
}

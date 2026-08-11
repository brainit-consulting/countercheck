/**
 * The Countercheck manual.
 *
 * Content lives here as data, not markup, for one reason: this file is the thing
 * that has to be updated when the product changes, and a person updating it
 * should not have to read JSX to find the sentence they need to fix.
 *
 * Every claim here must be true of the code. If a rule changes, this changes.
 */

export type Block =
  | {kind: "p"; text: string}
  | {kind: "h"; text: string}
  | {kind: "list"; items: string[]}
  | {kind: "steps"; items: string[]}
  | {kind: "note"; title: string; text: string}
  | {kind: "table"; head: string[]; rows: string[][]}
  | {kind: "keys"; rows: [string, string][]};

export type Chapter = {
  id: string;
  title: string;
  /** One line, shown in the contents. Says what the chapter answers. */
  blurb: string;
  blocks: Block[];
};

export const CHAPTERS: Chapter[] = [
  {
    id: "what-it-is",
    title: "What Countercheck is",
    blurb: "The premise, and the three things it deliberately cannot do.",
    blocks: [
      {
        kind: "p",
        text:
          "Countercheck reads a list of invoices you have already paid or approved, and tells you which ones look wrong. Duplicates, credit notes nobody claimed, amounts with the digits swapped, payments that quietly moved to a new bank account. For each one it shows you the actual rows it matched and what to do about it.",
      },
      {
        kind: "p",
        text:
          "It is a second pair of eyes. It does not approve, pay, void or correct anything, and it is not trying to. Everything it produces is a question for a person.",
      },
      {kind: "h", text: "Three things it cannot do"},
      {
        kind: "list",
        items: [
          "It cannot write to your finance system. There is no connection to one. You give it a file; that is the entire interface. The blast radius is zero, which is the reason a finance director will let it near payment data at all.",
          "It cannot send your ledger to an AI model. Detection is a fixed set of rules — arithmetic and string comparison. No part of your data leaves the machine it is running on. There is nothing to opt out of.",
          "It cannot decide anything. Every finding sits in a queue until a person confirms or dismisses it, and that decision is recorded with who made it and when.",
        ],
      },
      {kind: "h", text: "Why this is worth your afternoon"},
      {
        kind: "p",
        text:
          "APQC's benchmarking puts duplicate and erroneous payments at 0.8 percent of the number of disbursements for top performers, and 2 percent for the worst. That is a count of payments, not a share of the money — on twenty thousand supplier payments a year it is 160 to 400 that were duplicated, sent to the wrong supplier, or sent for the wrong amount. What they are worth depends on which ones they were, and APQC's own caution is that a single one can run to tens of thousands.",
      },
      {
        kind: "p",
        text:
          "You already have the data. It exports to CSV from whatever you are running.",
      },
      {
        kind: "note",
        title: "What it is not",
        text:
          "Not accounts-payable automation. Not a payments platform. Not an ERP module. Not a machine-learning anomaly detector. Not a replacement for a recovery-audit firm if you are large enough to hire one.",
      },
    ],
  },

  {
    id: "first-look",
    title: "Your first ten minutes",
    blurb: "Open the demo, read a finding, decide it. Nothing is uploaded.",
    blocks: [
      {
        kind: "p",
        text:
          "Nobody uploads a payment ledger to software they have not watched work. So Countercheck ships with a demo ledger and seeds it the first time you open the app.",
      },
      {
        kind: "steps",
        items: [
          "On the front page, look at the demo ledger panel. It holds 237 invoices across twelve months from twenty suppliers.",
          "Press Review findings. You will land in the review queue with six open findings and roughly £27,400 at stake.",
          "Open the first finding's evidence. You are looking at the actual invoice rows, exactly as they appear in the ledger.",
          "Read the How to settle it note underneath. That is the sentence that tells you who to ask and what will prove it either way.",
          "Confirm or dismiss it. Add a note if you want one. Watch the totals at the top change and the finding move down into Decided.",
          "Scroll to the audit trail at the foot of the page. Your decision is the newest line.",
        ],
      },
      {
        kind: "p",
        text:
          "The demo data is generated from a fixed seed, so it is the same every time and it is nobody's real data. The problems planted in it, however, are the real ones — they are the patterns that actually cost companies money.",
      },
      {
        kind: "note",
        title: "Reset demo data",
        text:
          "The button on the front page throws away the demo ledger and regenerates it, including every decision you made on it. It asks once before it does. It can only ever touch the demo — uploaded ledgers live in a separate place and the reset has no way to name them.",
      },
    ],
  },

  {
    id: "reading-a-finding",
    title: "How to read a finding",
    blurb: "Severity, money at stake, evidence, and the settling question.",
    blocks: [
      {
        kind: "p",
        text:
          "Every finding is an accusation about someone's paperwork, and often about a colleague's or a supplier's. It is laid out so you can tell in about four seconds whether it deserves your morning.",
      },
      {kind: "h", text: "The parts"},
      {
        kind: "table",
        head: ["Part", "What it tells you"],
        rows: [
          ["Severity", "High, medium or low. High means money is out of the door or about to be. Medium means wrong but recoverable, or not yet confirmed. Low means it is not an error at all, only a question worth asking."],
          ["Amount at stake", "What you lose if the finding is real. Not the invoice total — the recoverable part. This is what the queue is sorted by within a severity band."],
          ["The sentence", "What the rule actually saw, in words, with the supplier and the invoice numbers in it. If you cannot act on the sentence alone, the sentence is wrong and that is a bug."],
          ["Evidence", "The invoice rows the rule matched, in the order you should read them. This is your data, quoted back to you, unaltered."],
          ["How to settle it", "The next physical step. Which document to pull, who to phone, what answer closes it."],
        ],
      },
      {kind: "h", text: "The queue order"},
      {
        kind: "p",
        text:
          "Findings are sorted by severity first, then by money at stake. If you only have an hour, working from the top is the correct strategy — that is what the ordering is for.",
      },
      {
        kind: "note",
        title: "One finding per problem",
        text:
          "Several rules can match the same rows. When that happens only the strongest finding survives, so a single duplicate payment appears once rather than three times wearing different hats. A queue that reports the same problem repeatedly is a queue people stop reading.",
      },
    ],
  },

  {
    id: "the-checks",
    title: "The seven checks",
    blurb: "What each rule catches, and what a false positive looks like.",
    blocks: [
      {
        kind: "p",
        text:
          "Seven rules run over the ledger. Each one has to be explainable in a sentence, because you are going to have to repeat it to whoever's work it questions.",
      },
      {
        kind: "table",
        head: ["Check", "What it catches", "When it is wrong"],
        rows: [
          [
            "Same invoice, paid twice",
            "The same supplier, invoice number and amount appearing more than once.",
            "Instalments recorded under one invoice number. Rare, and usually a sign the numbering is the real problem.",
          ],
          [
            "Re-keyed duplicate",
            "Same supplier and amount, different invoice number, within three weeks. This is the classic: a paper invoice entered twice.",
            "A supplier who genuinely bills the same round figure twice a month. The schedule guard catches most of these before you see them.",
          ],
          [
            "One supplier, two spellings",
            "Two supplier records for one company — Acme Ltd and ACME Limited — letting the same invoice through twice.",
            "Two genuinely different companies with similar names. Look at the bank details; they settle it immediately.",
          ],
          [
            "Digits transposed",
            "An amount that is a digit-swap away from another invoice from the same supplier near the same date. £1,890 against £1,980.",
            "Coincidence. It happens. This is why the rule is medium and not high.",
          ],
          [
            "Credit note never applied",
            "A credit the supplier issued that no later payment deducts. This is money you are owed and nobody has claimed.",
            "The credit was applied outside the export's date range. Widen the range and re-run.",
          ],
          [
            "Bank details changed",
            "Payments to a supplier moving to a new account. This is what invoice-redirection fraud looks like from the inside.",
            "A genuine change the supplier told you about. Confirming it costs one phone call, and it is the single most valuable call in this list.",
          ],
          [
            "Unusually round amount",
            "A round figure above five thousand from a supplier who normally invoices to the penny.",
            "Often. This rule is low severity because it is a prompt, not an accusation. It stays quiet for suppliers who always bill round numbers.",
          ],
        ],
      },
      {kind: "h", text: "The rule that does not fire"},
      {
        kind: "p",
        text:
          "The most important piece of logic in Countercheck is not a check. It is the guard that recognises a regular schedule.",
      },
      {
        kind: "p",
        text:
          "A cleaning contract bills £1,450 on the first of every month. Every software licence, every rent payment, every retainer does the same thing. To a duplicate detector, that is twelve duplicates a year, from every supplier you have on contract. Without the guard, the queue fills with your own standing orders and everything real is buried underneath — and once people stop reading the queue, the tool is worth less than nothing, because now you think you have checked.",
      },
      {
        kind: "p",
        text:
          "So a vendor-and-amount pair that recurs on a steady monthly cadence is treated as a contract, not a duplicate. If you see one of your contracts flagged anyway, it means the cadence is irregular enough to be worth a look.",
      },
    ],
  },

  {
    id: "deciding",
    title: "Deciding, and the audit trail",
    blurb: "Confirm, dismiss, note, reopen — and what gets recorded.",
    blocks: [
      {
        kind: "p",
        text:
          "Every finding has two answers and neither is the default.",
      },
      {
        kind: "list",
        items: [
          "Confirm — worth chasing. The finding is real. Someone is going to raise it with a supplier or a colleague.",
          "Dismiss — it's fine. The finding is not real. Countercheck was wrong.",
        ],
      },
      {
        kind: "p",
        text:
          "The two buttons look identical on purpose. Confirming means bad news; dismissing means the tool made a mistake. If either one were the big obvious button, it would nudge you toward that answer, and the entire value of this queue rests on your decision being honest rather than convenient.",
      },
      {kind: "h", text: "The note"},
      {
        kind: "p",
        text:
          "The note field is optional and you should use it anyway. Six months from now, the useful part of a dismissed finding is not that it was dismissed — it is why. Write the sentence you would say to an auditor.",
      },
      {kind: "h", text: "The audit trail"},
      {
        kind: "p",
        text:
          "At the foot of every review queue is an append-only record: what was decided, by whom, when, and the note if there was one. Reopening a finding and deciding it differently adds a line. It never edits the line before it. That is what makes it an audit trail rather than a status field.",
      },
      {
        kind: "note",
        title: "Who decided",
        text:
          "The name beside a decision is the email address of the person signed in when it was made. Decisions taken before sign-in existed say \"demo reviewer\" instead — a fixed piece of text that every decision was recorded against. Those lines are still there, because an audit trail that is rewritten to look better is not an audit trail.",
      },
    ],
  },

  {
    id: "your-own-data",
    title: "Using your own export",
    blurb: "What to export, mapping the columns, and what it refuses to guess.",
    blocks: [
      {
        kind: "p",
        text:
          "Export paid or approved invoices from whatever you already run. Sage, Xero, QuickBooks, NetSuite and SAP all produce something close enough. The column names do not matter.",
      },
      {kind: "h", text: "What the file needs"},
      {
        kind: "table",
        head: ["Column", "Needed", "Notes"],
        rows: [
          ["Supplier", "Required", "The name as your system holds it, including the duplicate spellings — those are what one of the checks is looking for."],
          ["Invoice number", "Required", "Whatever identifies the document."],
          ["Invoice date", "Required", "Any common format. See below."],
          ["Amount", "Required", "Credits negative or in brackets. Symbols, thousands separators and CR/DR suffixes are all understood."],
          ["Currency", "Optional", "Assumed GBP if the file has neither a currency column nor symbols in the amounts."],
          ["Reference or PO", "Optional", "Shown as evidence. No rule matches on it."],
          ["Bank account", "Optional", "Last four digits are enough. Without it the bank-detail check cannot run — and that is the one that catches redirection fraud, so it is worth going back for."],
        ],
      },
      {kind: "h", text: "How long a period"},
      {
        kind: "p",
        text:
          "Twelve months. Shorter and the schedule guard cannot tell a contract from a duplicate, so you will get false positives on your own standing payments. It also needs enough history to know what a supplier's normal invoice looks like before it can call one unusual.",
      },
      {kind: "h", text: "Confirming the columns"},
      {
        kind: "steps",
        items: [
          "Upload the file. Nothing is analysed yet.",
          "Countercheck scores every header and proposes a mapping, with the reason it chose each column written next to it. A confidence below 60 percent is highlighted, and if a second column came close it says so and names it.",
          "Change anything that looks wrong. A mis-read amount column produces confident nonsense and nothing downstream can tell.",
          "Look at the first rows shown underneath, as your file actually has them. Then look at the list of rows it could not read.",
          "Press Check these payments.",
        ],
      },
      {
        kind: "note",
        title: "Dates it will not guess",
        text:
          "03/04/2026 is the third of April or the fourth of March depending on who exported it, and no amount of cleverness can tell from the value alone. Countercheck asks you which, once, rather than picking. An import silently shifted by months is the kind of error that survives all the way to a board pack.",
      },
      {kind: "h", text: "Rows it skips"},
      {
        kind: "p",
        text:
          "Rows with an unreadable date, a blank amount, a missing supplier, or a different number of values than the header are left out and counted. The count appears in the ledger's name so you can reconcile it against your own system. Nothing is silently dropped, and nothing is guessed to keep a row alive.",
      },
      {
        kind: "p",
        text:
          "Columns no rule looks at — VAT, department, nominal code — are listed as unused rather than ignored quietly.",
      },
    ],
  },

  {
    id: "limits",
    title: "What it will get wrong",
    blurb: "The honest limits, so you can plan around them.",
    blocks: [
      {
        kind: "p",
        text:
          "A tool that reports on your payments has to be straight about its own failure modes, because you are going to meet them.",
      },
      {
        kind: "list",
        items: [
          "It only sees what is in the file. A duplicate paid in a period you did not export is invisible. So is a credit applied outside the range.",
          "It cannot tell two companies with similar names apart. Bank details usually settle it; you settle it, not the software.",
          "It reads $ as US dollars. It is also Canadian, Australian and New Zealand dollars. A currency column removes the ambiguity.",
          "Two-digit years use the standard cutoff at 70. 69 is 2069 and 70 is 1970. If your export uses them, fix the export.",
          "It does not know your approval rules, your purchase orders, or your contracts. It is looking at the shape of the numbers, not at whether you should have bought the thing.",
          "It will produce false positives. Every one of them costs a person a few minutes and costs a supplier relationship nothing, which is the right side of that trade — but it is a real cost and it is yours.",
        ],
      },
      {kind: "h", text: "The one to take seriously"},
      {
        kind: "p",
        text:
          "A confirmed finding is not proof. It is evidence worth acting on. Before anyone tells a supplier they have been double-billing, pull the two source documents and look at them. Countercheck is looking at a ledger export; the documents are the truth.",
      },
    ],
  },

  {
    id: "data",
    title: "Where your data lives",
    blurb: "Storage, network, retention, and how to delete everything.",
    blocks: [
      {
        kind: "p",
        text:
          "Countercheck keeps ledgers, decisions and audit trails in a Postgres database. Everything the application itself stores lives in four tables in a schema called countercheck; sign-in is a separate library and owns four more.",
      },
      {
        kind: "table",
        head: ["Table", "What is in it"],
        rows: [
          ["ledgers", "The demo ledger, and any export you have imported: the parsed rows and the findings over them."],
          ["decisions", "One row per decided finding, with the address of the person who decided it. Reopening deletes the row."],
          ["audit", "Every decision and every reopening, in order. Nothing in the codebase updates or deletes from this table."],
          ["pending_uploads", "A CSV waiting for you to confirm its columns. Deleted when you confirm, and swept after six hours if you never do."],
        ],
      },
      {kind: "h", text: "The network"},
      {
        kind: "p",
        text:
          "Two outbound destinations, and no others: the database, and the email provider that sends your sign-in link. Fonts are bundled at build time rather than fetched. Nothing is sent to an analytics service, an error tracker or a model provider, because none of those are wired in.",
      },
      {kind: "h", text: "Deleting everything"},
      {
        kind: "p",
        text:
          "There is no button for this, and that is a gap rather than a policy. Resetting the demo clears the demo ledger and nothing else. An export you have imported stays until someone with database access removes it, which on the hosted version is us and not you.",
      },
      {
        kind: "note",
        title: "What this page used to say",
        text:
          "Until the storage moved, this chapter said the data was ordinary files in a .data folder, that the application made no outbound requests, and that deleting the folder was the whole retention story. All three had stopped being true and the chapter had not been rewritten. A statement about where someone's finance data goes is not documentation that can be left to catch up later.",
      },
    ],
  },

  {
    id: "reference",
    title: "Reference",
    blurb: "Keyboard shortcuts, thresholds, and where things are.",
    blocks: [
      {kind: "h", text: "This manual"},
      {
        kind: "keys",
        rows: [
          ["?", "Open the manual from anywhere"],
          ["Esc", "Close it"],
          ["Drag the title bar", "Move it out of your way"],
          ["Drag the bottom-right corner", "Resize it"],
          ["Double-click the title bar", "Snap back to the middle at full size"],
        ],
      },
      {
        kind: "p",
        text:
          "Where you leave it is where it reopens.",
      },
      {kind: "h", text: "Thresholds"},
      {
        kind: "table",
        head: ["Setting", "Value", "What it protects against"],
        rows: [
          ["Re-key window", "21 days", "Two genuinely separate invoices for the same amount, further apart than a mis-filed one would be."],
          ["Minimum amount", "£50", "Noise. Below this, checking costs more attention than the money is worth."],
          ["Round-number floor", "£5,000", "Every small round invoice in the ledger."],
          ["Supplier name similarity", "0.86", "Two real companies with similar names being merged into one."],
        ],
      },
      {kind: "h", text: "In the repository"},
      {
        kind: "table",
        head: ["File", "What it holds"],
        rows: [
          ["src/detection/rules.ts", "The seven checks."],
          ["src/detection/match.ts", "Name matching, transposition, and the regular-schedule guard."],
          ["src/import/csv.ts", "The parser, the column scorer, and the date and amount coercion."],
          ["src/demo/generate.ts", "The demo ledger, and the problems planted in it."],
          ["lib/store.ts", "Every read and write. The seam a database goes through."],
          ["app/help/content.ts", "This manual."],
        ],
      },
    ],
  },
];

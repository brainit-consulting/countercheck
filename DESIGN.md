# Countercheck — visual language

**Status:** v1, 2026-08-07
**Implements:** `app/brand.css`
**Audience for this document:** anyone — human or agent — building a screen in this app.

Read the whole of §1 and §2 before you build anything. After that you can work
from the reference tables. Where this document gives a number, use that number.
Where it says *never*, there is no screen on which it becomes acceptable.

---

## 1. The direction

### 1.1 What we are actually asking of the reader

A finance lead uploads their accounts-payable export. Countercheck reads it and
tells them that some of their payments look wrong. It cannot fix anything — it
has no write access to any system, by design. All it can do is present evidence
and ask a person to judge it.

That means every screen is doing one job: **making a sceptical, busy person
believe a number well enough to act on it.** They are being told their team made
mistakes, or that a supplier may have been paid twice, or that money moved to a
bank account nobody verified. If the interface looks like it wants something from
them, they will discount the finding and close the tab.

So the design target is **an audit working paper, not a product dashboard.**

The reference points are a bank statement, a reconciliation printout, a set of
year-end working papers, the notes to a set of accounts. Things that look the
same whether they carry good news or bad. Things whose credibility comes from
being legible, complete and boring.

### 1.2 The three commitments

Everything below follows from these. When a decision is not covered by this
document, decide it by asking which option better serves these three.

**1. The number is the interface.** Amounts, dates, invoice numbers and account
digits are the content. Everything else — headings, labels, chrome, the accent
colour — exists to frame them and must give way to them. If a design choice
makes a figure harder to read, compare or copy, it is the wrong choice.

**2. Nothing is decorative.** Every rule, tint, weight and colour on the screen
must be carrying information. A hairline separates two things that are genuinely
separate. A tint marks a cell that genuinely matched. If you cannot say what a
visual element means, delete it.

**3. The tool never has an opinion about the person.** Countercheck reports what
the rows say. It does not congratulate, warn, alarm, reassure or celebrate. A
finding is not an accusation and a rejection is not a failure. The interface
stays at the same emotional temperature throughout, which is: none.

### 1.3 Relationship to BrainIT Consulting

Countercheck is a sibling of BrainIT, not a re-skin of it. The tie is
**typographic**; the palette is Countercheck's own.

| | BrainIT | Countercheck | Why |
|---|---|---|---|
| Display | Fraunces, default axes | Fraunces, locked to `WONK 0, SOFT 0` | Same face, sober settings. Fraunces' wonk is charm; charm is the wrong register when you are telling someone their payments are wrong. Flattened, it reads as a plain transitional serif and still says *document*. |
| Body | Outfit | **IBM Plex Sans** | Outfit is a geometric display sans. At 15px in a dense table its figures are loose and its counters close up. Plex Sans is a text and UI face with proper tabular figures and squared terminals that sit correctly next to a flattened Fraunces. This is a functional replacement, not a taste one. |
| Figures & labels | DM Mono | DM Mono, **promoted** | In BrainIT, DM Mono does labels. In Countercheck it does *every number in the product*. It is the load-bearing face here, not the accent. |
| Ground | Ivory `#fbf8f1` | Cool bond `#F4F5F2` | Warm ivory is BrainIT's. Countercheck's paper is a neutral-cool stock — closer to a statement than to a brochure. |
| Hero colour | Forest green `#0f4f40` | Ledger blue `#1C3F5C` | Green is demoted, deliberately. In Countercheck it is no longer the brand colour; it is the *signed-off* mark (§3.5). Same family, different job. |
| Accents | Rust, amber | Iron-oxide red, dark ochre — as **severity**, never as decoration | BrainIT can use rust because it likes it. Countercheck may only use red because something is high severity. |

---

## 2. The non-negotiables

An agent building a screen can check its work against this list. Every item is
expanded later in the document.

1. Every figure uses `font-variant-numeric: tabular-nums`. No exceptions, including
   figures inside sentences.
2. Money is right-aligned, always two decimal places, never abbreviated, never
   rounded, never truncated.
3. Severity is carried by **four** signals. Colour is the fourth and weakest. See §7.
4. All body text meets WCAG 2.1 AA (4.5:1). All meaning-bearing non-text meets
   3:1. The verified figures are in §4 — do not introduce a colour that is not
   in the table without re-running the arithmetic.
5. `:focus-visible` is never removed and never restyled to something weaker than
   `2px solid var(--focus-ring)` with `2px` offset.
6. No colour is ever the only way to tell two states apart.
7. Nothing below 12px. No figure below 15px.
8. No gradients, no shadows for structure, no border-radius above 3px, no icon
   fonts, no external assets, no emoji. See §12 for the full list and reasoning.
9. Accept and Reject are visually equal weight. Neither is a primary button.
10. Dates in data are always `YYYY-MM-DD`. Never relative ("3 days ago").

---

## 3. Colour

Two surfaces, one ink ramp, one accent, a three-step severity ramp, and three
review states. That is the whole palette. There is no secondary accent and no
tertiary brand colour; if a screen seems to need one, it needs better hierarchy
instead.

### 3.1 Surfaces

| Token | Light | Dark | Means |
|---|---|---|---|
| `--paper` | `#F4F5F2` | `#101417` | The page. The desk the documents sit on. |
| `--sheet` | `#FFFFFF` | `#171C20` | A document. Findings, panels, tables sit on a sheet. Figures read crispest here, which is why the review queue lives on sheets and not on paper. |
| `--evidence-row-bg` | `#EFF1EC` | `#1D2429` | A row that came out of the customer's own export. This tint means *this is your data, not ours* and is used nowhere else. |
| `--evidence-cell-match-bg` | `#F0D385` | `#3B3720` | A cell that actually triggered the rule. A highlighter mark on a printout. Never applied to a whole row — only to the specific cells the rule compared. |

The step between `--paper` and `--sheet` is deliberately tiny (1.09:1). It is a
change of stock, not a change of level. Depth in this app is expressed by
hairlines and alignment, never by shadow.

### 3.2 Ink

| Token | Light | Dark | Used for |
|---|---|---|---|
| `--ink` | `#14181B` | `#E7EAE8` | All figures. All body text. Finding explanations. Anything the reader must actually read. |
| `--ink-muted` | `#4E555A` | `#A6AFB4` | Supporting text: supplier addresses, row counts, timestamps, the second line of a two-line cell. |
| `--ink-faint` | `#676E74` | `#8B959B` | Micro-labels and table column headers only. Never a whole sentence. |
| `--ink-disabled` | `#7E848A` | `#6C767C` | Disabled control labels. Nothing else. |

Note the ordering rule: **a figure is never `--ink-muted`.** If a number matters
little enough to be greyed out, it should not be on the screen. The only greyed
figures in the product are inside a rejected finding's collapsed record, where
the whole record is muted together.

### 3.3 Accent

| Token | Light | Dark | Used for |
|---|---|---|---|
| `--accent` | `#1C3F5C` | `#93B9D8` | Links, the active nav item, the determinate progress rule, the filled `Run detection` / `Export evidence pack` buttons. |
| `--accent-contrast` | `#FFFFFF` | `#171C20` | Label on a filled accent surface. |
| `--focus-ring` | `#0F5C8C` | `#A8C9E4` | Focus only. Never a decorative colour. |

Ledger blue is a quiet accent on purpose. It should be almost unnoticeable in a
screenshot of the review queue — the severity ramp needs the colour budget.

### 3.4 Severity

Three levels, matching `Severity = "high" | "medium" | "low"` in `src/types.ts`.

| Token | Light | Dark | Means, in the reader's terms |
|---|---|---|---|
| `--severity-high` | `#9E2B21` | `#F0958A` | Money is probably already out of the door, or is about to be. Exact duplicates, re-keyed duplicates, one company under two supplier records, a changed bank account. Act this week. |
| `--severity-medium` | `#8A5A0B` | `#E2A63F` | Something is wrong but the loss is recoverable or unconfirmed. Transposed amounts, credit notes nobody applied. Act this month. |
| `--severity-low` | `#4C6879` | `#7E9EB4` | Not evidence of an error — evidence of something worth a question. Round-number outliers. Look when you have time. |

Each severity also carries a tint for chips and a bar width:

| Token | Light | Dark |
|---|---|---|
| `--severity-high-bg` | `#FAEAE7` | `#2E1D1B` |
| `--severity-medium-bg` | `#F8EFDC` | `#2C2416` |
| `--severity-low-bg` | `#E9EFF3` | `#1B2830` |

The three hues are red / ochre / slate-blue. They are **not** a traffic light:
there is no green in the severity ramp, because in this product green does not
mean "fine" (§3.5).

### 3.5 Review states — and why they are not red and green

This is the single most important colour decision in the product, and it is
counter-intuitive, so it is spelled out.

In the review queue a person **accepts** or **rejects** each finding.

- *Accepted* means "yes, this is a real problem." That is **bad news.** Real money
  was lost.
- *Rejected* means "no, this one is fine." That is **good news** — and it also
  means Countercheck was wrong.

A red/green success/failure mapping would therefore be exactly backwards, and
worse, it would put a value judgement on the reviewer's decision. It would also
quietly pressure them toward whichever one looks positive.

So the states are **equal in weight and non-evaluative**:

| Token | Light | Dark | Means |
|---|---|---|---|
| `--state-open` | `#4E555A` | `#A6AFB4` | Not yet reviewed. Deliberately identical to `--ink-muted` — an open finding is not a state, it is the absence of one. |
| `--state-accepted` | `#1E5B41` | `#6DC49B` | Signed off. The green here is an auditor's tick — *checked, recorded, agreed* — not *good*. |
| `--state-rejected` | `#5C6367` | `#98A1A6` | Set aside, with a reason. Grey, because a rejected finding is not a negative outcome, it is simply out of the queue. |

| Token | Light | Dark |
|---|---|---|
| `--state-open-bg` | `#EFF1EC` | `#1D2429` |
| `--state-accepted-bg` | `#E4EFE8` | `#16281F` |
| `--state-rejected-bg` | `#EDEEEC` | `#20262A` |

Copy follows the same logic. Never "Great — no problems found!" and never
"⚠ Problem confirmed". The accept control reads **"Accept — this is a real
problem"**; the reject control reads **"Reject — this one is fine"**. The verbs
are the reviewer's, not the tool's.

### 3.6 Figures

| Token | Light | Dark | Means |
|---|---|---|---|
| `--figure-ink` | `#14181B` | `#E7EAE8` | A normal payable. |
| `--figure-credit` | `#0F5C55` | `#5FC2B4` | A credit note, or any negative amount. Teal, deliberately distinct from `--state-accepted` green so "money coming back" and "signed off" never read as the same thing. |

Colour is the *secondary* signal on a credit. The primary signal is accounting
parentheses — see §6.4.

---

## 4. Contrast — verified, not assumed

Targets: **WCAG 2.1 AA, 4.5:1 for all text** (we do not use the large-text 3:1
exemption anywhere, because on the screens that matter the text is small and
numeric); **3:1 for meaning-bearing non-text** (SC 1.4.11); **3:1 house floor for
disabled text**, which the standard exempts but which we hold anyway.

Every pair below was computed from the WCAG relative-luminance formula against
every surface the colour can actually land on — `--paper`, `--sheet` and
`--evidence-row-bg`. 118 pairs were checked; all pass. The tables give the worst
case for each token.

### 4.1 Light theme — worst case per token

| Foreground | Worst-case background | Ratio | Target | Result |
|---|---|---|---|---|
| `--ink` `#14181B` | `--evidence-row-bg` `#EFF1EC` | **15.70:1** | 4.5 | AAA |
| `--ink-muted` `#4E555A` | `--evidence-row-bg` | **6.66:1** | 4.5 | AA |
| `--ink-faint` `#676E74` | `--evidence-row-bg` | **4.55:1** | 4.5 | AA |
| `--accent` `#1C3F5C` | `--evidence-row-bg` | **9.64:1** | 4.5 | AAA |
| `--severity-high` `#9E2B21` | own chip `#FAEAE7` | **6.38:1** | 4.5 | AA |
| `--severity-medium` `#8A5A0B` | own chip `#F8EFDC` | **5.18:1** | 4.5 | AA |
| `--severity-low` `#4C6879` | own chip `#E9EFF3` | **5.08:1** | 4.5 | AA |
| `--state-accepted` `#1E5B41` | own chip `#E4EFE8` | **6.78:1** | 4.5 | AA |
| `--state-rejected` `#5C6367` | own chip `#EDEEEC` | **5.25:1** | 4.5 | AA |
| `--state-open` `#4E555A` | own chip `#EFF1EC` | **6.66:1** | 4.5 | AA |
| `--figure-credit` `#0F5C55` | `--evidence-row-bg` | **6.88:1** | 4.5 | AA |
| `--ink` on `--evidence-cell-match-bg` `#F0D385` | — | **12.21:1** | 4.5 | AAA |
| `--ink-muted` on `--evidence-cell-match-bg` | — | **5.18:1** | 4.5 | AA |
| `--accent-contrast` on `--accent` fill | — | **10.97:1** | 4.5 | AAA |
| `--sheet` on `--ink` fill | — | **17.85:1** | 4.5 | AAA |
| `--line-strong` `#7C837D` (non-text) | `--evidence-row-bg` | **3.42:1** | 3.0 | pass |
| `--focus-ring` `#0F5C8C` (non-text) | `--evidence-row-bg` | **6.30:1** | 3.0 | pass |
| severity bars (non-text), worst | `--evidence-row-bg` | **5.18:1** | 3.0 | pass |
| `--ink-disabled` `#7E848A` | `--evidence-row-bg` | **3.32:1** | 3.0 | pass |

### 4.2 Dark theme — worst case per token

| Foreground | Worst-case background | Ratio | Target | Result |
|---|---|---|---|---|
| `--ink` `#E7EAE8` | `--evidence-row-bg` `#1D2429` | **12.97:1** | 4.5 | AAA |
| `--ink-muted` `#A6AFB4` | `--evidence-row-bg` | **7.04:1** | 4.5 | AAA |
| `--ink-faint` `#8B959B` | `--evidence-row-bg` | **5.14:1** | 4.5 | AA |
| `--accent` `#93B9D8` | `--evidence-row-bg` | **7.61:1** | 4.5 | AAA |
| `--severity-high` `#F0958A` | `--evidence-row-bg` | **7.01:1** | 4.5 | AAA |
| `--severity-medium` `#E2A63F` | own chip `#2C2416` | **7.12:1** | 4.5 | AAA |
| `--severity-low` `#7E9EB4` | own chip `#1B2830` | **5.34:1** | 4.5 | AA |
| `--state-accepted` `#6DC49B` | own chip `#16281F` | **7.38:1** | 4.5 | AAA |
| `--state-rejected` `#98A1A6` | own chip `#20262A` | **5.82:1** | 4.5 | AA |
| `--state-open` `#A6AFB4` | `--evidence-row-bg` | **7.04:1** | 4.5 | AAA |
| `--figure-credit` `#5FC2B4` | `--evidence-row-bg` | **7.38:1** | 4.5 | AAA |
| `--ink` on `--evidence-cell-match-bg` `#3B3720` | — | **9.89:1** | 4.5 | AAA |
| `--ink-muted` on `--evidence-cell-match-bg` | — | **5.37:1** | 4.5 | AA |
| `--accent-contrast` on `--accent` fill | — | **8.31:1** | 4.5 | AAA |
| `--line-strong` `#6E7A80` (non-text) | `--evidence-row-bg` | **3.56:1** | 3.0 | pass |
| `--focus-ring` `#A8C9E4` (non-text) | `--evidence-row-bg` | **9.08:1** | 3.0 | pass |
| severity bars (non-text), worst | `--evidence-row-bg` | **5.56:1** | 3.0 | pass |
| `--ink-disabled` `#6C767C` | `--evidence-row-bg` | **3.38:1** | 3.0 | pass |

### 4.3 The two hairlines, and an honest caveat

There are deliberately **two** rule colours, and the distinction is a rule you
must follow, not a preference:

| Token | Light | Dark | Contrast vs surfaces | Permitted use |
|---|---|---|---|---|
| `--line` | `#C7CCC5` | `#3A444A` | 1.43–1.86:1 | **Decorative only.** Row separators inside an evidence table, where the row structure is already carried by alignment, spacing and the data itself. If this line vanished, nothing would become ambiguous. |
| `--line-strong` | `#7C837D` | `#6E7A80` | 3.42–4.19:1 | **Anything meaning-bearing.** Input and select borders, the outline of Accept/Reject, the underline beneath a table header, the double rule above a total, the boundary of a finding block, the empty stems in a severity rank glyph. |

`--line` does not meet 3:1 and is not intended to. The rule is therefore
absolute: **if losing a line would lose information, it must be `--line-strong`.**
If you are unsure which one a border is, it is `--line-strong`.

### 4.4 What the arithmetic does *not* solve

Measured relative luminance of the severity ramp:

| | Light | Dark |
|---|---|---|
| high | L = 0.0911 | L = 0.4186 |
| medium | L = 0.1274 | L = 0.4380 |
| low | L = 0.1282 | L = 0.3218 |

In the light theme, `medium` and `low` are separated by hue but sit at
essentially identical luminance (0.1274 vs 0.1282) — in greyscale they are the
same colour. In the dark theme, `low` separates cleanly but `high` and `medium`
do not.

This was not fixed by shifting the palette, because it is not fixable: red
against amber is the classic deuteranopia/protanopia collision, and any ramp that
solves it in one theme reintroduces it in the other or costs contrast elsewhere.
Chasing greyscale separation would have pushed `--severity-low` to a 4.50:1
margin against its own chip, which is a worse trade.

The correct fix is not a better hue. It is §7: **colour is the fourth signal.**

---

## 5. Typography

### 5.1 Families

Three faces, three jobs, no overlap.

```
--font-display : Fraunces      — headings ≥ 19px only, and the wordmark
--font-body    : IBM Plex Sans — everything that is a sentence, plus all UI chrome
--font-mono    : DM Mono       — every number, every identifier, every micro-label
```

**Loading.** Fonts are loaded through `next/font/google`, which downloads and
self-hosts them at build time. There is no runtime CDN request, no `@font-face`
in `brand.css`, and no external asset of any kind.

The app's root layout is expected to publish exactly three CSS variables, which
`brand.css` consumes:

```ts
Fraunces      → variable: "--font-fraunces"   axes: opsz, SOFT, WONK
IBM_Plex_Sans → variable: "--font-plex-sans"  weights: 400, 500, 600
DM_Mono       → variable: "--font-dm-mono"    weights: 400, 500
```

`brand.css` wraps each one in a `var()` fallback, so if the loader is not wired
up yet the stacks degrade to Georgia / system sans / system mono rather than
collapsing. That fallback is load-bearing, not defensive politeness: an
undefined custom property inside a font stack invalidates the whole declaration.

**Fraunces axis lock.** Fraunces is variable. It is used at
`font-variation-settings: "SOFT" 0, "WONK" 0` and optical size matched to the
rendered size. Never ship default-axis Fraunces — the wonk is BrainIT's voice,
not this product's. This is applied for you by `--font-display-settings`.

**Where each face is used, exhaustively:**

| Face | Yes | No |
|---|---|---|
| Fraunces | Page title, section headings, the total-exposure figure on the summary, the wordmark | Anything under 19px. Any table content. Any button. Any body copy. |
| IBM Plex Sans | Finding explanations, help text, button labels, supplier names, form labels, nav | Numbers. Invoice numbers. Dates. Column headers. |
| DM Mono | Amounts, dates, invoice numbers, reference codes, bank digits, row counts, rule identifiers, column headers, chip labels, percentages | Sentences. Anything longer than about four words. |

The last one is the important one: **a supplier name is prose, an invoice number
is a figure.** In a single evidence row, `Redwood Facilities Ltd` is Plex Sans
and `INV-2026-04417` is DM Mono, sitting side by side. That contrast is what
makes a table scannable.

### 5.2 Scale

Root is `106.25%` of the browser default — **17px at default settings**, set as a
percentage so a reader who has enlarged their browser font still gets it scaled.
This is deliberately larger than the 14–16px SaaS norm: the audience is finance
leadership, which skews older, and the content is dense numerics.

All sizes are `rem`, so all of them scale with the reader's browser setting.

| Token | Computed | Face | Exactly where it is used |
|---|---|---|---|
| `--text-3xs` | 12px | mono | The currency-code slot beside a figure. Footnote markers. **Nothing else — this is the floor.** |
| `--text-2xs` | 13px | mono | Severity and state chip labels. Evidence-table column headers. The rule identifier above a finding title. |
| `--text-xs` | 15px | mono / body | Evidence-table cell content, including all figures in a table. Secondary meta lines. **The smallest a number is ever allowed to be.** |
| `--text-base` | 17px | body | Finding explanations. All body copy. Button labels. Form inputs. |
| `--text-md` | 19px | mono / display | A finding's amount-at-stake. A finding's title. Sub-headings. |
| `--text-lg` | 23px | mono / display | Section headings. Column and grand totals. |
| `--text-xl` | 29px | display | Page title. |
| `--text-2xl` | 36px | display / mono | The headline figure in a run summary ("total exposure found"). |
| `--text-3xl` | 46px | mono | Reserved for a single figure on a screen that has one job. Do not use twice on a page. |

Nothing below 12px exists. No figure below 15px exists.

### 5.3 Line height, weight, tracking

| Token | Value | Where |
|---|---|---|
| `--leading-tight` | 1.15 | Figures at `--text-lg` and above, page titles |
| `--leading-snug` | 1.3 | Headings, table cells, chips |
| `--leading-normal` | 1.55 | Finding explanations, all body copy |
| `--leading-relaxed` | 1.7 | Long-form help and policy pages |

Weights: display `400` / `600`; body `400` / `500`; mono `400` / `500`. **Nothing
above 600 anywhere.** Bold is not a hierarchy tool in this product — size,
position and rules are. A matched figure uses mono `500`; everything else in a
table is `400`.

Tracking: `0` on everything **except** the uppercase mono micro-labels, which get
`--tracking-caps: 0.08em`. Uppercase is permitted only for labels of three words
or fewer (`HIGH`, `RE-KEYED DUPLICATE`, `INVOICE NO.`). Never a sentence.

Italics: not used in data, ever. Permitted only in a footnote.

Measure: prose is capped at `--measure-prose: 68ch`. A finding explanation must
never run the full width of a wide table.

---

## 6. Numbers

This is the section that matters most. Get everything else wrong and the product
is ugly; get this wrong and the product is not credible.

### 6.1 Every figure, without exception

```css
font-family: var(--font-mono);
font-variant-numeric: tabular-nums lining-nums;
```

`tabular-nums` is not optional and not situational. It applies to figures inside
running sentences too — when a finding explanation says the supplier was billed
`1,890.00` twice, that figure is a `<span class="cc-fig">`, in mono, tabular,
sitting inside Plex Sans prose. It looks like a quotation from the ledger,
because it is one.

Identifiers — invoice numbers, references, bank digits — additionally get
`slashed-zero`, so `0` and `O` cannot be confused when someone reads a number
down the phone to a supplier. Request it; do not depend on the face supporting
it, because the mono column is the real guarantee.

### 6.2 Alignment

| Column type | Alignment | Why |
|---|---|---|
| Money | **right** | Decimal points and digit places stack. This is the only way a column of amounts can be compared by eye. |
| Dates (`YYYY-MM-DD`) | **left** | Fixed width, so left-aligned already stacks; left keeps them adjacent to the supplier they belong to. |
| Invoice numbers, references | **left** | Read as words, scanned from the start. |
| Bank digits | **right** | They are digits and they are compared. |
| Supplier names, all prose | **left** | |
| Counts (row counts, "3 of 7") | **right** | |

Money column headers are right-aligned to match their column. Every other header
matches its column too. A header that is aligned differently from its data is a
bug.

### 6.3 Formatting

Formatting is done with `Intl.NumberFormat`, never by hand:

```js
new Intl.NumberFormat(orgLocale, {
  style: 'decimal',            // NOT 'currency' — see below
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})
```

- **Always two decimal places.** `1,890.00`, never `1,890`. Pennies never
  disappear; a duplicate of £1,890.00 and one of £1,890.40 are different facts.
- **Never abbreviated.** No `1.2k`, no `£1.2M`, no `~`. Not in tiles, not in
  charts, not in the headline figure. A CFO reading `£1.2M` cannot reconcile it
  to anything.
- **Never rounded** for display, ever.
- **The currency code is a separate element**, `--text-3xs` mono in
  `--ink-faint`, in a fixed `4ch` slot immediately left of the figure — not glued
  to the digits and not a symbol. Two reasons: real AP exports contain mixed
  currencies, and a variable-width symbol breaks the digit column. So it is
  `GBP  1,890.00`, not `£1,890.00`.
- **Currency comes from the row.** `Invoice.currency` is on every row in
  `src/types.ts`. Never assume a default, never infer one from the org, never
  hard-code a symbol.

### 6.4 Credits and negatives

Accounting parentheses, not a minus sign:

```
       GBP    1,890.00
       GBP   (   240.00)      ← credit note
```

- Parentheses are the **primary** signal; `--figure-credit` teal is the secondary.
  A monochrome printout still reads correctly.
- Positive figures reserve the closing-parenthesis column so the decimal points
  still line up. `brand.css` does this with a hidden `)` via `::after` on
  `.cc-money--positive`; do not solve it with a different padding value per cell.
- `0.00` is a real value and is shown as `0.00`.
- A value the **export did not contain** is an em dash `—` in `--ink-faint`, and
  wherever that appears the screen must also say which column was not mapped.
  An empty cell and a zero are different facts and must never look the same.

### 6.5 Dates

`YYYY-MM-DD`, DM Mono, always. `2026-03-14`.

Unambiguous between UK and US readers, sorts correctly, fixed width. Prose may
write "14 March 2026". **Relative dates are banned in data** — "3 days ago" is
useless in an audit trail and becomes wrong the moment the page is printed. The
one permitted relative expression is in a finding's explanation, where the *gap*
between two rows is the finding: "billed twice within 6 days".

### 6.6 Totals

A total is separated from its column by an accounting **double rule**
(`--rule-total`: `3px double var(--line-strong)`) above it, `--text-lg`, mono,
weight `500`. The double rule is the convention every reader of a set of accounts
already knows, and it costs nothing.

A grand total gets the double rule plus `--space-3` of clearance above it.

---

## 7. Severity is never carried by colour alone

Four independent signals. An agent adding a new severity presentation must
implement all four.

**1. The word.** Every severity chip contains the literal text `HIGH`, `MEDIUM`
or `LOW`. Not a dot, not an icon, not a colour swatch on its own. The word is
real text so it is available to screen readers, to search, and to a reader who
has printed the page in greyscale.

**2. The rank glyph.** Three vertical stems, `3px × 11px`, `2px` apart, filled
from the left: `▮▮▮` high, `▮▮▯` medium, `▮▯▯` low. Filled stems take the
severity colour; empty stems take `--line-strong`. Drawn in CSS from the
`.cc-rank` class — no icon font, no SVG, no image. The *count* is the signal.

**3. The bar width.** The left border of a finding block:

| | Token | Width |
|---|---|---|
| high | `--severity-bar-w-high` | `5px` |
| medium | `--severity-bar-w-medium` | `3px` |
| low | `--severity-bar-w-low` | `2px` |

In a sorted queue these are directly comparable down the left edge, and the
difference survives greyscale, low vision and a bad projector.

**4. Position.** The queue is sorted by severity, then by `amountAtStake`
descending. Severity is therefore also *where the finding is on the page*. Never
offer a sort that breaks this without a persistent label saying the queue is
re-sorted.

Colour is the fourth signal and is never introduced without the other three.

The same rule governs review state: an accepted finding shows the word
`ACCEPTED`, a collapsed layout, and the reviewer's name and timestamp. A rejected
finding shows the word `REJECTED`, the same collapsed layout, muted ink, and its
amount struck through with `text-decoration: line-through`. State is legible with
the stylesheet's colours removed.

---

## 8. Space, structure, motion

### 8.1 Spacing

The spacing scale is in **pixels, not rem**, and does not scale with the type
size. This is deliberate: hairlines, column edges and table gridlines must land
on whole device pixels, and a data table that reflows its gutters when the reader
bumps their font size loses its alignment.

| Token | Value | Exactly where |
|---|---|---|
| `--space-1` | `4px` | Gap between the currency slot and a figure. Gap between a chip's rank glyph and its word. (The gap *between* rank stems is `--rank-gap: 2px`, not part of this scale.) |
| `--space-2` | `8px` | Chip padding. Gap between a micro-label and its value. Gap between two chips. |
| `--space-3` | `12px` | **Between a finding's title row and its explanation.** Vertical padding inside an evidence-table cell. Clearance above a grand total. |
| `--space-4` | `16px` | **Between a finding's explanation and its evidence table.** Horizontal padding inside an evidence-table cell. |
| `--space-5` | `24px` | Padding inside a finding block, all four sides. Gap between the evidence table and the decision bar. |
| `--space-6` | `32px` | Gap between one finding and the next in the queue. |
| `--space-7` | `48px` | Between a section heading and the section that follows it. |
| `--space-8` | `64px` | Page top gutter. Between major page regions. |
| `--space-9` | `96px` | Around the upload dropzone on an otherwise empty page. Above the footer. |

Fixed dimensions:

| Token | Value | What |
|---|---|---|
| `--row-h` | `44px` | Evidence-table body row. Comfortable for a mouse, adequate as a touch target, tall enough that two-line supplier names do not feel cramped. |
| `--row-h-head` | `32px` | Evidence-table header row. |
| `--control-h` | `40px` | Buttons, inputs, selects. |
| `--control-h-sm` | `32px` | Filter controls, table-level toggles. |
| `--page-max` | `1180px` | Content column. |
| `--measure-prose` | `68ch` | Any paragraph. |
| `--rail-w` | `248px` | The filter rail, which appears only at ≥ `1100px`. |

### 8.2 Radius, rules, elevation

| Token | Value | Use |
|---|---|---|
| `--radius-xs` | `2px` | Chips, buttons, inputs. |
| `--radius-sm` | `3px` | Finding blocks, panels, tables. |

That is the entire radius scale. There is no `--radius-full`, there are no pills,
and nothing in this product is a rounded rectangle with a 12px corner. Documents
have square corners.

| Token | Value | Use |
|---|---|---|
| `--rule-hair` | `1px solid var(--line)` | Decorative separation only (§4.3). |
| `--rule` | `1px solid var(--line-strong)` | Meaning-bearing boundaries. |
| `--rule-total` | `3px double var(--line-strong)` | Above a total, and only there. |

**Elevation.** Structure is never expressed with shadow. There is exactly one
shadow token, `--shadow-overlay`, and it is permitted on exactly two things: a
modal dialog and a dropdown/popover — objects that genuinely float above the
page and need to be separated from what they cover. A finding block, a table, a
panel or a summary tile with a shadow on it is a bug.

### 8.3 Motion

| Token | Value |
|---|---|
| `--dur-fast` | `90ms` — hover, focus, chip state |
| `--dur-base` | `140ms` — a finding collapsing after a decision, disclosure toggles |
| `--dur-slow` | `220ms` — overlay entry only |
| `--ease` | `cubic-bezier(.2, 0, 0, 1)` |

Only `opacity` and `transform` are animated. Data never animates in: a table of
figures appears, it does not fade, slide, stagger or count up. There are no
skeleton shimmers — a loading table shows a static line of text stating what is
happening and how far through it is.

`prefers-reduced-motion: reduce` collapses every duration to `1ms` and disables
the progress sweep. `brand.css` does this for you; do not write a transition that
bypasses the tokens.

---

## 9. How a finding is presented

A finding is the atomic unit of this product. Everything else on the review
screen is packaging.

### 9.1 Anatomy

```
┌─────────────────────────────────────────────────────────────────────────┐
│▌ ▮▮▮ HIGH   RE-KEYED DUPLICATE                        GBP    1,890.00   │  ← header row
│▌                                                                        │     space-3
│▌ Redwood Facilities Ltd was billed 1,890.00 twice within 6 days under   │  ← explanation
│▌ different invoice numbers (INV-2026-04417 and 4417A). This is the      │     max 68ch
│▌ pattern of an invoice entered twice.                                   │
│▌                                                                        │     space-4
│▌ EVIDENCE — 2 ROWS FROM YOUR EXPORT                                     │  ← caption
│▌ ┌──────────────────────────────────────────────────────────────────┐   │
│▌ │ DATE        SUPPLIER          INVOICE NO.    BANK      AMOUNT     │   │  ← header, 32px
│▌ ├──────────────────────────────────────────────────────────────────┤   │
│▌ │ 2026-03-08  Redwood Faci…Ltd  INV-2026-04417 ••••4417  1,890.00   │   │  ← 44px rows
│▌ │ 2026-03-14  Redwood Faci…Ltd  4417A          ••••4417  1,890.00   │   │
│▌ └──────────────────────────────────────────────────────────────────┘   │
│▌                                                                        │     space-5
│▌ ─────────────────────────────────────────────────────────────────────  │
│▌ [ Accept — this is a real problem ]  [ Reject — this one is fine ]      │  ← decision bar
└─────────────────────────────────────────────────────────────────────────┘
  ▲
  severity bar: 5px high / 3px medium / 2px low
```

Block: `--sheet` background, `--rule` border, `--radius-sm`, `--space-5` padding
on all four sides, `--space-6` gap to the next finding. The severity bar is a
left border and sits outside the padding.

### 9.2 The header row

Baseline-aligned flex row, `space-between`.

**Left:** the severity chip, then the rule name.

- Chip: `.cc-rank` glyph + the word, `--text-2xs` mono uppercase,
  `--tracking-caps`, `--space-2` padding, `--radius-xs`, severity tint
  background, severity-coloured text, **no border**.
- Rule name: `--text-2xs` mono uppercase, `--tracking-caps`, `--ink-faint`.
  Derived from `Finding.ruleId` through a fixed display-name map — never the raw
  kebab-case id, and never a name invented at the call site.

**Right: the amount at stake.** `--text-md` mono, `--ink`, tabular, right-aligned,
preceded by the `--text-3xs` currency slot. This is the second-most-read element
on the screen after the explanation, and on a narrow viewport it wraps *below*
the chip rather than shrinking.

### 9.3 The explanation

`Finding.explanation` from the engine, rendered in `--font-body`,
`--text-base`, `--leading-normal`, `--ink`, capped at `--measure-prose`.

This sentence is the product. It is written by the rules engine to be readable by
a non-accountant, and the design's only job is to keep it out of the way of
nothing. It is never truncated, never put behind a disclosure, never shortened on
mobile, and never replaced by a shorter "title".

Figures inside it are wrapped in `.cc-fig` so they render in tabular mono.

### 9.4 The decision bar

Separated by `--space-5` and a `--rule-hair` above it.

**Accept and Reject are both outlined buttons.** Same height (`--control-h`),
same padding, same `--text-base` weight `500` label, same `1px solid
var(--line-strong)` border, transparent background. Neither is filled, neither is
tinted, neither is larger, neither is on the left by virtue of being preferred.

This is a rule, not a style. Filling one of them would nudge a reviewer toward
one answer, and the entire value of this product rests on that decision being
honest. The filled-accent button style exists for `Run detection` and `Export
evidence pack` — actions with no counter-option — and is never used here.

Rejecting opens a required reason field. Accepting does not, because accepting
means the finding stands as written.

### 9.5 After a decision

The finding collapses over `--dur-base` to a single-line record on `--paper`:

```
▌ ACCEPTED   RE-KEYED DUPLICATE   Redwood Facilities Ltd   GBP  1,890.00   E. du Toit   2026-08-07
▌ REJECTED   ROUND-NUMBER         Metro Print Services     GBP  ~5,000.00~ E. du Toit   2026-08-07  “Annual retainer, expected.”
```

- State chip on the left, `--state-*` colours, same chip construction as severity.
- The severity bar remains, at its original width — a reviewed finding does not
  lose its severity.
- A rejected record is `--ink-muted` throughout with its amount struck through.
  The reason is shown inline in quotes, `--text-xs`, `--ink-muted`. A rejection
  without a visible reason is a bug.
- Reviewer and timestamp are always shown. This is an audit trail; anonymity in
  it would defeat the point.
- Collapsed records stay on the page, below the open queue, under a heading that
  states the count. They are never hidden behind a tab by default.

---

## 10. How evidence rows are shown

The evidence table is the moment the reader checks the tool's work. It is not a
data grid; it is a quotation from their own file.

### 10.1 Rules

1. **Fixed column order, always the same, on every rule.** `DATE · SUPPLIER ·
   INVOICE NO. · REFERENCE · BANK · AMOUNT`. A reader who has looked at three
   findings must not have to re-read the headers on the fourth. Columns the
   export did not provide are omitted entirely — never rendered empty.
2. **Caption above the table**, `--text-2xs` mono uppercase, `--ink-faint`:
   `EVIDENCE — 2 ROWS FROM YOUR EXPORT`. It states the count, and it says *your*,
   because the credibility of the finding rests on these being unmodified rows.
3. **Every row uses `--evidence-row-bg`. No zebra striping.** Alternating stripes
   would compete with the matched-cell highlight, which is the only tint in the
   table that means anything. Rows are separated by `--rule-hair`.
4. **Rows appear in the order `Finding.invoiceIds` gives them**, which the engine
   sets to the order a human should read them (earliest first). Never re-sort.
5. **The header row** sits on `--sheet`, `--row-h-head` tall, `--text-2xs` mono
   uppercase, `--ink-faint`, `--tracking-caps`, with a `--rule` underneath —
   `--line-strong`, because the header/data boundary is meaning-bearing.

### 10.2 Marking the cells that matched

Only the cells the rule actually compared are marked — for a transposition, the
two `AMOUNT` cells; for a bank-detail change, the two `BANK` cells; for a
re-keyed duplicate, the `AMOUNT` and `INVOICE NO.` cells. Never the whole row,
because "these two rows are related" is not the finding — "these two *values*
are the problem" is.

A marked cell gets three things:

```html
<td class="cc-cell cc-cell--matched">
  <span class="cc-money">1,890.00</span>
  <span class="cc-sr">matched</span>
</td>
```

1. `--evidence-cell-match-bg` background — the highlighter mark.
2. A `2px` bottom border in the severity colour.
3. A visually-hidden `matched` string, so a screen reader gets the same
   information a sighted reader gets from the tint.

The wash is only a 1.31:1 step against the row, so it is not load-bearing on its
own; the border and the hidden text carry it. That is the intended division of
labour, not an oversight.

### 10.3 Cell content

| Column | Face | Align | Width | Behaviour |
|---|---|---|---|---|
| `DATE` | mono | left | `11ch` | `YYYY-MM-DD`. Fixed. |
| `SUPPLIER` | body | left | flexible, min `18ch` | **Never truncated.** Wraps to a maximum of two lines. A supplier's name is how the reader recognises the finding; abbreviating it costs more than the width it saves. |
| `INVOICE NO.` | mono | left | `16ch` | `slashed-zero`. Truncation is not permitted. |
| `REFERENCE` | mono | left | flexible | The only column allowed to truncate. Ellipsis plus full value in `title`, and the full value is present in the exported evidence pack. |
| `BANK` | mono | right | `9ch` | `••••4417`. Only ever the last four; the engine never receives more. |
| `AMOUNT` | mono | right | `14ch` min | §6. Currency slot, two decimals, parentheses for credits. |

### 10.4 Narrow viewports

Below `720px` the evidence table becomes a stacked definition list, one block per
row, `--evidence-row-bg`, with the label in `--text-2xs` mono uppercase and the
value beneath it. **The table is never horizontally scrolled and never
column-hidden** — a reader who cannot see the amount cannot check the finding.
`AMOUNT` is the first field in the stacked form, not the last.

---

## 11. Controls, forms and states

### 11.1 Buttons

| Variant | Appearance | Used for |
|---|---|---|
| `.cc-btn--filled` | `--accent` background, `--accent-contrast` label | Exactly one per screen, and only for an action with no counter-option: `Run detection`, `Export evidence pack`, `Continue`. |
| `.cc-btn--outline` | transparent, `1px solid var(--line-strong)`, `--ink` label | The default. Accept, Reject, Cancel, everything else. |
| `.cc-btn--quiet` | transparent, no border, `--accent` label | Inline, low-stakes: `Change mapping`, `Show all 14 rows`. |
| `.cc-btn--guarded` | transparent, `1px solid var(--severity-high)`, `--severity-high` label | The only two irreversible actions in the product: `Reset demo data` and `Delete this upload`. Both require a typed confirmation. **Never a filled red button** — a filled destructive button invites the click it should discourage. |

All: `--control-h`, `0 20px` padding, `--radius-xs`, `--text-base`, weight `500`,
body face. No icons unless the label is genuinely ambiguous without one, and then
inline SVG at `1.5px` stroke in `currentColor`.

### 11.2 Inputs

`--control-h`, `1px solid var(--line-strong)`, `--radius-xs`, `--text-base`,
`--sheet` background. Any input that receives a number, a code or a column name
uses `--font-mono`.

Labels sit **above** the field, `--text-2xs` mono uppercase, `--ink-faint`,
`--space-2` below. Never placeholder-as-label — a finance lead re-checking a
mapping needs to see what the field is while it has a value in it.

Validation messages sit below the field, `--text-xs`, `--severity-high`, prefixed
with the field name so they make sense read aloud. An invalid field also gets a
`2px` `--severity-high` bottom border — colour is not the only signal here either.

### 11.3 Focus

```css
outline: 2px solid var(--focus-ring);
outline-offset: 2px;
```

Applied via `:focus-visible` in `brand.css` to everything focusable. It is never
removed, never replaced with a box-shadow ring that a forced-colours mode will
drop, and never reduced on "design" grounds. `--focus-ring` clears 3:1 against
every surface in both themes (worst case 6.30:1 light, 9.08:1 dark).

### 11.4 The states that matter

**Loading a large file.** A static sentence and a determinate rule:

```
Reading 128,400 rows — 61,200 done
[━━━━━━━━━━━━━━━━━━━━━━━━━░░░░░░░░░░░░░░░░░░░░░░░░░]
```

`2px` rule, `--accent` fill on `--line` track. The count is real and updates. No
spinner, no skeleton, no shimmer, no "Analysing…" with an animated ellipsis. If
progress is genuinely unknowable, the rule uses a slow linear sweep, and under
`prefers-reduced-motion` it becomes a static striped rule with the text carrying
the state.

**No findings.** The most important empty state in the product, and the easiest
one to get wrong. It is not a success screen and it is not an error.

```
No findings above your thresholds.

Countercheck read 128,400 rows and applied 7 rules. Nothing crossed the
thresholds you set: minimum amount GBP 50.00, re-key window 21 days,
round-number threshold GBP 5,000.00.

[ Review thresholds ]
```

No tick, no green, no "All clear", no illustration, no congratulation. State the
row count, the rule count and the exact thresholds, because "we found nothing" is
only useful if the reader can see what "nothing" was measured against.

**Error.** A `--severity-high` left rule, a plain sentence saying what happened
and what to do, and the technical detail available but not shouted. Never "Oops",
never "Something went wrong", never an apology, never an exclamation mark.

**Nothing uploaded yet.** The dropzone is a `--rule` dashed rectangle at
`--radius-sm` with `--space-9` around it, plus a visible, equally weighted
`Explore with demo data` route. Nobody uploads a payment ledger to software they
have not watched work first, so the demo path is a peer of the upload path, not a
footnote under it.

### 11.5 Identity, and who may decide

Added 2026-08-09, when sign-in replaced a hardcoded reviewer.

For the whole of Part 01 every decision was written against the literal string
`demo reviewer`. An audit trail whose *who* column is a constant is decoration,
and "a person decided" is this product's only real claim. Everything below
exists to make that claim checkable rather than asserted.

**The three tiers, and what each one sees.**

| Tier | May do | Interface |
|---|---|---|
| Anonymous | Read every finding, every evidence row, the whole audit trail | Decision controls are **present and disabled**. Not hidden. |
| Signed in | Everything above, and record decisions against their email | Controls live. Masthead shows the address. |
| Granted | Upload a real export | Not self-serve. See PLAN.md, Part 03. |

**Decision controls are disabled, never hidden, for anonymous readers.** A
hidden control teaches nothing; a disabled one shows the reader exactly what
this screen is for and what signing in would let them do. The server refuses
regardless — `requireUser()` throws — so the disabled attribute is the interface
agreeing with the rule, never the rule itself. Never rely on a disabled button
for a decision that matters.

**The identity slot.** `.masthead-tools .who`, sitting beside the read-only
badge: mono, `--text-2xs`, `--ink-soft`, no border, truncating at `22ch`. It
reads `Sign in` when nobody is, and the plain email address when someone is.

Deliberately quiet, and deliberately not a button. Most people who open
Countercheck are here to read, and reading needs no account — a prominent
call to sign in would tax the majority to serve the minority. It earns
attention only at the moment it matters, which is when a decision is refused.

**No avatar, no display name, no initials disc.** The audit trail records the
address someone had to prove they own. A display name is a string they typed,
and putting a friendly version of it in the masthead while a different string
sits in the evidence would be two identities for one person.

**Magic link, so several familiar things are absent.** No password field, no
strength meter, no "forgot your password", no confirm-password, no "stay signed
in" checkbox. Do not add them back to make the page look conventional — every
one of them is a thing to store, a flow to build, or a breach to answer for, in
exchange for nothing this application needs.

**The sign-in form gives the same answer either way.** Whether or not the
address is known, the reader sees *"If that address can sign in here, a link is
on its way."* Saying "no account with that email" turns the form into a way of
finding out who has an account, one address at a time. The wording is a security
decision and must not be softened into something friendlier.

### 11.6 Text inputs

`.text-field`, sharing `.field-label` with the file field, and differing from it
in exactly one respect: a **solid** border rather than a dashed one. Dashed reads
as *drop something here*, which is right for a file and wrong for a line of
typing.

`font-size` is `1rem` — 19px at this root — and **must never fall below 16px**.
Below that, iOS Safari zooms the whole page when the field takes focus and the
reader has to pinch back out to see what they typed. This is the reason the
figure is written as `1rem` and not as a smaller literal.

`min-height: 44px`, per Apple's minimum hit area. `.primary` and `.secondary`
are `inline-flex` for the same reason: `min-height` alone would leave the label
sitting at the top of a 44px box rather than centred in it.

**Focus is not restyled here.** §11.3 already gives `:focus-visible` a 2px
`--focus-ring` chosen to clear 3:1 against every surface. A second treatment on
text fields would compete with an accessibility decision already made and
verified.

**Disabled reads as "not yet", not as "broken".** `opacity: 0.45` with the fill
retained, so a disabled primary is still legibly the primary action. This is the
first state an anonymous reader meets, and it should invite the question *how do
I turn this on* rather than suggest the page has failed.

---

## 12. Deliberately not used

Each of these is a decision, not an omission. Do not reintroduce them.

**Visual**

| Not used | Because |
|---|---|
| Gradients, of any kind | A gradient is decoration, and decoration on a page that accuses someone's paperwork reads as salesmanship. |
| Shadows for structure | Depth implies a stack of interactive surfaces. This is a document. Hairlines and alignment do the work. One overlay shadow exists, for modals and popovers only. |
| Border-radius above 3px, pills, capsule chips | Rounded is the visual grammar of consumer software. Statements have square corners. |
| Glassmorphism, blur, translucency | Anything that puts a figure over a variable background makes the figure harder to read, and no contrast ratio can be guaranteed. |
| Icon fonts, icon libraries, any external asset | No CDN, no font file we did not build, no image we cannot inspect. Icons are inline SVG at `1.5px` stroke in `currentColor`, and only where a word will not do. |
| Emoji, anywhere | Including in copy, empty states and commit-adjacent UI text. |
| Illustrations, mascots, spot art | |
| Purple, violet, electric blue, neon anything | The current palette of AI products. Countercheck's whole argument is that no model touches the ledger; looking like an AI product undermines it. |
| Dark-mode-only or light-mode-only designs | Both are first-class. Every token is defined in both. |
| Zebra striping | Competes with the matched-cell highlight, which is the only meaningful tint in an evidence table. |
| Charts by default, and donut charts ever | A chart is permitted only when the decision it supports cannot be made from the table. A donut cannot be read to two decimal places. |
| Sparklines, gauges, progress rings, dials | Imprecise by construction. |
| Font weights above 600 | |
| Letter-spacing on body text | Only on uppercase mono micro-labels, at `0.08em`. |
| Uppercase for anything over three words | |
| Italics in data | |

**Behavioural**

| Not used | Because |
|---|---|
| Skeleton shimmers, animated ellipses, indeterminate spinners with personality | They perform activity instead of reporting it. Report the row count. |
| Entrance animations on data | A figure that fades or slides in is a figure the reader has to wait to check. |
| Count-up number animations | The reader sees three wrong numbers before the right one. |
| Toasts that disappear | An audit action that is confirmed by a message that vanishes in four seconds is not confirmed. Decisions are confirmed in place, permanently. |
| Confetti, celebration, sound | Money was lost. |
| A filled Accept button next to an outlined Reject | Nudges the reviewer. See §9.4. |
| A pre-selected decision, or a bulk "accept all" | |
| Abbreviated money (`1.2k`, `£1.2M`) | Cannot be reconciled to anything. |
| Relative dates in data | Wrong the moment the page is printed. |
| Truncated supplier names or amounts | |
| Horizontal scrolling of an evidence table | |
| Infinite scroll in the review queue | A reviewer needs to know how many are left. Paginate, and state the count. |

**Language**

| Not used | Because |
|---|---|
| Exclamation marks, anywhere | |
| "Oops", "Uh oh", "Something went wrong", "Great news" | |
| Sentiment about a result — "unfortunately", "good news", "only 3 findings" | The tool has no opinion. |
| "AI", "smart", "intelligent", "magic", "powered by" | Detection is a deterministic rules engine. Saying otherwise is both inaccurate and, for this buyer, disqualifying. |
| "Fraud", "theft", accusing language about people | Findings describe rows, not intent. "Two rows carry the same invoice number", never "someone paid twice". |
| "Vendor" in UI copy | The data model calls it `vendorName`; the interface says **supplier**, consistently, because that is what the reader's team says. |
| First person plural — "we found", "we think" | "Countercheck applied 7 rules" or, better, "7 rules applied". |

---

## 13. Print

The evidence pack gets printed and PDF'd and taken into a conversation with a
supplier. Print is a supported output, not an afterthought.

- Print always renders the **light** theme, regardless of the reader's setting.
- Surfaces flatten to white; `--evidence-row-bg` becomes white with rules retained.
- `--evidence-cell-match-bg` becomes a `2px` underline, so the mark survives a
  greyscale printer.
- A finding block gets `break-inside: avoid`. A finding must never straddle a page.
- The rule name, severity word, amount at stake, every evidence row, the
  reviewer and the timestamp all print. Nothing is `display: none` in print that
  carried information on screen.
- Decision buttons, nav and filters do not print.
- A footer prints the source filename, the run timestamp, the row count and the
  thresholds used — the same facts the empty state shows, because a printed page
  with no provenance is not evidence.

---

## 14. What `brand.css` ships, and what you build

`brand.css` is tokens plus the handful of rules that are too easy to get wrong or
that must not be reimplemented per component. Everything else is the app's.

**Provided — use these, do not redefine them:**

| Class | What it does |
|---|---|
| `.cc-fig` | Tabular mono figure. Wrap every number, including numbers inside sentences. |
| `.cc-money` | Money cell: mono, tabular, right-aligned, no-wrap, `--col-amount` min width. |
| `.cc-money--positive` | Reserves the closing-parenthesis column so positives align with credits. |
| `.cc-money--credit` | `--figure-credit` colour. Render the text as `(240.00)`. |
| `.cc-ccy` | The fixed `4ch` currency-code slot at `--text-3xs`. |
| `.cc-id` | Identifier: mono, tabular, `slashed-zero`. Invoice numbers, references, bank digits. |
| `.cc-caps` | Uppercase mono micro-label at `--text-2xs` with `--tracking-caps`. |
| `.cc-display` | Fraunces with the axes locked. The only correct way to use the display face. |
| `.cc-rank` | The three-stem severity glyph. Mark filled stems with `data-on`. |
| `.cc-sr` | Visually hidden, still in the accessibility tree. |

Also provided globally: the 17px root, `body` defaults, `::selection`,
`:focus-visible`, the reduced-motion override, and the print theme.

**Yours to build**, following the specs above — `brand.css` only styles these in
print: `.cc-finding` (§9.1), `.cc-cell` / `.cc-cell--matched` (§10.2),
`.cc-chip--high|medium|low|open|accepted|rejected` (§9.2, §9.5), and
`.cc-btn--filled|outline|quiet|guarded` (§11.1). Keep these names — the print
stylesheet already depends on `.cc-finding` and `.cc-cell--matched`.

---

## 15. Quick reference

| I am building… | Use |
|---|---|
| Any number at all | `.cc-fig` or `.cc-money`, `--font-mono`, `tabular-nums` |
| A money cell | `.cc-money`, right-aligned, 2dp, currency slot at `--text-3xs`, `.cc-money--positive` for the paren reserve, `.cc-money--credit` for a credit |
| A severity indicator | `.cc-chip--high|medium|low` + `.cc-rank` glyph + the word + the bar width. All four. |
| A review state | `.cc-chip--accepted|rejected|open`, plus the word, plus the collapsed layout |
| A finding block | `--sheet`, `--rule`, `--radius-sm`, `--space-5` padding, severity left bar, `--space-6` to the next |
| A gap between a finding's title and its explanation | `--space-3` (12px) |
| A gap between an explanation and its evidence table | `--space-4` (16px) |
| An evidence row | `--evidence-row-bg`, `--row-h`, `--rule-hair` between, no striping |
| A matched cell | `--evidence-cell-match-bg` + `2px` severity bottom border + `.cc-sr` "matched" |
| A separating line I am unsure about | `--line-strong` |
| A total | `--rule-total` above, `--text-lg`, mono, weight 500 |
| A heading ≥ 19px | `--font-display` with `--font-display-settings` |
| Anything smaller than 19px | `--font-body` or `--font-mono`, never display |
| A destructive action | `.cc-btn--guarded`, outlined, with typed confirmation |
| Focus | leave it alone; `brand.css` has it |
| A new colour | do not; if you genuinely must, re-run the contrast arithmetic in §4 and add it to the table |

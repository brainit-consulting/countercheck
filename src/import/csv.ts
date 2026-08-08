import type {Invoice} from "../types";

/**
 * Reading an accounts-payable export that somebody else produced.
 *
 * Three jobs, deliberately kept apart because they fail in different ways and a
 * user fixes them in different places: parsing (the file is or is not
 * well-formed CSV), mapping (which column is which — a guess a human confirms),
 * and coercion (this text is or is not a date).
 *
 * The governing rule is that nothing is silently dropped and nothing is silently
 * guessed. A finance team will act on these numbers. A row that quietly vanished
 * between the export and the report is worse than a row that never imported,
 * because nobody knows to go looking for it.
 */

export type Field =
  | "vendorName" | "invoiceNumber" | "invoiceDate"
  | "amount" | "currency" | "reference" | "bankLast4";

export const FIELDS: Field[] = [
  "vendorName", "invoiceNumber", "invoiceDate", "amount", "currency", "reference", "bankLast4",
];

/** Fields without which a row is not an invoice. Everything else is decoration. */
const REQUIRED: Field[] = ["vendorName", "invoiceNumber", "invoiceDate", "amount"];

export type DateOrder = "dmy" | "mdy";

export type ColumnGuess = {
  /** Index into the header row, or null when nothing scored well enough to claim. */
  column: number | null;
  header: string | null;
  /** 0..1. Damped when a second column came close, because a near-tie is real doubt. */
  confidence: number;
  /**
   * Why this column and not another, in words the user can argue with. A wrong
   * guess is recoverable — they override it. An unexplained one is not, because
   * they have no way to tell a good guess from a lucky one.
   */
  reason: string;
};

export type ColumnMapping = Record<Field, ColumnGuess>;

export type ImportError = {row: number; column: string; value: string; reason: string};

export type ImportResult = {
  rows: Invoice[];
  mapping: ColumnMapping;
  /** Header text of every column we did not claim, so nothing goes unaccounted for. */
  unmapped: string[];
  errors: ImportError[];
};

export type ImportOptions = {
  /**
   * How to read 03/04/2026. Left unset, genuinely ambiguous dates are reported
   * rather than guessed — half the ledger silently shifted by months is the kind
   * of error that survives all the way to a board pack.
   */
  dateOrder?: DateOrder;
  /** User-confirmed mapping, field to header text or 0-based column index. Beats every guess. */
  mapping?: Partial<Record<Field, string | number>>;
  /** Used when the export carries no currency column and no symbol in the amounts. */
  defaultCurrency?: string;
};

export type Coerced<T> = {ok: true; value: T} | {ok: false; reason: string};

// ---------------------------------------------------------------------------
// 1. Parsing
// ---------------------------------------------------------------------------

export type CsvRecord = {
  cells: string[];
  /**
   * Physical line the record starts on, 1-based. Not the record index: a quoted
   * field can span lines, and an error that cites a line number the user cannot
   * find in their editor is an error they will not fix.
   */
  line: number;
  /**
   * The line an unclosed quote opened on, when this record has one. It can only be
   * the last record, because by then the quote has eaten the rest of the file. The
   * record is handed back marked rather than quietly finalised: a caller that
   * cannot see the damage cannot report it, and the lines inside it are invoices.
   */
  unterminatedQuote?: number;
};

/**
 * RFC4180 with the concessions real exports demand: a UTF-8 BOM, CRLF or LF or a
 * lone CR, blank lines anywhere, and padding around unquoted fields.
 *
 * Unquoted fields are trimmed; quoted fields are preserved byte for byte. That
 * asymmetry is the whole point of quoting — someone who wrote `"  x  "` meant the
 * spaces, and someone whose ERP wrote `x , y` did not.
 */
export function parseCsvRecords(text: string): CsvRecord[] {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const records: CsvRecord[] = [];
  let cells: string[] = [];
  let field = "";
  /** Spaces seen after a closing quote, held until we know whether data follows. */
  let pad = "";
  let inQuotes = false;
  let fieldQuoted = false;
  let recordQuoted = false;
  let line = 1;
  let recordLine = 1;
  let quoteLine = 1;

  const endField = () => {
    cells.push(fieldQuoted ? field : field.trim());
    field = "";
    pad = "";
    fieldQuoted = false;
  };
  const endRecord = () => {
    endField();
    // A blank line is formatting, not data, so it is dropped rather than reported.
    // The quoting check keeps a deliberate `""` row — someone typed that on purpose.
    const blank = !recordQuoted && cells.length === 1 && cells[0] === "";
    if (!blank) records.push({cells, line: recordLine});
    cells = [];
    recordQuoted = false;
    recordLine = line;
  };

  let i = 0;
  while (i < src.length) {
    const c = src[i];

    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      if (c === "\n") line++;
      field += c; i++; continue;
    }

    // A quote only opens a quoted field at the start of one. Anywhere else it is
    // data: `12" copper pipe` is a description, and `"Bracket 12" x 4"` is an
    // export that quoted a description and forgot to double the inch mark. Reading
    // that last quote as an opening one hands every following line to this cell,
    // and the invoices in them are gone with nothing to say they existed.
    if (c === '"' && !fieldQuoted && field.trim() === "") {
      field = ""; inQuotes = true; fieldQuoted = true; recordQuoted = true; quoteLine = line;
      i++; continue;
    }

    // Padding after a closing quote belongs to nobody — unless data follows it, in
    // which case the field did not end there and the spaces are part of the value.
    if (fieldQuoted && (c === " " || c === "\t")) { pad += c; i++; continue; }

    if (c === ",") { endField(); i++; continue; }
    if (c === "\r") { i += src[i + 1] === "\n" ? 2 : 1; line++; endRecord(); continue; }
    if (c === "\n") { i++; line++; endRecord(); continue; }

    field += pad + c;
    pad = "";
    i++;
  }

  // A file that does not end in a newline still has a last record.
  if (field.length || cells.length || fieldQuoted) endRecord();
  // A quote still open at the end of the file has already swallowed everything
  // after it. Marking the record is what lets the import say which line went wrong
  // and how much went with it, instead of returning one fat row and no complaint.
  if (inQuotes && records.length) records[records.length - 1].unterminatedQuote = quoteLine;
  return records;
}

/** The cells alone, for callers that do not need to cite line numbers. */
export function parseCsv(text: string): string[][] {
  return parseCsvRecords(text).map((r) => r.cells);
}

// ---------------------------------------------------------------------------
// 2. Column mapping
// ---------------------------------------------------------------------------

/**
 * Header phrases we have actually seen, most canonical first. Order matters: a
 * small decay by position breaks ties between two headers that both look right,
 * so a file carrying both "Invoice Date" and "Doc Date" picks the former and
 * says so, rather than picking whichever happened to be printed first.
 */
const KNOWN: Record<Field, string[]> = {
  vendorName: [
    "vendor name", "supplier name", "supplier", "vendor", "payee", "payee name",
    "creditor name", "creditor", "beneficiary", "account name", "supplier account name",
    "trading name", "party name",
  ],
  invoiceNumber: [
    "invoice no", "invoice number", "invoice num", "invoice", "invoice id",
    "document number", "document no", "doc number", "doc no", "voucher number",
    "voucher no", "bill number", "bill no", "invoice ref",
  ],
  invoiceDate: [
    "invoice date", "document date", "doc date", "posting date", "bill date",
    "transaction date", "entry date", "date",
  ],
  amount: [
    "net amount", "invoice amount", "amount", "gross amount", "gross", "net value",
    "net", "value", "invoice total", "total amount", "total",
  ],
  currency: ["currency", "currency code", "ccy", "curr", "cur"],
  reference: [
    "reference", "po number", "purchase order number", "purchase order", "po no",
    "description", "narrative", "memo", "details", "line description", "remarks", "ref",
  ],
  bankLast4: [
    "bank acc last 4", "bank account last 4", "bank account number last 4",
    "bank last 4", "account last 4", "acct last 4", "last four", "last 4",
    "iban last 4", "bank acc last four",
  ],
};

/**
 * Words that mean a header is probably a neighbour of the field rather than the
 * field. "VAT Amount" is not the invoice total and "Due Date" is not the invoice
 * date, but both look close enough to win by default in a thin header row.
 */
const PENALTIES: Partial<Record<Field, {token: string; weight: number; why: string}[]>> = {
  vendorName: [
    {token: "id", weight: 0.3, why: "\"id\" suggests a vendor code rather than a name"},
    {token: "code", weight: 0.3, why: "\"code\" suggests a vendor code rather than a name"},
    {token: "number", weight: 0.3, why: "\"number\" suggests a vendor code rather than a name"},
  ],
  invoiceNumber: [
    {token: "date", weight: 0.3, why: "\"date\" suggests this is a date column"},
    {token: "line", weight: 0.2, why: "\"line\" suggests a line-item id rather than the invoice"},
  ],
  invoiceDate: [
    {token: "due", weight: 0.3, why: "a due date is not the invoice date"},
    {token: "paid", weight: 0.3, why: "a paid date is not the invoice date"},
    {token: "cleared", weight: 0.3, why: "a cleared date is not the invoice date"},
  ],
  amount: [
    {token: "vat", weight: 0.3, why: "\"vat\" suggests a tax column, not the invoice total"},
    {token: "tax", weight: 0.3, why: "\"tax\" suggests a tax column, not the invoice total"},
    {token: "discount", weight: 0.3, why: "\"discount\" suggests an adjustment, not the invoice total"},
    {token: "outstanding", weight: 0.2, why: "\"outstanding\" is a balance, not the invoice total"},
  ],
};

/** Anything below this is not worth claiming; better to report the field as unmapped. */
const CLAIM_THRESHOLD = 0.35;
/** Two candidates closer than this are a coin toss, and the user must be told. */
const CLOSE_CALL = 0.15;

const normHeader = (h: string) => h.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/**
 * Levenshtein again — deliberately local rather than reused from detection/match,
 * which strips company-legal suffixes. "Co" and "Corp" are noise in a supplier
 * name and meaningful in a column header.
 */
function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length || !b.length) return Math.max(a.length, b.length);
  let prev = Array.from({length: b.length + 1}, (_, i) => i);
  let curr = new Array<number>(b.length + 1);
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length];
}

const similarity = (a: string, b: string) =>
  a === b ? 1 : 1 - editDistance(a, b) / Math.max(a.length, b.length);

function containsRun(hay: string[], needle: string[]): boolean {
  if (!needle.length || needle.length > hay.length) return false;
  outer: for (let i = 0; i + needle.length <= hay.length; i++) {
    for (let j = 0; j < needle.length; j++) if (hay[i + j] !== needle[j]) continue outer;
    return true;
  }
  return false;
}

type Scored = {score: number; why: string};

/** How well one header reads as one field, and the sentence that justifies it. */
function scoreHeader(header: string, field: Field): Scored {
  const norm = normHeader(header);
  if (!norm) return {score: 0, why: "the column has no header"};
  const hayTokens = norm.split(" ");
  let best: Scored = {score: 0, why: ""};

  KNOWN[field].forEach((phrase, index) => {
    const needle = phrase.split(" ");
    // Preference decay, capped so it can never outweigh real evidence.
    const decay = 0.005 * Math.min(index, 10);
    let raw = 0;
    let why = "";

    if (norm === phrase) {
      raw = 1;
      why = `"${header}" is exactly the known ${field} header "${phrase}"`;
    } else if (containsRun(hayTokens, needle)) {
      raw = 0.7 + 0.25 * (needle.length / hayTokens.length);
      why = `"${header}" contains "${phrase}"`;
    } else {
      const overlap = needle.filter((t) => hayTokens.includes(t)).length / needle.length;
      const fuzzy = similarity(norm, phrase);
      if (overlap > 0 && 0.3 + 0.35 * overlap >= 0.35) {
        raw = 0.3 + 0.35 * overlap;
        why = `"${header}" shares wording with "${phrase}"`;
      }
      if (fuzzy > 0.75 && fuzzy * 0.7 > raw) {
        raw = fuzzy * 0.7;
        why = `"${header}" is close enough to "${phrase}" to look like an abbreviation or typo`;
      }
    }

    if (raw <= 0) return;
    let score = raw - decay;
    for (const p of PENALTIES[field] ?? []) {
      if (hayTokens.includes(p.token) && !needle.includes(p.token)) {
        score -= p.weight;
        why += `, though ${p.why}`;
      }
    }
    if (score > best.score) best = {score, why};
  });

  return best.score > 0 ? best : {score: 0, why: `"${header}" reads nothing like ${field}`};
}

function resolveOverride(headers: string[], want: string | number): number | null {
  if (typeof want === "number") return want >= 0 && want < headers.length ? want : null;
  const target = normHeader(want);
  const exact = headers.findIndex((h) => normHeader(h) === target);
  return exact >= 0 ? exact : null;
}

/**
 * Propose a column for every field, with a reason for each.
 *
 * Assignment is greedy over the whole score matrix rather than best-per-field,
 * so two fields cannot claim the same column and the strongest evidence in the
 * file wins first. Ties break on column order then field order, because a
 * mapping that changes between runs of the same file is not a mapping.
 *
 * Greed alone is not quite enough, though: score order takes no account of which
 * fields an import cannot run without, so a required field left with nothing
 * reclaims its column from an optional one afterwards.
 */
export function suggestMapping(
  headers: string[],
  overrides: Partial<Record<Field, string | number>> = {},
): ColumnMapping {
  const scores: Scored[][] = FIELDS.map((f) => headers.map((h) => scoreHeader(h, f)));
  const mapping = {} as ColumnMapping;
  const takenColumn = new Map<number, Field>();
  const settled = new Set<Field>();

  // User overrides are not guesses and do not compete.
  for (const field of FIELDS) {
    const want = overrides[field];
    if (want === undefined) continue;
    const column = resolveOverride(headers, want);
    settled.add(field);
    if (column === null) {
      mapping[field] = {
        column: null, header: null, confidence: 0,
        reason: `you mapped ${field} to ${typeof want === "number" ? `column ${want}` : `"${want}"`}, which this header row does not have`,
      };
      continue;
    }
    takenColumn.set(column, field);
    mapping[field] = {
      column, header: headers[column], confidence: 1,
      reason: `you chose "${headers[column]}" for ${field}`,
    };
  }

  const take = (field: Field, column: number, score: number, why: string, note = "") => {
    settled.add(field);
    takenColumn.set(column, field);

    // The runner-up is reported even when another field has already claimed it:
    // the user is being told what else this column could have been.
    const fi = FIELDS.indexOf(field);
    let runnerUp = {column: -1, score: 0};
    headers.forEach((_, ci) => {
      if (ci === column) return;
      if (scores[fi][ci].score > runnerUp.score) runnerUp = {column: ci, score: scores[fi][ci].score};
    });

    const close = runnerUp.column >= 0 && score - runnerUp.score < CLOSE_CALL;
    const confidence = close ? score - (CLOSE_CALL - (score - runnerUp.score)) : score;
    const closeCall = close
      ? `; "${headers[runnerUp.column]}" scored almost as well (${runnerUp.score.toFixed(2)}) and may be the right column instead`
      : "";
    mapping[field] = {
      column,
      header: headers[column],
      confidence: Math.max(0, Math.round(confidence * 100) / 100),
      reason: why + closeCall + note,
    };
  };

  /** One round of bidding: every field still without a column, over every column still free. */
  const compete = () => {
    const candidates: {field: Field; column: number; score: number; why: string}[] = [];
    FIELDS.forEach((field, fi) => {
      if (settled.has(field)) return;
      headers.forEach((_, ci) => {
        const s = scores[fi][ci];
        if (s.score >= CLAIM_THRESHOLD && !takenColumn.has(ci)) {
          candidates.push({field, column: ci, score: s.score, why: s.why});
        }
      });
    });
    candidates.sort((a, b) =>
      b.score - a.score || a.column - b.column || FIELDS.indexOf(a.field) - FIELDS.indexOf(b.field));

    for (const c of candidates) {
      if (settled.has(c.field) || takenColumn.has(c.column)) continue;
      take(c.field, c.column, c.score, c.why);
    }
  };

  compete();

  // A required field with no column stops the import dead, while reference,
  // currency and bankLast4 are decoration. So an optional field holding the only
  // column a required one could have used gives it back — "Invoice Reference"
  // reads a shade better as a reference than as an invoice number, and losing a
  // whole export to that margin helps nobody — and then bids again for whatever
  // is left. Nothing is ever taken from another required field: two required
  // fields wanting one column is a genuine conflict, and the user settles it.
  const displaced = {} as Partial<Record<Field, {to: Field; column: number}>>;
  for (const field of REQUIRED) {
    if (settled.has(field)) continue;
    const fi = FIELDS.indexOf(field);
    let best = {column: -1, score: 0};
    headers.forEach((_, ci) => {
      const holder = takenColumn.get(ci);
      if (holder === undefined || REQUIRED.includes(holder)) return;
      if (scores[fi][ci].score >= CLAIM_THRESHOLD && scores[fi][ci].score > best.score) {
        best = {column: ci, score: scores[fi][ci].score};
      }
    });
    if (best.column < 0) continue;

    const holder = takenColumn.get(best.column) as Field;
    displaced[holder] = {to: field, column: best.column};
    settled.delete(holder);
    takenColumn.delete(best.column);
    take(field, best.column, best.score, scores[fi][best.column].why,
      `; ${holder} matched this column more closely, but ${holder} is optional and an import with no ${field} cannot run at all`);
  }
  if (Object.keys(displaced).length) compete();

  for (const field of FIELDS) {
    if (settled.has(field)) continue;
    const fi = FIELDS.indexOf(field);
    let nearest = {column: -1, score: 0};
    headers.forEach((_, ci) => {
      if (scores[fi][ci].score > nearest.score) nearest = {column: ci, score: scores[fi][ci].score};
    });
    // Four different ways to end up unmapped, and telling them apart is the
    // difference between a user fixing their export and a user distrusting the
    // tool: nothing resembled the field, something resembled it but not enough,
    // something resembled it and a better-evidenced field took the column first,
    // or this field had the best evidence and lost the column anyway because a
    // required field had nowhere else to go. Reporting that last one as a
    // stronger match elsewhere would be a lie the user can check by looking at
    // the scores, and a wrong explanation is worse than none.
    const takenBy = nearest.column >= 0 ? takenColumn.get(nearest.column) : undefined;
    const lost = displaced[field];
    let reason: string;
    if (lost) {
      reason = `${field} has no column of its own: "${headers[lost.column]}" was the best evidence for it, but ${lost.to} is required and had no other candidate, so the column went there`;
    } else if (nearest.column < 0) {
      reason = `no column in this header row resembles ${field}`;
    } else if (takenBy && nearest.score >= CLAIM_THRESHOLD) {
      reason = `${field} has no column of its own: "${headers[nearest.column]}" scored ${nearest.score.toFixed(2)} for it, but is a stronger match for ${takenBy}`;
    } else {
      reason = `no column matched ${field}; the nearest was "${headers[nearest.column]}" at ${nearest.score.toFixed(2)}, below the ${CLAIM_THRESHOLD} threshold`;
    }

    mapping[field] = {column: null, header: null, confidence: 0, reason};
  }

  return mapping;
}

// ---------------------------------------------------------------------------
// 3. Coercion
// ---------------------------------------------------------------------------

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
  may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9,
  september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** Two-digit years use the POSIX pivot. An AP ledger from 1969 is not a real risk. */
const expandYear = (n: number) => (n >= 100 ? n : n < 70 ? 2000 + n : 1900 + n);

function buildDate(y: number, m: number, d: number, shown: string): Coerced<string> {
  if (m < 1 || m > 12) return {ok: false, reason: `"${shown}" has month ${m}, which does not exist`};
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  if (d < 1 || d > daysInMonth) {
    return {ok: false, reason: `"${shown}" is not a real date — ${MONTH_NAMES[m - 1]} ${y} has ${daysInMonth} days`};
  }
  const pad = (n: number) => String(n).padStart(2, "0");
  return {ok: true, value: `${String(y).padStart(4, "0")}-${pad(m)}-${pad(d)}`};
}

/**
 * The time an export stamped onto a date, which an invoice date does not need.
 * Anything with a SQL database behind it writes midnight on every row, and a file
 * whose every date carries 00:00:00 would otherwise import nothing at all.
 */
const TIME_TAIL = /[T ]\d{1,2}:\d{2}(:\d{2})?(\.\d+)?\s*(Z|[+-]\d{2}:?\d{2})?$/i;
const withoutTime = (s: string) => s.replace(TIME_TAIL, "").trim();

/**
 * Text to an ISO date, or a reason why not.
 *
 * The only case that needs a hint is a pure-numeric date where both leading
 * components could be a month. Everything else resolves from the value itself,
 * so a file with a `dateOrder` set is not being trusted blindly — the hint is
 * consulted last, only where the file genuinely cannot say.
 */
export function parseDate(raw: string, dateOrder?: DateOrder): Coerced<string> {
  // Every complaint quotes the cell as the file has it, timestamp included: the
  // user has to find this value in an editor, and one they cannot search for is
  // not a citation.
  const shown = raw.trim();
  if (!shown) return {ok: false, reason: "the date is blank"};
  const s = withoutTime(shown);

  // Year first is unambiguous whatever locale wrote the file.
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (m) return buildDate(+m[1], +m[2], +m[3], shown);

  m = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m && +m[1] >= 1900 && +m[1] <= 2100) return buildDate(+m[1], +m[2], +m[3], shown);

  // A month name settles the order by itself, which is why exports that use one
  // are the easy case however ugly the punctuation around it.
  m = s.match(/^(\d{1,2})[\s\-/.]*([A-Za-z]{3,9})\.?[\s\-/.,]*(\d{2}|\d{4})$/);
  if (m) {
    const month = MONTHS[m[2].toLowerCase()];
    if (!month) return {ok: false, reason: `"${shown}" does not name a month I recognise ("${m[2]}")`};
    return buildDate(expandYear(+m[3]), month, +m[1], shown);
  }
  m = s.match(/^([A-Za-z]{3,9})\.?[\s\-/.]*(\d{1,2})[\s\-/.,]*(\d{2}|\d{4})$/);
  if (m) {
    const month = MONTHS[m[1].toLowerCase()];
    if (!month) return {ok: false, reason: `"${shown}" does not name a month I recognise ("${m[1]}")`};
    return buildDate(expandYear(+m[3]), month, +m[2], shown);
  }

  m = s.match(/^(\d{1,2})[-/. ](\d{1,2})[-/. ](\d{2}|\d{4})$/);
  if (m) {
    const a = +m[1];
    const b = +m[2];
    const y = expandYear(+m[3]);
    if (a > 12 && b > 12) return {ok: false, reason: `"${shown}" has no valid month: neither ${a} nor ${b} can be one`};
    if (a > 12) return buildDate(y, b, a, shown);
    if (b > 12) return buildDate(y, a, b, shown);
    // 03/03 reads the same both ways, so it is not ambiguous and must not be reported.
    if (a === b) return buildDate(y, a, b, shown);
    if (dateOrder === "dmy") return buildDate(y, b, a, shown);
    if (dateOrder === "mdy") return buildDate(y, a, b, shown);
    return {
      ok: false,
      reason: `"${shown}" is ambiguous: ${a} ${MONTH_NAMES[b - 1]} ${y} if the file is day-first, ${b} ${MONTH_NAMES[a - 1]} ${y} if it is month-first — set dateOrder to "dmy" or "mdy"`,
    };
  }

  return {ok: false, reason: `"${shown}" is not a date format this importer recognises`};
}

/**
 * The order a date states for itself, or null where both readings stand. 25/12 can
 * only be day-first, and a column holding one has answered the question whatever
 * the upload form was set to — which is also how a file contradicts an answer.
 */
function forcedOrder(raw: string): DateOrder | null {
  const m = withoutTime(raw.trim()).match(/^(\d{1,2})[-/. ](\d{1,2})[-/. ](\d{2}|\d{4})$/);
  if (!m) return null;
  const a = +m[1];
  const b = +m[2];
  if (a > 12 && b <= 12) return "dmy";
  if (b > 12 && a <= 12) return "mdy";
  return null;
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  // "$" is read as USD. It is also CAD, AUD, NZD and more; a currency column or
  // defaultCurrency overrides this, and the mapping reason says when it was used.
  "£": "GBP", "$": "USD", "€": "EUR", "¥": "JPY", "₹": "INR", "₨": "PKR",
};

/**
 * Whether an amount column writes decimals with a comma.
 *
 * Decided per column, not per cell, because "1.234" alone is unanswerable and
 * "1.234,56" three rows down answers it. Only unambiguous cells vote, and any
 * dot-decimal evidence at all vetoes the conclusion — a column that mixes both
 * conventions gets no hint and falls back to per-cell rules.
 *
 * It also takes two votes. One cell is as likely to be a hand-typed European
 * figure in a column of thousands commas, and turning the column on that reads
 * "12,000" as twelve — three orders of magnitude, on every row below it, with
 * nothing on the screen to say it happened.
 */
export function sniffDecimalComma(cells: string[]): boolean {
  let comma = 0;
  let dot = 0;
  for (const raw of cells) {
    const s = raw.replace(/[^\d.,]/g, "");
    if (s.includes(".") && s.includes(",")) {
      if (s.lastIndexOf(",") > s.lastIndexOf(".")) comma++;
      else dot++;
      continue;
    }
    if (/,\d{1,2}$/.test(s)) comma++;
    else if (/\.\d{1,2}$/.test(s)) dot++;
  }
  return comma > 1 && dot === 0;
}

/**
 * Text to a number, plus any currency the cell disclosed about itself.
 *
 * Handles the four ways an AP export signals a negative — a minus, brackets, a
 * trailing minus, and a "CR" tag — because a credit read as a payable turns a
 * refund into a duplicate and puts a supplier on a chase list they do not deserve.
 */
export function parseAmount(
  raw: string,
  opts: {decimalComma?: boolean} = {},
): Coerced<{value: number; currency?: string}> {
  let s = raw.trim();
  if (!s) return {ok: false, reason: "the amount is blank"};

  let negative = false;
  let currency: string | undefined;

  const bracketed = s.match(/^\((.*)\)$/);
  if (bracketed) { negative = true; s = bracketed[1].trim(); }

  for (const [symbol, code] of Object.entries(CURRENCY_SYMBOLS)) {
    if (s.includes(symbol)) { currency = code; s = s.split(symbol).join(""); }
  }

  const isoCode = s.match(/(?:^|\s)([A-Za-z]{3})(?=$|\s)/);
  if (isoCode) { currency = isoCode[1].toUpperCase(); s = s.replace(isoCode[0], " "); }
  s = s.trim();

  // CR/DR ride on either end and may be jammed against the digits ("1234.56CR").
  const tag = s.match(/^(CR|DR)\b/i) ?? s.match(/(CR|DR)$/i);
  if (tag) {
    if (tag[1].toUpperCase() === "CR") negative = !negative;
    s = s.replace(/^(CR|DR)\s*/i, "").replace(/\s*(CR|DR)$/i, "").trim();
  }

  if (/^[+-]/.test(s)) { if (s[0] === "-") negative = !negative; s = s.slice(1).trim(); }
  if (/[+-]$/.test(s)) { if (s.endsWith("-")) negative = !negative; s = s.slice(0, -1).trim(); }

  // Some systems group with spaces, including non-breaking ones pasted from a sheet.
  s = s.replace(/[\s  ]/g, "");
  if (!/^[\d.,]*\d[\d.,]*$/.test(s)) {
    return {ok: false, reason: `"${raw.trim()}" is not a number`};
  }

  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  let decimalAt = -1;
  if (lastComma >= 0 && lastDot >= 0) {
    // Both present: whichever comes last is the decimal, the other groups.
    decimalAt = Math.max(lastComma, lastDot);
  } else if (lastComma >= 0) {
    const only = s.indexOf(",") === lastComma;
    const after = s.length - lastComma - 1;
    // "1,234": three trailing digits is a thousands group unless the column has
    // shown us otherwise. A three-digit fraction is not a currency amount.
    decimalAt = !only ? -1 : after === 3 ? (opts.decimalComma ? lastComma : -1) : lastComma;
  } else if (lastDot >= 0) {
    const only = s.indexOf(".") === lastDot;
    const after = s.length - lastDot - 1;
    // The same rule as the comma above, for the same reason. "2.500" is two and a
    // half thousand across most of Europe and two and a half nowhere that writes
    // invoices, and a ledger read the second way arrives at a thousandth of its
    // value with every rule downstream running on it. The comma has a way back —
    // a column that proves itself comma-decimal — and the dot has none, because
    // comma-decimal is the only convention the column sniff can report.
    decimalAt = !only ? -1 : after === 3 ? -1 : lastDot;
  }

  const whole = (decimalAt >= 0 ? s.slice(0, decimalAt) : s).replace(/[.,]/g, "");
  const fraction = decimalAt >= 0 ? s.slice(decimalAt + 1).replace(/[.,]/g, "") : "";
  const value = Number(`${whole || "0"}.${fraction || "0"}`);
  if (!Number.isFinite(value)) return {ok: false, reason: `"${raw.trim()}" is not a number`};

  // Guard against -0, which compares equal to 0 but is not identical to it.
  return {ok: true, value: {value: negative && value !== 0 ? -value : value, currency}};
}

/** Currency codes only; anything else is refused rather than passed through. */
function coerceCurrency(raw: string): Coerced<string | undefined> {
  const s = raw.trim();
  if (!s) return {ok: true, value: undefined};
  const symbol = CURRENCY_SYMBOLS[s];
  if (symbol) return {ok: true, value: symbol};
  if (/^[A-Za-z]{2,5}$/.test(s)) return {ok: true, value: s.toUpperCase()};
  return {ok: false, reason: `"${s}" is not a currency code`};
}

// ---------------------------------------------------------------------------
// 4. Import
// ---------------------------------------------------------------------------

const truncate = (s: string, n = 80) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/**
 * What the decoded text says about the encoding the file was actually saved in.
 *
 * An upload is decoded as UTF-8, so a file saved as anything else arrives already
 * damaged. UTF-16 — Excel's "Unicode Text", and the default from several ERPs —
 * pads every letter with a NUL and no header row survives it, so the import
 * complains about column names when the column names were never the problem.
 * Latin-1 is the worse case because it succeeds: "Café Fresnel" comes through as
 * "Caf<?> Fresnel", which is a different supplier to every rule that compares
 * names, and the finished report gives no sign of it. Neither is repairable from
 * here and both have the same one-line fix at the other end.
 */
function encodingFault(text: string): ImportError | null {
  const nul = text.indexOf("\u0000");
  const lost = text.indexOf("\ufffd");
  if (nul < 0 && lost < 0) return null;

  const at = nul < 0 ? lost : lost < 0 ? nul : Math.min(nul, lost);
  const line = text.slice(0, at).split(/\r\n|\r|\n/).length;
  const from = Math.max(text.lastIndexOf("\n", at), text.lastIndexOf("\r", at)) + 1;
  return {
    row: line,
    column: "(file)",
    // Shown with the unreadable characters marked, because they have no glyph and
    // a line the user cannot see is a line they cannot check.
    value: truncate(text.slice(from, from + 200).replace(/[\u0000\ufffd]/g, "?")),
    reason: nul >= 0
      ? "this file is not UTF-8: every letter is padded with a NUL byte, which is what UTF-16 looks like read as UTF-8 — Excel writes it when you save as \"Unicode Text\". Export it again as CSV UTF-8 and the column names will come back."
      : `this file is not UTF-8: line ${line} has a byte the decoder could not read, so a character is missing and any supplier name around it is no longer the name your system holds. Export it again as CSV UTF-8.`,
  };
}

/**
 * A quote that never closed has already eaten everything after it, so the lines
 * inside it are not records and cannot be reported one at a time. Naming the line
 * the quote opened on and how many lines went with it is the only account of them
 * the user can reconcile against their own system.
 */
function unterminatedQuoteError(rec: CsvRecord): ImportError {
  const open = rec.unterminatedQuote as number;
  // The unclosed field is always the last one, so its newlines are exactly the
  // lines that were swallowed.
  const swallowed = (rec.cells[rec.cells.length - 1] ?? "").split("\n").length - 1;
  const what = swallowed
    ? `so the ${swallowed} lines after it were read as part of this row rather than as invoices`
    : "so the rest of the file was read as part of this row";
  return {
    row: open,
    column: "(row)",
    value: truncate(rec.cells.join(",")),
    reason: `a quoted value opened on line ${open} and never closed, ${what}. Close the quote or take it out, and import again.`,
  };
}

export function importCsv(text: string, options: ImportOptions = {}): ImportResult {
  const encoding = encodingFault(text);
  if (encoding) {
    return {rows: [], mapping: suggestMapping([]), unmapped: [], errors: [encoding]};
  }

  const records = parseCsvRecords(text);
  if (!records.length) {
    return {
      rows: [],
      mapping: suggestMapping([]),
      unmapped: [],
      errors: [{row: 0, column: "(file)", value: "", reason: "the file has no rows, so there is nothing to map or import"}],
    };
  }

  const header = records[0];
  // A quote that opened in the header row took the whole file with it, and there
  // is no header left to map. Saying so beats four complaints about columns that
  // are sitting there in the file, unreadable through no fault of their names.
  if (header.unterminatedQuote !== undefined) {
    return {rows: [], mapping: suggestMapping([]), unmapped: [], errors: [unterminatedQuoteError(header)]};
  }
  const headers = header.cells;
  const mapping = suggestMapping(headers, options.mapping);
  const errors: ImportError[] = [];

  const claimed = new Set(FIELDS.map((f) => mapping[f].column).filter((c): c is number => c !== null));
  const unmapped = headers
    .map((h, i) => (claimed.has(i) ? null : h.trim() || `(unnamed column ${i + 1})`))
    .filter((h): h is string => h !== null);

  // Stop on a missing required field rather than emit the same failure once per
  // row. Ten thousand identical errors is not a report, it is a wall.
  const missing = REQUIRED.filter((f) => mapping[f].column === null);
  if (missing.length) {
    for (const field of missing) {
      errors.push({
        row: header.line, column: field, value: truncate(headers.join(",")),
        reason: `${field} has no column: ${mapping[field].reason}. Confirm the mapping and import again.`,
      });
    }
    return {rows: [], mapping, unmapped, errors};
  }

  const body = records.slice(1);
  const at = (rec: CsvRecord, column: number | null) =>
    (column === null ? "" : rec.cells[column] ?? "").trim();
  const readable = body.filter((rec) => rec.unterminatedQuote === undefined);

  // A file can contradict the order it was given: 25/12 cannot be month-first
  // however the upload form was set. Applying the hint anyway reads that row
  // day-first and every other row month-first, so one ledger carries two
  // conventions and most of its dates are out by months — which is the error this
  // importer asks the question to avoid. One of the two is wrong and the file
  // cannot say which, so it stops here rather than importing half a right answer.
  const dateColumn = mapping.invoiceDate.column as number;
  if (options.dateOrder) {
    const said = options.dateOrder === "dmy" ? "day-first" : "month-first";
    const against = readable
      .map((rec) => ({line: rec.line, value: at(rec, dateColumn)}))
      .filter((cell) => {
        const forced = forcedOrder(cell.value);
        return forced !== null && forced !== options.dateOrder;
      });
    if (against.length) {
      const others = against.length - 1;
      errors.push({
        row: against[0].line,
        column: headers[dateColumn] || "invoiceDate",
        value: against[0].value,
        reason: `this import was told the file is ${said}, but "${against[0].value}" on line ${against[0].line} cannot be${others ? `, and nor can ${others} other date${others === 1 ? "" : "s"} in this column` : ""}. The rest of the column would still be read ${said}, so the ledger would carry both conventions and most of its dates would be out by months. Check which way round the export writes them and import again.`,
      });
      return {rows: [], mapping, unmapped, errors};
    }
  }

  const amountColumn = mapping.amount.column as number;
  const decimalComma = sniffDecimalComma(readable.map((r) => at(r, amountColumn)));

  const rows: Invoice[] = [];
  for (const rec of body) {
    const headerOf = (field: Field) => headers[mapping[field].column as number] || field;
    const fail = (field: Field, value: string, reason: string) =>
      errors.push({row: rec.line, column: headerOf(field), value, reason: `${field}: ${reason}`});

    // Everything from the unclosed quote onwards is inside this record's last
    // cell, so its columns mean nothing: importing it would hand this invoice a
    // bank account belonging to a supplier three rows down.
    if (rec.unterminatedQuote !== undefined) {
      errors.push(unterminatedQuoteError(rec));
      continue;
    }

    // A trailing delimiter is a formatting quirk every second ERP has; a row that
    // is genuinely short or long has shifted columns, and every value in it is
    // then suspect, so it is reported rather than half-read.
    let cells = rec.cells;
    if (cells.length === headers.length + 1 && cells[cells.length - 1] === "") {
      cells = cells.slice(0, -1);
    }
    if (cells.length !== headers.length) {
      errors.push({
        row: rec.line, column: "(row)", value: truncate(rec.cells.join(",")),
        reason: `this row has ${cells.length} values but the header has ${headers.length}, so the columns no longer line up`,
      });
      continue;
    }
    const view: CsvRecord = {cells, line: rec.line};

    const before = errors.length;

    const vendorName = at(view, mapping.vendorName.column);
    if (!vendorName) fail("vendorName", "", "the supplier name is blank");

    const invoiceNumber = at(view, mapping.invoiceNumber.column);
    if (!invoiceNumber) fail("invoiceNumber", "", "the invoice number is blank");

    const rawDate = at(view, mapping.invoiceDate.column);
    const date = parseDate(rawDate, options.dateOrder);
    if (!date.ok) fail("invoiceDate", rawDate, date.reason);

    const rawAmount = at(view, amountColumn);
    const amount = parseAmount(rawAmount, {decimalComma});
    if (!amount.ok) fail("amount", rawAmount, amount.reason);

    const rawCurrency = at(view, mapping.currency.column);
    const currency = coerceCurrency(rawCurrency);
    if (!currency.ok) fail("currency", rawCurrency, currency.reason);

    // Every problem in the row is reported in one pass. Fixing an export one
    // error per re-run is how people give up on an import tool.
    if (errors.length > before) continue;

    const reference = at(view, mapping.reference.column);
    // Optional and frequently decorative: "****1234", "N/A", "Acct 8842". Take the
    // digits if there are any, otherwise leave it off — an absent optional field
    // is not a broken row.
    const bankDigits = at(view, mapping.bankLast4.column).replace(/\D/g, "");

    rows.push({
      // The source export has no id column, so the physical line number is the
      // row's identity: unique, stable across re-runs, and something a person can
      // actually find in the file they exported.
      id: `row-${view.line}`,
      vendorName,
      invoiceNumber,
      invoiceDate: (date as {ok: true; value: string}).value,
      amount: (amount as {ok: true; value: {value: number; currency?: string}}).value.value,
      currency:
        (currency as {ok: true; value: string | undefined}).value ??
        (amount as {ok: true; value: {value: number; currency?: string}}).value.currency ??
        options.defaultCurrency ??
        "GBP",
      ...(reference ? {reference} : {}),
      ...(bankDigits ? {bankLast4: bankDigits.slice(-4)} : {}),
    });
  }

  if (mapping.currency.column === null && !options.defaultCurrency) {
    mapping.currency.reason +=
      "; with no currency column, rows fall back to any symbol in the amount and then to GBP — pass defaultCurrency to change that";
  }

  return {rows, mapping, unmapped, errors};
}

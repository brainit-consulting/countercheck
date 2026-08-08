import {describe, expect, it} from "vitest";
import {generateLedger, toCsv} from "../src/demo/generate";
import {detect} from "../src/detection/engine";
import {
  FIELDS, importCsv, parseAmount, parseCsv, parseCsvRecords, parseDate, suggestMapping,
} from "../src/import/csv";

const ledger = generateLedger();

const HEADER = "Supplier Name,Invoice No,Invoice Date,Net Amount,Currency,Reference,Bank Acc (last 4)";
const csv = (...lines: string[]) => [HEADER, ...lines].join("\n");
const withoutId = ({id, ...rest}: {id: string}) => rest;

describe("parsing", () => {
  it("keeps a comma inside a quoted field", () => {
    const [row] = parseCsv('"Harlow Print Services, Ltd",HAR-4471');
    expect(row).toEqual(["Harlow Print Services, Ltd", "HAR-4471"]);
  });

  it("unescapes doubled quotes", () => {
    const [row] = parseCsv('a,"PO ""urgent"" 8812",c');
    expect(row[1]).toBe('PO "urgent" 8812');
  });

  it("reads CRLF, LF and a lone CR as the same thing", () => {
    const expected = [["a", "b"], ["c", "d"]];
    expect(parseCsv("a,b\r\nc,d")).toEqual(expected);
    expect(parseCsv("a,b\nc,d")).toEqual(expected);
    expect(parseCsv("a,b\rc,d")).toEqual(expected);
  });

  it("strips a UTF-8 BOM instead of gluing it to the first header", () => {
    expect(parseCsv("﻿Supplier Name,Invoice No")[0][0]).toBe("Supplier Name");
  });

  it("drops blank and whitespace-only trailing lines", () => {
    expect(parseCsv("a,b\nc,d\n\n   \n\n")).toEqual([["a", "b"], ["c", "d"]]);
  });

  it("keeps the last row when the file does not end in a newline", () => {
    expect(parseCsv("a,b\nc,d")).toHaveLength(2);
  });

  it("trims padding around unquoted fields but not inside quoted ones", () => {
    expect(parseCsv('  a  ,  b  ')[0]).toEqual(["a", "b"]);
    expect(parseCsv('"  a  ",  "b"  ')[0]).toEqual(["  a  ", "b"]);
  });

  it("treats a quote inside an unquoted field as data", () => {
    expect(parseCsv('12" copper pipe,20.00')[0][0]).toBe('12" copper pipe');
  });

  it("treats a quote after a closing one as data rather than opening a second field", () => {
    // `"Bracket 12" x 4"` is an export that quoted a description and forgot to
    // double the inch mark. Read as an opening quote, that last character hands
    // every remaining line of the file to this one cell.
    const records = parseCsvRecords('a,b\n"Bracket 12" x 4",second\nc,d');
    expect(records).toHaveLength(3);
    expect(records[1].cells).toEqual(['Bracket 12 x 4"', "second"]);
    expect(records[2].cells).toEqual(["c", "d"]);
  });

  it("marks a record whose quote never closed with the line the quote opened on", () => {
    const records = parseCsvRecords('h1,h2\na,"one\nb,c');
    expect(records).toHaveLength(2);
    expect(records[1].unterminatedQuote).toBe(2);
    expect(records[0].unterminatedQuote).toBeUndefined();
  });

  it("preserves a ragged row rather than padding it", () => {
    expect(parseCsv("a,b,c\nd,e")).toEqual([["a", "b", "c"], ["d", "e"]]);
  });

  it("counts physical lines, so a multi-line quoted field does not shift the numbering", () => {
    const records = parseCsvRecords('h1,h2\na,"one\ntwo"\nb,c');
    expect(records.map((r) => r.line)).toEqual([1, 2, 4]);
    expect(records[1].cells[1]).toBe("one\ntwo");
  });
});

describe("round trip through the demo export", () => {
  const imported = importCsv(toCsv(ledger.rows));

  it("recovers every invoice, field for field", () => {
    expect(imported.errors).toEqual([]);
    expect(imported.rows).toHaveLength(ledger.rows.length);
    expect(imported.rows.map(withoutId)).toEqual(ledger.rows.map(withoutId));
  });

  it("maps all seven fields confidently and leaves nothing unaccounted for", () => {
    for (const field of FIELDS) {
      expect(imported.mapping[field].column, `${field} unmapped`).not.toBeNull();
      expect(imported.mapping[field].confidence, field).toBeGreaterThanOrEqual(0.9);
    }
    expect(imported.unmapped).toEqual([]);
  });

  it("gives every row a stable, unique identity even though the export has no id column", () => {
    const ids = imported.rows.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(importCsv(toCsv(ledger.rows)).rows.map((r) => r.id)).toEqual(ids);
  });

  it("survives CRLF line endings and a BOM the same way", () => {
    const messyEncoding = `﻿${toCsv(ledger.rows).split("\n").join("\r\n")}\r\n`;
    expect(importCsv(messyEncoding).rows.map(withoutId)).toEqual(imported.rows.map(withoutId));
  });

  /**
   * The point of the import layer is that detection sees the same ledger it would
   * have seen in memory. Comparing field values proves the parse; running the
   * engine over the result proves nothing was lost that the rules depend on.
   */
  it("feeds detection a ledger that finds the same problems", () => {
    const fromCsv = detect(imported.rows);
    expect(fromCsv.findings).toHaveLength(ledger.planted.length);
    expect(fromCsv.summary).toEqual({...detect(ledger.rows).summary});
  });
});

describe("column mapping", () => {
  it("recognises the header names real exports actually use", () => {
    const variants: [string[], Record<string, string>][] = [
      [
        ["Payee", "Invoice #", "Doc Date", "Gross", "Currency", "PO Number", "Bank Acc (last 4)"],
        {vendorName: "Payee", invoiceNumber: "Invoice #", invoiceDate: "Doc Date", amount: "Gross"},
      ],
      [
        ["Vendor Name", "Document Number", "Posting Date", "Value", "CCY", "Narrative", "Last 4"],
        {vendorName: "Vendor Name", invoiceNumber: "Document Number", invoiceDate: "Posting Date", amount: "Value"},
      ],
      [
        ["Supplier", "Invoice No", "Invoice Date", "Net Amount", "Currency", "Description", "Bank Account (last 4)"],
        {vendorName: "Supplier", invoiceNumber: "Invoice No", invoiceDate: "Invoice Date", amount: "Net Amount"},
      ],
    ];
    for (const [headers, expected] of variants) {
      const mapping = suggestMapping(headers);
      for (const [field, header] of Object.entries(expected)) {
        expect(mapping[field as keyof typeof mapping].header, `${headers[0]} export`).toBe(header);
      }
    }
  });

  it("explains every choice, including the ones it could not make", () => {
    const mapping = suggestMapping(["Payee", "Invoice #", "Doc Date", "Gross", "Cost Centre"]);
    for (const field of FIELDS) {
      expect(mapping[field].reason.length, field).toBeGreaterThan(20);
    }
    // Unclaimed fields still have to say what the nearest miss was.
    expect(mapping.bankLast4.column).toBeNull();
    expect(mapping.bankLast4.reason).toMatch(/no column/i);
  });

  it("names the runner-up when two columns both look right", () => {
    const mapping = suggestMapping(
      ["Doc Date", "Invoice Date", "Amount", "Vendor", "Invoice No", "Currency", "Reference"]);
    expect(mapping.invoiceDate.header).toBe("Invoice Date");
    expect(mapping.invoiceDate.reason).toContain("Doc Date");
    // A near-tie is real doubt and the confidence has to show it.
    expect(mapping.invoiceDate.confidence).toBeLessThan(0.9);
  });

  it("prefers the invoice total over a tax column", () => {
    const mapping = suggestMapping(["Supplier", "Invoice No", "Invoice Date", "VAT Amount", "Net Amount"]);
    expect(mapping.amount.header).toBe("Net Amount");
  });

  it("lists columns it did not claim", () => {
    const result = importCsv(`Supplier Name,Invoice No,Invoice Date,Net Amount,Cost Centre,Approver\nA,B,2026-03-04,1.00,CC-1,Jo`);
    expect(result.unmapped).toEqual(["Cost Centre", "Approver"]);
  });

  it("labels a blank header rather than listing an empty string", () => {
    const result = importCsv(`Supplier Name,Invoice No,Invoice Date,Net Amount,\nA,B,2026-03-04,1.00,x`);
    expect(result.unmapped).toEqual(["(unnamed column 5)"]);
  });

  it("lets the user override a guess", () => {
    const headers = "Doc Date,Invoice Date,Net Amount,Vendor,Invoice No,Currency,Reference";
    const result = importCsv(`${headers}\n2026-03-04,2026-04-01,100.00,Northgate,N-1,GBP,PO-1`,
      {mapping: {invoiceDate: "Doc Date"}});
    expect(result.mapping.invoiceDate.header).toBe("Doc Date");
    expect(result.mapping.invoiceDate.confidence).toBe(1);
    expect(result.mapping.invoiceDate.reason).toMatch(/you chose/);
    expect(result.rows[0].invoiceDate).toBe("2026-03-04");
    expect(result.unmapped).toContain("Invoice Date");
  });

  it("says so when an override names a column that is not there", () => {
    const result = importCsv(csv("A,B,2026-03-04,1.00,GBP,,1234"), {mapping: {amount: "Total Ex VAT"}});
    expect(result.mapping.amount.column).toBeNull();
    expect(result.errors[0].reason).toMatch(/Total Ex VAT/);
  });

  /**
   * "Invoice No" scores 0.47 as an invoice date — above the claim threshold, but
   * invoiceNumber has stronger evidence for it. Saying the nearest miss fell
   * "below the threshold" would be a lie the user can check, and an explanation
   * that is wrong costs more trust than no explanation at all.
   */
  it("distinguishes a field with no candidate from one whose column was taken", () => {
    const mapping = suggestMapping(["Supplier Name", "Invoice No", "Net Amount"]);
    expect(mapping.invoiceDate.column).toBeNull();
    expect(mapping.invoiceDate.reason).toMatch(/stronger match for invoiceNumber/);
    expect(mapping.invoiceDate.reason).not.toMatch(/below the/);
    expect(mapping.bankLast4.reason).toMatch(/no column in this header row resembles/);
  });

  /**
   * "Invoice Reference" reads a shade better as a reference than as an invoice
   * number, and on a four-column export there is nothing else for either to take.
   * Letting the optional field win refuses a file that had a perfectly good
   * assignment, so the required field takes the column and reference does without.
   */
  it("takes a column back from an optional field when a required one has none", () => {
    const mapping = suggestMapping(["Vendor", "Invoice Reference", "Doc Date", "Net"]);
    expect(mapping.invoiceNumber.column).toBe(1);
    expect(mapping.reference.column).toBeNull();
    // And says so honestly: reference did not lose on the evidence, it lost on rank.
    expect(mapping.reference.reason).toMatch(/invoiceNumber/);
    expect(mapping.reference.reason).not.toMatch(/stronger match/);

    const result = importCsv("Vendor,Invoice Reference,Doc Date,Net\nNorthgate,INV-1,2026-03-04,100.00");
    expect(result.errors).toEqual([]);
    expect(result.rows[0].invoiceNumber).toBe("INV-1");
  });

  it("leaves the displaced field to compete for what is left", () => {
    const mapping = suggestMapping(["Vendor", "Invoice Reference", "Doc Date", "Net", "Payment Details"]);
    expect(mapping.invoiceNumber.header).toBe("Invoice Reference");
    expect(mapping.reference.header).toBe("Payment Details");
  });

  it("does not take a column from another required field", () => {
    // Both invoiceNumber and invoiceDate want "Invoice No" here. That is a real
    // conflict with no free answer, and the user has to settle it.
    const mapping = suggestMapping(["Supplier Name", "Invoice No", "Net Amount"]);
    expect(mapping.invoiceNumber.column).toBe(1);
    expect(mapping.invoiceDate.column).toBeNull();
  });

  it("reports a missing required column once, not once per row", () => {
    const result = importCsv("Supplier Name,Invoice No,Net Amount\nA,B,1.00\nC,D,2.00\nE,F,3.00");
    expect(result.rows).toEqual([]);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].column).toBe("invoiceDate");
  });
});

describe("dates", () => {
  const resolved: [string, string | undefined, string][] = [
    ["2026-03-04", undefined, "2026-03-04"],
    ["2026/03/04", undefined, "2026-03-04"],
    ["20260304", undefined, "2026-03-04"],
    ["04/03/2026", "dmy", "2026-03-04"],
    ["03/04/2026", "mdy", "2026-03-04"],
    ["04.03.2026", "dmy", "2026-03-04"],
    ["4 Mar 2026", undefined, "2026-03-04"],
    ["4 March 2026", undefined, "2026-03-04"],
    ["4-Mar-2026", undefined, "2026-03-04"],
    ["4-Mar-26", undefined, "2026-03-04"],
    ["Mar 4, 2026", undefined, "2026-03-04"],
    ["March 4 2026", undefined, "2026-03-04"],
    // Anything with a SQL database behind it stamps midnight onto every date.
    ["2026-03-04 00:00:00", undefined, "2026-03-04"],
    ["2026-03-04T00:00:00", undefined, "2026-03-04"],
    ["2026-03-04T09:31:00.000Z", undefined, "2026-03-04"],
    ["2026-03-04 09:31:00+01:00", undefined, "2026-03-04"],
    ["04/03/2026 09:31", "dmy", "2026-03-04"],
    ["4 Mar 2026 09:31", undefined, "2026-03-04"],
    // A day above twelve settles the order without any hint at all.
    ["25/12/2026", undefined, "2026-12-25"],
    ["12/25/2026", undefined, "2026-12-25"],
    // Identical components read the same either way, so this is not ambiguous.
    ["03/03/2026", undefined, "2026-03-03"],
  ];
  for (const [input, order, expected] of resolved) {
    it(`reads "${input}"${order ? ` as ${order}` : ""} as ${expected}`, () => {
      const result = parseDate(input, order as "dmy" | "mdy" | undefined);
      expect(result.ok && result.value, result.ok ? "" : result.reason).toBe(expected);
    });
  }

  it("refuses to guess a genuinely ambiguous date and says what both readings would be", () => {
    const result = parseDate("03/04/2026");
    expect(result.ok).toBe(false);
    expect(!result.ok && result.reason).toMatch(/ambiguous/);
    expect(!result.ok && result.reason).toMatch(/April/);
    expect(!result.ok && result.reason).toMatch(/March/);
  });

  const rejected: [string, RegExp][] = [
    ["30/02/2026", /not a real date/],
    ["13/13/2026", /no valid month/],
    ["", /blank/],
    ["not-a-date", /not a date format/],
    ["4 Smarch 2026", /does not name a month/],
  ];
  for (const [input, reason] of rejected) {
    it(`rejects "${input}"`, () => {
      const result = parseDate(input, "dmy");
      expect(result.ok).toBe(false);
      expect(!result.ok && result.reason).toMatch(reason);
    });
  }

  it("quotes the cell as the file has it, timestamp and all, when the date is not real", () => {
    // The time is dropped to read the date; it is not dropped from the complaint,
    // because the user has to find this cell in an editor.
    const result = parseDate("2026-02-30 09:31");
    expect(result.ok).toBe(false);
    expect(!result.ok && result.reason).toContain("2026-02-30 09:31");
  });
});

describe("amounts", () => {
  const cases: [string, number, string | undefined][] = [
    ["1,234.56", 1234.56, undefined],
    ["£1,234.56", 1234.56, "GBP"],
    ["$1,234.56", 1234.56, "USD"],
    ["€1.234,56", 1234.56, "EUR"],
    ["USD 1,234.56", 1234.56, "USD"],
    ["(1,234.56)", -1234.56, undefined],
    ["(£1,234.56)", -1234.56, "GBP"],
    ["-1,234.56", -1234.56, undefined],
    ["1,234.56-", -1234.56, undefined],
    ["1,234.56 CR", -1234.56, undefined],
    ["1234.56CR", -1234.56, undefined],
    ["1234.56 DR", 1234.56, undefined],
    ["1234,56", 1234.56, undefined],
    ["1 234,56", 1234.56, undefined],
    ["1.234.567,89", 1234567.89, undefined],
    // A lone comma with three digits behind it is a thousands group; a three-digit
    // fraction is not a currency amount.
    ["1,234", 1234, undefined],
    ["1,234,567", 1234567, undefined],
    ["0.00", 0, undefined],
    ["1234", 1234, undefined],
  ];
  for (const [input, expected, currency] of cases) {
    it(`reads "${input}" as ${expected}`, () => {
      const result = parseAmount(input);
      expect(result.ok && result.value.value, result.ok ? "" : result.reason).toBe(expected);
      if (currency) expect(result.ok && result.value.currency).toBe(currency);
    });
  }

  for (const bad of ["", "N/A", "-", "see attached", "1.2.3.4.5x"]) {
    it(`rejects "${bad}" rather than turning it into a number`, () => {
      expect(parseAmount(bad).ok).toBe(false);
    });
  }

  const value = (raw: string, opts?: {decimalComma?: boolean}) => {
    const result = parseAmount(raw, opts);
    return result.ok ? result.value.value : result.reason;
  };

  it("reads a lone separator with three digits behind it as a thousands group, comma or dot", () => {
    // Whichever character is doing it, a three-digit fraction is not a currency
    // amount. Reading 2.500 as two and a half imports a European ledger at a
    // thousandth of its value and every rule downstream then runs on that.
    expect(value("1,500")).toBe(1500);
    expect(value("1.500")).toBe(1500);
    expect(value("12.750")).toBe(12750);
  });

  it("lets the rest of the column turn that separator into a decimal", () => {
    // "1,234" is 1234 in a British column and 1.234 in a German one, and only the
    // other cells in the column can say which.
    expect(value("1,234")).toBe(1234);
    expect(value("1,234", {decimalComma: true})).toBe(1.234);
    // In that same German column the dot is the thousands separator, not a decimal.
    expect(value("1.234", {decimalComma: true})).toBe(1234);
  });

  it("applies the column's decimal convention across the import", () => {
    const result = importCsv(csv(
      'Northgate,HAR-50,2026-03-04,"1.234,56",EUR,PO-50,1234',
      'Northgate,HAR-51,2026-03-05,"99,95",EUR,PO-51,1234',
      'Northgate,HAR-52,2026-03-06,"2.500",EUR,PO-52,1234',
      'Northgate,HAR-53,2026-03-07,"2,500",EUR,PO-53,1234',
    ));
    expect(result.errors).toEqual([]);
    expect(result.rows.map((r) => r.amount)).toEqual([1234.56, 99.95, 2500, 2.5]);
  });

  it("imports a European column of whole thousands at its full value", () => {
    const result = importCsv(csv(
      "Northgate,HAR-1,2026-03-04,1.500,EUR,PO-1,1234",
      "Northgate,HAR-2,2026-03-05,2.000,EUR,PO-2,1234",
      "Northgate,HAR-3,2026-03-06,12.750,EUR,PO-3,1234",
    ));
    expect(result.errors).toEqual([]);
    expect(result.rows.map((r) => r.amount)).toEqual([1500, 2000, 12750]);
  });

  it("does not flip a thousands-comma column on one hand-typed European figure", () => {
    // "1,50" is the only cell here that votes at all, and one cell is not a column
    // convention — reading the other three as European loses three thousand pounds.
    const result = importCsv(csv(
      'Northgate,HAR-1,2026-03-04,"1,50",GBP,PO-1,1234',
      'Northgate,HAR-2,2026-03-05,"1,234",GBP,PO-2,1234',
      'Northgate,HAR-3,2026-03-06,"2,500",GBP,PO-3,1234',
      'Northgate,HAR-4,2026-03-07,"12,000",GBP,PO-4,1234',
    ));
    expect(result.errors).toEqual([]);
    expect(result.rows.map((r) => r.amount)).toEqual([1.5, 1234, 2500, 12000]);
  });
});

describe("messy exports", () => {
  it("reports a malformed row instead of dropping it, and imports the rest", () => {
    const result = importCsv(csv(
      "Northgate Facilities,HAR-20,2026-03-04,100.00,GBP,PO-20,1234",
      "Northgate Facilities,HAR-21,2026-03-04",
      "Northgate Facilities,HAR-22,2026-03-04,300.00,GBP,PO-22,1234",
    ));
    expect(result.rows.map((r) => r.invoiceNumber)).toEqual(["HAR-20", "HAR-22"]);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].row).toBe(3);
    expect(result.errors[0].column).toBe("(row)");
    expect(result.errors[0].reason).toMatch(/3 values but the header has 7/);
    expect(result.errors[0].value).toContain("HAR-21");
  });

  it("tolerates a trailing delimiter, which is formatting rather than a shifted row", () => {
    const result = importCsv(csv("Northgate,HAR-30,2026-03-04,100.00,GBP,PO-30,1234,"));
    expect(result.errors).toEqual([]);
    expect(result.rows[0].invoiceNumber).toBe("HAR-30");
  });

  it("flags an ambiguous date against its row rather than guessing", () => {
    const result = importCsv(csv("Northgate,HAR-40,03/04/2026,100.00,GBP,PO-40,1234"));
    expect(result.rows).toEqual([]);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatchObject({row: 2, column: "Invoice Date", value: "03/04/2026"});
    expect(result.errors[0].reason).toMatch(/ambiguous/);
  });

  it("imports that same row once the user says which order the file uses", () => {
    const text = csv("Northgate,HAR-40,03/04/2026,100.00,GBP,PO-40,1234");
    expect(importCsv(text, {dateOrder: "dmy"}).rows[0].invoiceDate).toBe("2026-04-03");
    expect(importCsv(text, {dateOrder: "mdy"}).rows[0].invoiceDate).toBe("2026-03-04");
  });

  const twoConventions = csv(
    "Northgate,HAR-40,03/04/2026,100.00,GBP,PO-40,1234",
    "Northgate,HAR-41,25/12/2026,200.00,GBP,PO-41,1234",
    "Northgate,HAR-42,05/06/2026,300.00,GBP,PO-42,1234",
  );

  it("refuses a file whose own dates contradict the order it was given", () => {
    // 25/12 cannot be month-first, so a month-first import reads that row day-first
    // and the other two month-first: one ledger, two conventions, no complaint.
    const result = importCsv(twoConventions, {dateOrder: "mdy"});
    expect(result.rows).toEqual([]);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatchObject({row: 3, column: "Invoice Date", value: "25/12/2026"});
    expect(result.errors[0].reason).toMatch(/month-first/);
  });

  it("imports that file the moment the order matches what its dates say", () => {
    const result = importCsv(twoConventions, {dateOrder: "dmy"});
    expect(result.errors).toEqual([]);
    expect(result.rows.map((r) => r.invoiceDate)).toEqual(["2026-04-03", "2026-12-25", "2026-06-05"]);
  });

  it("keeps every invoice when one description carries an inch mark", () => {
    // The unescaped quote used to reopen the field and swallow the four rows after
    // it — 1,400 of the 1,500 in this file, gone, with an empty error list.
    const result = importCsv([
      "Supplier,Invoice No,Invoice Date,Amount,Description",
      'Northgate Facilities,HAR-1,2026-03-04,100.00,"Bracket 12" x 4"',
      "Harlow Print,HAR-2,2026-03-05,200.00,Letterheads",
      "Kestrel Logistics,HAR-3,2026-03-06,300.00,Pallet delivery",
      "Ashworth Legal,HAR-4,2026-03-07,400.00,Retainer",
      "Pinefield Catering,HAR-5,2026-03-08,500.00,Board lunch",
    ].join("\n"));
    expect(result.errors).toEqual([]);
    expect(result.rows.map((r) => r.invoiceNumber)).toEqual(["HAR-1", "HAR-2", "HAR-3", "HAR-4", "HAR-5"]);
    expect(result.rows.reduce((total, r) => total + r.amount, 0)).toBe(1500);
  });

  it("reports a quote that never closes instead of importing the row it damaged", () => {
    // The quote opens in HAR-1's bank column, so the next two invoices are read as
    // part of that one cell. Importing HAR-1 anyway gives it Kestrel's bank digits.
    const result = importCsv(csv(
      'Northgate,HAR-1,2026-03-04,100.00,GBP,PO-1,"1234',
      "Harlow Print,HAR-2,2026-03-05,200.00,GBP,PO-2,8842",
      "Kestrel Logistics,HAR-3,2026-03-06,300.00,GBP,PO-3,9911",
    ));
    expect(result.rows).toEqual([]);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].row).toBe(2);
    expect(result.errors[0].reason).toMatch(/never closed/);
    expect(result.errors[0].reason).toMatch(/2 lines after it/);
  });

  it("blames the quote, not the header row, when the quote opens in the header", () => {
    const result = importCsv('Supplier Name,"Invoice No,Invoice Date,Net Amount\nNorthgate,HAR-1,2026-03-04,100.00');
    expect(result.rows).toEqual([]);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].reason).toMatch(/never closed/);
    expect(result.errors[0].reason).not.toMatch(/resembles/);
  });

  it("names the encoding when the file is not UTF-8, rather than blaming the header row", () => {
    // Excel's "Unicode Text" save is UTF-16. Decoded as UTF-8 it opens with two
    // replacement characters and pads every letter with a NUL, so all four required
    // columns come back unrecognisable and no amount of remapping will help.
    const utf16 = "\ufffd\ufffdS\u0000u\u0000p\u0000p\u0000l\u0000i\u0000e\u0000r\u0000";
    const result = importCsv(utf16);
    expect(result.rows).toEqual([]);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].reason).toMatch(/UTF-16/);
    expect(result.errors[0].reason).toMatch(/UTF-8/);
  });

  it("refuses a supplier name the decoder mangled rather than importing it", () => {
    // A Latin-1 export leaves U+FFFD where the accent was. "Café Fresnel" arriving
    // as "Caf<?> Fresnel" is a different supplier to every rule that compares
    // names, and the finished report gives no hint that it happened.
    const result = importCsv(csv("Caf\ufffd Fresnel,HAR-1,2026-03-04,100.00,GBP,PO-1,1234"));
    expect(result.rows).toEqual([]);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].row).toBe(2);
    expect(result.errors[0].reason).toMatch(/not UTF-8/);
  });

  it("reports every problem in a row at once", () => {
    const result = importCsv(csv("Northgate,HAR-80,not-a-date,not money,GBP,PO-80,1234"));
    expect(result.errors.map((e) => e.column)).toEqual(["Invoice Date", "Net Amount"]);
    expect(result.errors.every((e) => e.row === 2)).toBe(true);
  });

  it("refuses a blank supplier name or invoice number", () => {
    const result = importCsv(csv(",,2026-03-04,100.00,GBP,PO-90,1234"));
    expect(result.rows).toEqual([]);
    expect(result.errors.map((e) => e.reason)).toEqual([
      "vendorName: the supplier name is blank",
      "invoiceNumber: the invoice number is blank",
    ]);
  });

  it("refuses a currency it cannot read rather than passing it through", () => {
    const result = importCsv(csv("Northgate,HAR-70,2026-03-04,100.00,12345,PO-70,1234"));
    expect(result.rows).toEqual([]);
    expect(result.errors[0].reason).toMatch(/not a currency code/);
  });

  it("cites the physical line even after a multi-line quoted field", () => {
    const result = importCsv([
      HEADER,
      'Northgate,HAR-10,2026-03-04,10.00,GBP,"first line',
      'second line",1234',
      "Northgate,HAR-11,not-a-date,10.00,GBP,PO-11,1234",
    ].join("\n"));
    expect(result.rows[0].reference).toBe("first line\nsecond line");
    expect(result.errors[0].row).toBe(4);
  });

  it("cleans decorative bank references down to four digits, and leaves the field off when there are none", () => {
    const result = importCsv(csv(
      "Northgate,HAR-60,2026-03-04,100.00,GBP,PO-60,****8842",
      "Northgate,HAR-61,2026-03-04,100.00,GBP,PO-61,N/A",
    ));
    expect(result.rows[0].bankLast4).toBe("8842");
    expect(result.rows[1].bankLast4).toBeUndefined();
  });

  it("trims a quoted field's padding before using it, so duplicate detection still matches", () => {
    const result = importCsv(csv('"  Northgate Facilities  ",HAR-3,2026-03-04,10.00,GBP,,'));
    expect(result.rows[0].vendorName).toBe("Northgate Facilities");
    expect(result.rows[0].reference).toBeUndefined();
  });

  it("takes the currency from the amount, then the caller's default, when there is no currency column", () => {
    const header = "Supplier Name,Invoice No,Invoice Date,Net Amount,Reference,Bank Acc (last 4)";
    const result = importCsv([
      header,
      "Northgate,HAR-60,2026-03-04,£100.00,PO-60,1234",
      "Northgate,HAR-61,2026-03-04,100.00,PO-61,1234",
    ].join("\n"), {defaultCurrency: "USD"});
    expect(result.rows.map((r) => r.currency)).toEqual(["GBP", "USD"]);
    expect(result.mapping.currency.column).toBeNull();
  });

  it("says out loud when currency is being defaulted", () => {
    const header = "Supplier Name,Invoice No,Invoice Date,Net Amount";
    const result = importCsv(`${header}\nNorthgate,HAR-62,2026-03-04,100.00`);
    expect(result.rows[0].currency).toBe("GBP");
    expect(result.mapping.currency.reason).toMatch(/defaultCurrency/);
  });

  it("reports an empty file rather than returning a quietly empty ledger", () => {
    const result = importCsv("");
    expect(result.rows).toEqual([]);
    expect(result.errors[0].reason).toMatch(/no rows/);
  });
});

describe("nothing is silently lost", () => {
  const lines = [
    'Northgate Facilities,HAR-100,2026-03-04,"1,234.56",GBP,PO-100,1234',
    "Harlow Print,HAR-101,4 Mar 2026,(500.00),GBP,,8842",
    "Kestrel Logistics,HAR-102,03/04/2026,100.00,GBP,,1234",
    "Ashworth Legal,HAR-103,2026-03-06",
    "Pinefield Catering,HAR-104,2026-03-07,not money,GBP,,1234",
    '  Verity Recruitment  ,HAR-105,2026-03-08,"£2 500,00",EUR,,1234',
  ];
  const result = importCsv(csv(...lines) + "\n\n");

  it("accounts for every data line as either a row or an error", () => {
    const accountedFor = new Set([
      ...result.rows.map((r) => Number(r.id.replace("row-", ""))),
      ...result.errors.map((e) => e.row),
    ]);
    // Header is line 1, so the data occupies lines 2 to 7.
    expect([...accountedFor].sort((a, b) => a - b)).toEqual([2, 3, 4, 5, 6, 7]);
  });

  it("keeps the rows it could read intact", () => {
    expect(result.rows.map((r) => [r.invoiceNumber, r.invoiceDate, r.amount])).toEqual([
      ["HAR-100", "2026-03-04", 1234.56],
      ["HAR-101", "2026-03-04", -500],
      ["HAR-105", "2026-03-08", 2500],
    ]);
    expect(result.rows[2].vendorName).toBe("Verity Recruitment");
  });

  it("gives each rejected row a row number, a column, the offending value and a reason", () => {
    expect(result.errors).toHaveLength(3);
    for (const e of result.errors) {
      expect(e.row).toBeGreaterThan(1);
      expect(e.column.length).toBeGreaterThan(0);
      expect(e.reason.length).toBeGreaterThan(15);
    }
    expect(result.errors.map((e) => e.row)).toEqual([4, 5, 6]);
  });
});

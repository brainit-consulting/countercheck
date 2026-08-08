/** One line from an accounts-payable export, after column mapping. */
export type Invoice = {
  /** Row identity from the source export. Stable across re-runs. */
  id: string;
  vendorName: string;
  invoiceNumber: string;
  /** ISO date, yyyy-mm-dd. */
  invoiceDate: string;
  /** Positive for a payable, negative for a credit note. */
  amount: number;
  currency: string;
  /** PO number, description, or whatever the export carries. Optional. */
  reference?: string;
  /** Last four of the bank account the payment went to, when the export has it. */
  bankLast4?: string;
};

export type RuleId =
  | "exact-duplicate"
  | "rekeyed-duplicate"
  | "vendor-spelling-duplicate"
  | "amount-transposition"
  | "unapplied-credit"
  | "bank-detail-change"
  | "round-number-outlier";

export type Severity = "high" | "medium" | "low";

export type Finding = {
  ruleId: RuleId;
  severity: Severity;
  /** Money genuinely at risk if this finding is real. Drives the review queue order. */
  amountAtStake: number;
  /** The rows a human needs to look at, always in the order they should be read. */
  invoiceIds: string[];
  /**
   * One sentence a non-accountant can act on. Every finding accuses someone's
   * paperwork of being wrong, so it has to say what it saw, not just that it
   * scored highly.
   */
  explanation: string;
};

export type DetectionOptions = {
  /** How far apart two same-amount invoices can sit and still look re-keyed. */
  rekeyWindowDays: number;
  /** Ignore anything below this — noise costs more attention than it saves. */
  minAmount: number;
  /** Round-number rule only fires at or above this. */
  roundNumberThreshold: number;
  /** Vendor-name similarity, 0..1, above which two spellings are treated as one vendor. */
  vendorSimilarity: number;
};

export const DEFAULT_OPTIONS: DetectionOptions = {
  rekeyWindowDays: 21,
  minAmount: 50,
  roundNumberThreshold: 5000,
  vendorSimilarity: 0.86,
};

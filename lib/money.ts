/**
 * One money formatter for the whole product.
 *
 * Two rules it exists to enforce:
 *
 * 1. Never stamp a currency symbol on an amount whose currency you do not know.
 *    The review UI formatted everything as GBP regardless of the row, so a euro
 *    invoice was shown to a finance lead as pounds — a number that is simply
 *    wrong, presented with total confidence.
 *
 * 2. Never throw. Intl.NumberFormat raises RangeError on a currency code it does
 *    not recognise, and an import is perfectly capable of producing one. A whole
 *    detection run dying because a supplier's export said "GBP " is not an
 *    acceptable failure mode, so an unknown code degrades to the plain number
 *    with the code beside it.
 */

const VALID = /^[A-Z]{3}$/;

export function money(amount: number, currency?: string, opts: {round?: boolean} = {}): string {
  const code = (currency || "GBP").trim().toUpperCase();
  const fraction = opts.round ? {maximumFractionDigits: 0} : {minimumFractionDigits: 2, maximumFractionDigits: 2};

  if (VALID.test(code)) {
    try {
      return new Intl.NumberFormat("en-GB", {style: "currency", currency: code, ...fraction}).format(amount);
    } catch {
      /* a well-formed code Intl still refuses: fall through */
    }
  }
  return `${new Intl.NumberFormat("en-GB", fraction).format(amount)} ${code}`;
}

/** For a total whose rows are not all in one currency. */
export const mixed = (amount: number) =>
  `${new Intl.NumberFormat("en-GB", {maximumFractionDigits: 0}).format(amount)} (mixed currencies)`;

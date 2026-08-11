import {describe, expect, it, vi} from "vitest";

/**
 * Finding 38 of the 2026-08-08 review, verified true on 2026-08-11.
 *
 * DESIGN.md said from the first draft that "rejecting opens a required reason
 * field" and that "a rejection without a visible reason is a bug". The manual
 * said the note was optional. The code followed the manual. Three statements of
 * intent, and the weakest one shipped.
 *
 * The rule is checked in the server action rather than only in the form,
 * because a server action is a public endpoint whether or not a button points
 * at it — the same reason the demo reset needed a gate. These tests exercise
 * the action, so a form-only fix would not pass them.
 */

const requireUser = vi.hoisted(() => vi.fn(async () => "reviewer@example.com"));
const recordDecision = vi.hoisted(() => vi.fn(async () => ({id: "l"})));

vi.mock("../lib/session", () => ({requireUser, currentUser: async () => "reviewer@example.com"}));
vi.mock("../lib/owner", () => ({isOwner: async () => false, requireOwner: async () => "x"}));
vi.mock("next/cache", () => ({revalidatePath: () => {}}));
// Stubbed whole, not partially. Importing the real module pulls in lib/db,
// which throws without DATABASE_URL — and this test is about what the action
// refuses to write, not about writing.
vi.mock("../lib/store", () => ({
  recordDecision,
  createLedger: async () => ({id: "l"}),
  discardPending: async () => {},
  listLedgers: async () => [],
  readPending: async () => null,
  resetDemo: async () => ({id: "l"}),
  savePending: async () => "p",
  removeSampleLedgers: async () => {},
  SAMPLE_NAME: "Sample export — Xero-style headers",
}));

const {decide} = await import("../app/actions");

describe("dismissing a finding requires a reason", () => {
  it("refuses a dismissal with no note", async () => {
    await expect(decide("demo", "00000000-0000-4000-8000-000000000000", "k", "rejected"))
      .rejects.toThrow(/needs a reason/i);
  });

  it("refuses a dismissal whose note is only whitespace", async () => {
    await expect(decide("demo", "00000000-0000-4000-8000-000000000000", "k", "rejected", "   "))
      .rejects.toThrow(/needs a reason/i);
  });

  it("accepts a dismissal that says why", async () => {
    recordDecision.mockClear();
    await decide("demo", "00000000-0000-4000-8000-000000000000", "k", "rejected", "Duplicate of PO-4105, already credited.");
    expect(recordDecision).toHaveBeenCalledOnce();
  });

  it("still allows confirming with no note — the evidence is the reason", async () => {
    recordDecision.mockClear();
    await decide("demo", "00000000-0000-4000-8000-000000000000", "k", "accepted");
    expect(recordDecision).toHaveBeenCalledOnce();
  });

  it("still allows reopening with no note", async () => {
    recordDecision.mockClear();
    await decide("demo", "00000000-0000-4000-8000-000000000000", "k", null);
    expect(recordDecision).toHaveBeenCalledOnce();
  });
});

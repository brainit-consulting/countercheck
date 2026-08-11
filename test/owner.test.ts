import {beforeEach, describe, expect, it, vi} from "vitest";

/**
 * The owner check, tested because it now gates something destructive.
 *
 * lib/owner.ts has always said that if this ever gated something that matters
 * it would need "a real role on the user record, checked in one place, with the
 * check tested". It now gates the demo reset, which destroys every decision on
 * the demo ledger and the audit trail with them. The role is still deferred to
 * Part 04; the test is not, because the gap between "we added a check" and "the
 * check works" is where this class of bug lives.
 *
 * `unset means nobody, never everybody` is the case worth having in writing. A
 * missing OWNER_EMAILS on a fresh deployment must not fail open — that would
 * hand the reset back to anonymous visitors on exactly the deployments least
 * likely to be watched.
 */

const currentUser = vi.hoisted(() => vi.fn<() => Promise<string | null>>());
vi.mock("../lib/session", () => ({currentUser}));

/** owner.ts reads OWNER_EMAILS at module load, so each case needs a fresh one. */
async function load(ownerEmails: string | undefined) {
  vi.resetModules();
  if (ownerEmails === undefined) delete process.env.OWNER_EMAILS;
  else process.env.OWNER_EMAILS = ownerEmails;
  return import("../lib/owner");
}

beforeEach(() => {
  currentUser.mockReset();
});

describe("who counts as the owner", () => {
  it("says nobody when OWNER_EMAILS is unset, including for a signed-in person", async () => {
    const {isOwner} = await load(undefined);
    currentUser.mockResolvedValue("someone@example.com");
    expect(await isOwner()).toBe(false);
  });

  it("says nobody when OWNER_EMAILS is empty rather than everybody", async () => {
    const {isOwner} = await load("   ");
    currentUser.mockResolvedValue("someone@example.com");
    expect(await isOwner()).toBe(false);
  });

  it("recognises a listed address regardless of case or surrounding space", async () => {
    const {isOwner} = await load(" Owner@Example.com , second@example.com ");
    currentUser.mockResolvedValue("OWNER@EXAMPLE.COM");
    expect(await isOwner()).toBe(true);
  });

  it("does not treat an unlisted signed-in person as the owner", async () => {
    const {isOwner} = await load("owner@example.com");
    currentUser.mockResolvedValue("stranger@example.com");
    expect(await isOwner()).toBe(false);
  });

  it("does not treat an anonymous visitor as the owner", async () => {
    const {isOwner} = await load("owner@example.com");
    currentUser.mockResolvedValue(null);
    expect(await isOwner()).toBe(false);
  });
});

describe("requireOwner, which is what the reset action calls", () => {
  it("returns the address for the owner", async () => {
    const {requireOwner} = await load("owner@example.com");
    currentUser.mockResolvedValue("owner@example.com");
    expect(await requireOwner()).toBe("owner@example.com");
  });

  it("throws for an anonymous visitor — the case the reset was open to", async () => {
    const {requireOwner} = await load("owner@example.com");
    currentUser.mockResolvedValue(null);
    await expect(requireOwner()).rejects.toThrow(/not signed in/i);
  });

  it("throws for a signed-in person who is not the owner", async () => {
    const {requireOwner} = await load("owner@example.com");
    currentUser.mockResolvedValue("stranger@example.com");
    await expect(requireOwner()).rejects.toThrow(/owner of this instance/i);
  });

  it("throws when OWNER_EMAILS is unset, so a fresh deployment fails closed", async () => {
    const {requireOwner} = await load(undefined);
    currentUser.mockResolvedValue("anyone@example.com");
    await expect(requireOwner()).rejects.toThrow(/owner of this instance/i);
  });
});

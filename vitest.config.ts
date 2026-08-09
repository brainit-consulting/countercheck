import {defineConfig} from "vitest/config";

export default defineConfig({
  test: {
    /**
     * The store tests talk to a real Postgres in us-east-1 over HTTP, and one
     * of them walks ten decisions with a re-read after each — some sixty round
     * trips. The 5s default was always marginal for that and started failing
     * outright on a slower link.
     *
     * The honest fix is a timeout that matches what the test actually does. The
     * alternative — mocking the database to make it fast — would delete the
     * only thing this suite is for, which is checking that what was stored and
     * what was counted agree.
     */
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});

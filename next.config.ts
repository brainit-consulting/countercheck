import type {NextConfig} from "next";

const config: NextConfig = {
  typescript: {ignoreBuildErrors: false},
  experimental: {
    serverActions: {
      /**
       * Server actions accept 1 MB by default, and the CSV upload is a server
       * action. The upload screen advertised a 25 MB limit that no file could
       * ever reach: anything over a megabyte was rejected by the framework
       * before `stageUpload` ran, so the friendly "export a narrower date range"
       * message was unreachable and the user saw a bare failure instead.
       *
       * A year of accounts payable for a mid-sized company is a few megabytes.
       * This has to match the limit the UI states.
       */
      bodySizeLimit: "25mb",
    },
  },
};

export default config;

import { config as loadEnv } from "dotenv";
import { resolve } from "path";

/**
 * Configuration for the stack suite.
 *
 * These tests run against an already-running `docker compose` stack rather than
 * starting one, so that a failure leaves the stack up to inspect and so CI is
 * two commands instead of an orchestration layer inside jest.
 */
loadEnv({ path: resolve(__dirname, "../../.env") });

const corePort = process.env.CORE_PORT ?? "3400";
const krakenPort = process.env.KRAKEN_PORT ?? "8410";

process.env.STACK_CORE_URL ??= `http://localhost:${corePort}`;
process.env.STACK_KRAKEN_URL ??= `ws://localhost:${krakenPort}/ws`;

if (!process.env.NOLAG_SYSTEM_KEY) {
  throw new Error(
    "NOLAG_SYSTEM_KEY is not set. Run ./quickstart/quickstart.sh to bring up " +
      "the stack, or export it if the stack is running elsewhere.",
  );
}

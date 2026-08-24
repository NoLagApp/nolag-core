import { config } from "dotenv";
import { join } from "path";

/**
 * These run against a real Postgres, not a mock.
 *
 * The host's job is routing, validation and status codes over the real thing,
 * and a mocked DataSource would only prove that the mock agrees with itself.
 *
 * Reads the repository root's .env, one level up from the example, and points
 * at a separate database so a run cannot disturb the quickstart's data.
 */
config({ path: join(__dirname, "..", "..", ".env.test") });
config({ path: join(__dirname, "..", "..", ".env") });

process.env.POSTGRES_DATABASE =
  process.env.TEST_POSTGRES_DATABASE ?? "nolag_core_test";
process.env.NODE_ENV = "test";

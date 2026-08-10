import { config } from "dotenv";
import { join } from "path";

/**
 * Integration tests run against a real Postgres, not a mock.
 *
 * Resolution logic depends on how the database actually filters: soft-delete
 * predicates, IsNull, In over empty sets, jsonb round-tripping. A hand-written
 * mock would only prove that the mock agrees with itself.
 *
 * Loads .env.test if present, otherwise falls back to .env with the database
 * name overridden, so a developer with a working .env needs no extra setup.
 */
config({ path: join(__dirname, "..", ".env.test") });
config({ path: join(__dirname, "..", ".env") });

process.env.POSTGRES_DATABASE =
  process.env.TEST_POSTGRES_DATABASE ?? "nolag_core_test";
process.env.NODE_ENV = "test";

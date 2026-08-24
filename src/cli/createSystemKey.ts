import { ESystemKeyPrefix } from "../modules/systemKeyModule/enum/ESystemKeyPrefix.enum";
import {
  generateCredential,
  hashSecret,
  splitCredential,
} from "../common/utils/secretHash";
import { AppDataSource } from "../data-source";
import { SystemApiKeyEntity } from "../modules/systemKeyModule/systemApiKey.entity";

/**
 * Mint a system API key.
 *
 * A fresh deployment has a bootstrap problem: every endpoint requires a system
 * key, and creating one is an endpoint. The usual answers are a setup route that
 * is open until first use, or seeding from an environment variable. Both leave a
 * window or a secret in the process environment.
 *
 * A CLI avoids the whole class of problem: it needs database access, which is
 * already a higher bar than reaching the HTTP port, and it leaves no
 * unauthenticated surface behind after bootstrap.
 *
 *   npm run key:create -- "kraken broker"          # inside a checkout
 *   node dist/cli/createSystemKey "kraken broker"  # inside the image
 *
 * ## Adopting a key the caller already holds
 *
 * Set `SYSTEM_API_KEY` and the key is registered instead of generated. This
 * exists for orchestrated deployments, where the broker's configuration is
 * rendered before core has ever run and so cannot receive a value core invents
 * at first boot. One secret is generated once by the operator's tooling and
 * handed to both sides.
 *
 * Adoption is idempotent: registering a key that already exists succeeds and
 * changes nothing, so a compose or job spec can run this on every start.
 *
 * The supplied value must match the minted format exactly. That refusal is the
 * point: without it, this becomes a route for a hand-picked, low-entropy secret
 * on the most privileged credential in the system.
 */

/** `nlg_system_<12 hex>.<43 base64url>` and nothing else. */
const CREDENTIAL_FORMAT = new RegExp(
  `^${ESystemKeyPrefix.System}_[0-9a-f]{12}\\.[A-Za-z0-9_-]{43}$`,
);

async function main(): Promise<void> {
  const name = process.argv.slice(2).join(" ").trim() || "system key";
  const supplied = process.env.SYSTEM_API_KEY?.trim();

  if (supplied && !CREDENTIAL_FORMAT.test(supplied)) {
    throw new Error(
      "SYSTEM_API_KEY is not a valid system key. Expected " +
        `${ESystemKeyPrefix.System}_<12 hex>.<43 base64url characters>. ` +
        "Generate one rather than choosing one.",
    );
  }

  await AppDataSource.initialize();

  try {
    const credential = supplied
      ? adopt(supplied)
      : generateCredential(ESystemKeyPrefix.System);

    const existing = await AppDataSource.manager.findOne(SystemApiKeyEntity, {
      where: { keyId: credential.keyId },
    });

    if (existing) {
      process.stderr.write(
        `System API key "${existing.name}" (${credential.keyId}) already ` +
          `exists. Nothing to do.\n`,
      );
      return;
    }

    const entity = new SystemApiKeyEntity();
    entity.keyId = credential.keyId;
    entity.secretHash = credential.secretHash;
    entity.name = name;
    entity.expiresAt = null;
    entity.lastUsedAt = null;

    await AppDataSource.manager.save(SystemApiKeyEntity, entity);

    process.stderr.write(
      `\n${supplied ? "Registered" : "Created"} system API key "${name}"\n` +
        `  key id: ${credential.keyId}\n\n` +
        `Shown once. Only the hash is stored, so this cannot be recovered.\n` +
        `Give it to the broker as its backend secret.\n\n`,
    );

    // Written to stdout so it can be captured; everything else goes to stderr.
    process.stdout.write(`${credential.credential}\n`);
  } finally {
    await AppDataSource.destroy();
  }
}

/** Split a supplied credential into the parts that get persisted. */
function adopt(credential: string): {
  keyId: string;
  secretHash: string;
  credential: string;
} {
  // Already format-checked above, so this cannot be null.
  const parts = splitCredential(credential);
  if (!parts) {
    throw new Error("SYSTEM_API_KEY is malformed");
  }

  return {
    keyId: parts.keyId,
    secretHash: hashSecret(parts.secret),
    credential,
  };
}

main().catch((error) => {
  process.stderr.write(
    `Failed to create system API key: ${
      error instanceof Error ? error.message : String(error)
    }\n`,
  );
  process.exit(1);
});

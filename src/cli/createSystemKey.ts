import { generateCredential } from "../common/utils/secretHash";
import { AppDataSource } from "../data-source";
import { ESystemKeyPrefix } from "../modules/systemKeyModule/enum/ESystemKeyPrefix.enum";
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
 * already a higher bar than reaching the HTTP port, and it leaves no unauthenticated
 * surface behind after bootstrap.
 *
 *   npm run key:create -- "kraken broker"
 */
async function main(): Promise<void> {
  const name = process.argv.slice(2).join(" ").trim() || "system key";

  await AppDataSource.initialize();

  try {
    const credential = generateCredential(ESystemKeyPrefix.System);

    const entity = new SystemApiKeyEntity();
    entity.keyId = credential.keyId;
    entity.secretHash = credential.secretHash;
    entity.name = name;
    entity.expiresAt = null;
    entity.lastUsedAt = null;

    await AppDataSource.manager.save(SystemApiKeyEntity, entity);

    // Written to stdout so it can be captured; everything else goes to stderr.
    process.stderr.write(
      `\nCreated system API key "${name}"\n` +
        `  key id: ${credential.keyId}\n\n` +
        `Shown once. Only the hash is stored, so this cannot be recovered.\n` +
        `Give it to the broker as SYSTEM_API_KEY.\n\n`,
    );
    process.stdout.write(`${credential.credential}\n`);
  } finally {
    await AppDataSource.destroy();
  }
}

main().catch((error) => {
  process.stderr.write(
    `Failed to create system API key: ${
      error instanceof Error ? error.message : String(error)
    }\n`,
  );
  process.exit(1);
});

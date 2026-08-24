#!/usr/bin/env sh
#
# Does the published package actually work?
#
#   npm run test:package
#
# Everything else in this repository tests the source. This packs the tarball,
# installs it into a scratch project outside the repo, and boots a NestJS app
# that mounts CoreModule and resolves a facade.
#
# That gap is not theoretical. A NestJS library can compile, pass every unit
# test, and still be broken on install for reasons only an install shows:
#
#  - a peer dependency shipped as a real dependency, so the consumer ends up
#    with two copies of TypeORM, two metadata registries, and a DataSource the
#    container cannot resolve
#  - a `files` list that omits something, so an import resolves to nothing
#  - decorator metadata lost because emitDecoratorMetadata was off in the
#    build config even though it was on in the dev one
#  - an export missing from index.ts that the repo's own imports never needed
#    because they reach into src directly
#
# None of those are visible from inside the repo. This is the only check that
# looks at the artefact the way a consumer does.

set -eu

ROOT=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)
SCRATCH=$(mktemp -d)

cleanup() {
  rm -rf "$SCRATCH"
}
trap cleanup EXIT

cd "$ROOT"

echo "Building"
npm run clean >/dev/null 2>&1 || true
npm run build

# Checked before packing, because this is a property of the manifest and not
# of any particular install. The runtime check further down only sees a
# duplicate when npm cannot dedupe, which needs the host to pin an
# incompatible version; the manifest is wrong either way.
echo "Checking that shared packages are declared as peers"
node -e '
const pkg = require("./package.json");
const shared = [
  "@nestjs/common",
  "@nestjs/core",
  "@nestjs/typeorm",
  "@nestjs/swagger",
  "class-transformer",
  "class-validator",
  "reflect-metadata",
  "typeorm",
];

const deps = pkg.dependencies || {};
const peers = pkg.peerDependencies || {};

let bad = 0;
for (const name of shared) {
  if (deps[name]) {
    console.error(`  ${name} is a dependency; it must be a peer`);
    bad++;
  } else if (!peers[name]) {
    console.error(`  ${name} is declared nowhere; it must be a peer`);
    bad++;
  }
}

if (bad > 0) {
  console.error(
    `\n${bad} package(s) misdeclared. Each keeps a process-global registry, ` +
      `so a host that pins an incompatible version ends up with two copies, ` +
      `two registries, and decorators that half-resolve.`,
  );
  process.exit(1);
}
console.log("  all declared as peers");
'

echo "Packing"
TARBALL=$(npm pack --silent --pack-destination "$SCRATCH")
echo "  $TARBALL"

cd "$SCRATCH"

cat > package.json <<'EOF'
{
  "name": "nolag-core-package-test",
  "private": true,
  "version": "1.0.0"
}
EOF

echo "Installing into a scratch project"
# The peers go in first and separately, exactly as a consumer's own manifest
# would have them. If the library smuggles one in as a dependency, the
# duplicate shows up in the check below.
npm install --silent --no-audit --no-fund \
  @nestjs/common@^11 @nestjs/core@^11 @nestjs/typeorm@^11 @nestjs/swagger@^11 \
  class-transformer@^0.5 class-validator@^0.14 \
  reflect-metadata@^0.2 rxjs@^7 typeorm@^0.3 pg@^8 >/dev/null

npm install --silent --no-audit --no-fund "$TARBALL" >/dev/null

# Belt and braces. This only fires when npm could not dedupe, so the manifest
# check above is the one that actually holds the line.
echo "Checking the installed tree for duplicates"
node -e '
const fromCore = (name) =>
  require.resolve(name, { paths: [require.resolve("@nolag/core")] });
const fromHost = (name) => require.resolve(name);

const shared = [
  "@nestjs/common",
  "@nestjs/core",
  "@nestjs/typeorm",
  "@nestjs/swagger",
  "class-transformer",
  "class-validator",
  "typeorm",
];

let bad = 0;
for (const name of shared) {
  const a = fromCore(name);
  const b = fromHost(name);
  if (a !== b) {
    console.error(`  DUPLICATE ${name}`);
    console.error(`    library: ${a}`);
    console.error(`    host:    ${b}`);
    bad++;
  }
}
if (bad > 0) {
  console.error(
    `\n${bad} package(s) resolve to two copies. Each one keeps a ` +
      `process-global registry, so decorators registered by one are invisible ` +
      `to the other. Move it to peerDependencies.`,
  );
  process.exit(1);
}
console.log("  one copy of each");
'

echo "Booting a host that mounts CoreModule"
cat > boot.js <<'EOF'
require("reflect-metadata");

const { NestFactory } = require("@nestjs/core");
const { Module } = require("@nestjs/common");
const { TypeOrmModule } = require("@nestjs/typeorm");
const core = require("@nolag/core");

// Every export a host is told to use. A missing one fails here rather than in
// somebody's application.
const required = [
  "CoreModule",
  "CoreConfig",
  "coreEntities",
  "coreInitialMigrations",
  "allCoreMigrations",
  "AuthzFacade",
  "ProjectFacade",
  "PlatformAppFacade",
  "RoomFacade",
  "RoomActorAccessFacade",
  "LobbyFacade",
  "AccessScopeFacade",
  "ActorTokenFacade",
  "SigningKeyFacade",
  "ProjectConfigFacade",
  "toBrokerValidateResponse",
];

const missing = required.filter((name) => core[name] === undefined);
if (missing.length) {
  console.error("  missing exports:", missing.join(", "));
  process.exit(1);
}

if (core.coreEntities.length === 0) {
  console.error("  coreEntities is empty");
  process.exit(1);
}

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: "postgres",
      host: process.env.POSTGRES_HOST,
      port: parseInt(process.env.POSTGRES_PORT || "5432", 10),
      username: process.env.POSTGRES_USER,
      password: process.env.POSTGRES_PASSWORD,
      database: process.env.POSTGRES_DATABASE,
      entities: [...core.coreEntities],
      migrations: [...core.allCoreMigrations],
      synchronize: false,
      migrationsRun: false,
      logging: false,
    }),
    core.CoreModule.forRoot({ defaultLimits: { sessionExpirySeconds: 900 } }),
  ],
})
class HostModule {}

async function main() {
  const app = await NestFactory.createApplicationContext(HostModule, {
    logger: false,
  });

  // Resolving a facade is what proves the container assembled: entity
  // metadata resolved, repositories registered, providers exported.
  const authz = app.get(core.AuthzFacade);
  if (!authz) throw new Error("AuthzFacade did not resolve");

  const config = app.get(core.CoreConfig);
  if (config.defaultSessionExpirySeconds !== 900) {
    throw new Error("forRoot options did not reach CoreConfig");
  }

  // An unknown token must be refused, from the installed package.
  const result = await authz.validateActor("at_live_000000000000.nope");
  if (result.valid !== false) {
    throw new Error("an unissued token was accepted");
  }

  await app.close();
  console.log("  mounted, resolved and refused an unissued token");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
EOF

# Decorators in boot.js need transpiling; run it through the installed
# TypeScript rather than adding a build step to the scratch project.
npm install --silent --no-audit --no-fund typescript@^5 ts-node@^10 @types/node@^22 >/dev/null
mv boot.js boot.ts
cat > tsconfig.json <<'EOF'
{
  "compilerOptions": {
    "module": "commonjs",
    "target": "ES2022",
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "strict": false
  }
}
EOF

npx ts-node boot.ts

echo ""
echo "Package OK."

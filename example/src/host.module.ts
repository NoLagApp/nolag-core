import { Module } from "@nestjs/common";
import { CoreModule } from "@nolag/core";
import { ExampleConfig } from "./config/example.config";
import { AuthzController } from "./controllers/authz.controller";
import { ProjectConfigController } from "./controllers/projectConfig.controller";
import { DatabaseModule } from "./database/database.module";
import { HealthModule } from "./health/health.module";

/**
 * A host for @nolag/core, and the shortest one that does anything useful.
 *
 * Three things happen here, and they are the three things any host does:
 *
 *  1. Own the connection. DatabaseModule builds the DataSource from core's
 *     exported entities and migrations.
 *  2. Mount core. `CoreModule.forRoot()` takes the handful of settings core
 *     needs and gives back facades.
 *  3. Expose them. The controllers below are thin: they turn a request into a
 *     facade call and a facade result into a response, and nothing else.
 *
 * **This host authenticates nobody.** That is not an omission, it is the point:
 * core has no opinion about who may call it, and showing that plainly is more
 * honest than shipping an example with a token check that people would copy
 * into production. NoLag's own host mounts these same facades behind Kinde
 * auth, permissions and subscription guards.
 *
 * Do not put this on a network. See the warning printed at boot.
 */
// Constructed here rather than injected because `forRoot` runs while the
// module is being defined, before the container exists. It only reads
// process.env, so there is nothing to wait for.
const config = new ExampleConfig();

@Module({
  imports: [
    DatabaseModule,
    HealthModule,
    CoreModule.forRoot({
      signingKeyEncryptionKey: config.signingKeyEncryptionKey,
      defaultLimits: {
        maxConnections: config.defaultMaxConnections,
        maxMessageSizeBytes: config.defaultMaxMessageSizeBytes,
        sessionExpirySeconds: config.defaultSessionExpirySeconds,
      },
      // No audit sink. Core discards audit events unless a host wants them.
    }),
  ],
  controllers: [AuthzController, ProjectConfigController],
  providers: [ExampleConfig],
})
export class HostModule {}

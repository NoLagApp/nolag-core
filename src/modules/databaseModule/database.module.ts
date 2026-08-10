import { Global, Module } from "@nestjs/common";
import { TypeOrmModule, TypeOrmModuleOptions } from "@nestjs/typeorm";
import { join } from "path";
import { CoreConfigModule } from "../configModule/config.module";
import { CoreConfigService } from "../configModule/config.service";
import { DatabaseService } from "./database.service";

@Global()
@Module({
  imports: [
    CoreConfigModule,
    TypeOrmModule.forRootAsync({
      imports: [CoreConfigModule],
      inject: [CoreConfigService],
      useFactory: (config: CoreConfigService): TypeOrmModuleOptions => ({
        type: "postgres",

        /* ── Connection target ─────────────────────────────────────────── */
        username: config.pgUser,
        password: config.pgPassword,
        database: config.pgDatabase,
        // A socket directory takes precedence over host and port.
        ...(config.pgSocketPath
          ? { host: config.pgSocketPath }
          : { host: config.pgHost, port: config.pgPort }),

        /* ── Discovery ─────────────────────────────────────────────────── */
        entities: [join(__dirname, "..", "**", "*.entity.{ts,js}")],
        migrations: [join(__dirname, "..", "..", "migrations", "*.{ts,js}")],

        /* ── Runtime ───────────────────────────────────────────────────── */
        // Never true. Schema changes go through migrations so that a
        // self-hosted deployment upgrades predictably.
        synchronize: false,

        // Deliberately false. Migrations are run from exactly one place,
        // DatabaseService.onModuleInit, so that there is a single code path,
        // a single log line, and a single place SKIP_MIGRATIONS can gate.
        //
        // TypeORM's migrationsRun fires during DataSource.initialize(), which
        // is before onModuleInit. Setting both means the earlier path wins and
        // the explicit error handling never runs, which makes a failed
        // migration hard to diagnose and makes SKIP_MIGRATIONS ineffective
        // unless both are gated. One path avoids the whole class of problem.
        migrationsRun: false,

        logging: !config.isProduction,
        extra: {
          min: config.pgPoolMin,
          max: config.pgPoolMax,
        },
      }),
    }),
  ],
  providers: [DatabaseService],
  exports: [DatabaseService, TypeOrmModule],
})
export class DatabaseModule {}

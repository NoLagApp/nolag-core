import { Global, Module } from "@nestjs/common";
import { TypeOrmModule, TypeOrmModuleOptions } from "@nestjs/typeorm";
import { allCoreMigrations, coreEntities } from "@nolag/core";
import { ExampleConfig } from "../config/example.config";
import { DatabaseService } from "./database.service";

const config = new ExampleConfig();

/**
 * The host owns the connection.
 *
 * Note the entities and migrations: arrays imported from the package, not a
 * glob. A glob relative to this file would never look inside node_modules, so
 * core's tables would silently not exist. This is the single most important
 * line to copy when writing your own host.
 */
@Global()
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      // Core binds to the default connection. It never opens one of its own,
      // so its entities go on whatever DataSource the host already has.
      // Constructed rather than injected: TypeOrmModuleAsyncOptions has no
      // `providers`, and ExampleConfig only reads process.env, so there is
      // nothing to wait for.
      useFactory: (): TypeOrmModuleOptions => ({
        type: "postgres",

        /* ── Connection target ─────────────────────────────────────────── */
        username: config.pgUser,
        password: config.pgPassword,
        database: config.pgDatabase,
        // A socket directory takes precedence over host and port.
        ...(config.pgSocketPath
          ? { host: config.pgSocketPath }
          : { host: config.pgHost, port: config.pgPort }),

        /* ── Schema, from the package ──────────────────────────────────── */
        entities: [...coreEntities],
        migrations: [...allCoreMigrations],

        /* ── Runtime ───────────────────────────────────────────────────── */
        // Never true. Schema changes go through migrations so that a
        // self-hosted deployment upgrades predictably.
        synchronize: false,

        // Deliberately false. Migrations run from exactly one place,
        // DatabaseService.onModuleInit, so there is a single code path, a
        // single log line, and a single place SKIP_MIGRATIONS can gate.
        //
        // TypeORM's migrationsRun fires during DataSource.initialize(), which
        // is before onModuleInit. Setting both means the earlier path wins and
        // the explicit error handling never runs, which makes a failed
        // migration hard to diagnose and SKIP_MIGRATIONS ineffective unless
        // both are gated. One path avoids the whole class of problem.
        migrationsRun: false,

        logging: !config.isProduction,
        extra: {
          min: config.pgPoolMin,
          max: config.pgPoolMax,
        },
      }),
    }),
  ],
  providers: [ExampleConfig, DatabaseService],
  // TypeOrmModule is deliberately not re-exported. Exporting it bare pulls in
  // the DEFAULT connection's providers, which do not exist here: core's
  // connection is named. forRootAsync already registers it globally.
  exports: [DatabaseService],
})
export class DatabaseModule {}

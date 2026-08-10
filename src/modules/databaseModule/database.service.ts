import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";
import { CoreConfigService } from "../configModule/config.service";

@Injectable()
export class DatabaseService implements OnModuleInit {
  private readonly logger = new Logger(DatabaseService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly config: CoreConfigService,
  ) {}

  /**
   * The only place migrations run. See the note in database.module.ts for why
   * TypeORM's own migrationsRun is switched off.
   */
  async onModuleInit(): Promise<void> {
    if (this.config.skipMigrations) {
      const pending = await this.getPendingMigrations();
      this.logger.warn(
        `SKIP_MIGRATIONS is set. Not running migrations. ` +
          `${pending.length} pending: ${pending.join(", ") || "none"}`,
      );
      return;
    }

    try {
      this.logger.log("Running database migrations...");
      const applied = await this.dataSource.runMigrations({
        transaction: "all",
      });

      if (applied.length === 0) {
        this.logger.log("No pending migrations");
      } else {
        this.logger.log(
          `Applied ${applied.length} migration(s): ${applied
            .map((m) => m.name)
            .join(", ")}`,
        );
      }
    } catch (error) {
      // Fail fast. Serving authorization decisions against a half-migrated
      // schema is worse than refusing to start.
      this.logger.error("Failed to run migrations", error);
      throw error;
    }
  }

  async checkHealth(): Promise<boolean> {
    try {
      await this.dataSource.query("SELECT 1");
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Names of migrations present in the build but not yet recorded as applied.
   * Useful as a deployment precondition check.
   */
  async getPendingMigrations(): Promise<string[]> {
    const executed = await this.dataSource
      .query<{ name: string }[]>(`SELECT name FROM migrations`)
      .catch(() => [] as { name: string }[]);

    const executedNames = new Set(executed.map((row) => row.name));

    return this.dataSource.migrations
      .map((m) => m.name)
      .filter((name): name is string => name !== undefined)
      .filter((name) => !executedNames.has(name));
  }
}

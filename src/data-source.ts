import { config as loadEnv } from "dotenv";
import { join } from "path";
import { DataSource, DataSourceOptions } from "typeorm";

/**
 * DataSource for the TypeORM CLI only (migration:generate, migration:run and
 * friends). The running application builds its own DataSource in
 * modules/databaseModule/database.module.ts.
 *
 * Kept in sync with that module by hand. If you change connection handling
 * there, change it here too.
 */
loadEnv({ path: join(__dirname, "..", ".env") });

const socketPath = process.env.POSTGRES_SOCKET_PATH;

const options: DataSourceOptions = {
  type: "postgres",
  username: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  database: process.env.POSTGRES_DATABASE,
  ...(socketPath
    ? { host: socketPath }
    : {
        host: process.env.POSTGRES_HOST || "localhost",
        port: parseInt(process.env.POSTGRES_PORT || "5432", 10),
      }),
  entities: [join(__dirname, "**", "*.entity.{ts,js}")],
  migrations: [join(__dirname, "migrations", "*.{ts,js}")],
  migrationsTableName: "migrations",
  synchronize: false,
  logging: process.env.NODE_ENV !== "production",
};

export const AppDataSource = new DataSource(options);

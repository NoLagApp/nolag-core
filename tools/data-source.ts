import { config as loadEnv } from "dotenv";
import { join } from "path";
import { DataSource, DataSourceOptions } from "typeorm";
import { allCoreMigrations, coreEntities } from "../src/schema";

/**
 * DataSource for the TypeORM CLI only: migration:generate, migration:run and
 * friends while developing the library.
 *
 * Not shipped. A host builds its own DataSource and passes `coreEntities` and
 * `allCoreMigrations` into it, exactly as the example does.
 *
 * Note this reads the same explicit arrays rather than a glob. A glob relative
 * to this file would find nothing, since the source lives one directory across,
 * and `migration:run` would cheerfully report "no migrations are pending"
 * against an empty database.
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
  entities: [...coreEntities],
  migrations: [...allCoreMigrations],
  migrationsTableName: "migrations",
  synchronize: false,
  logging: process.env.NODE_ENV !== "production",
};

export const AppDataSource = new DataSource(options);

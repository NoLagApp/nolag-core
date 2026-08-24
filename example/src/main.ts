import {
  BadRequestException,
  ConsoleLogger,
  Logger,
  ValidationError,
  ValidationPipe,
  VersioningType,
} from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { config as loadEnv } from "dotenv";
import { join } from "path";
import { ExampleConfig } from "./config/example.config";
import { HostModule } from "./host.module";

loadEnv({ path: join(__dirname, "..", "..", ".env") });

interface FlatValidationError {
  path: string;
  message: string;
}

/**
 * Flatten class-validator's nested errors into a readable list.
 *
 * Deliberately reports the property path and the constraint message but never
 * the rejected value. Request bodies here carry access tokens and signing
 * secrets, and echoing a rejected value would put a credential into both the
 * response body and the logs.
 */
function flattenErrors(
  errors: ValidationError[],
  parent = "",
): FlatValidationError[] {
  return errors.flatMap((e) => {
    const path = parent ? `${parent}.${e.property}` : e.property;

    const thisLevel: FlatValidationError[] = e.constraints
      ? Object.values(e.constraints).map((message) => ({ path, message }))
      : [];

    return thisLevel.concat(flattenErrors(e.children ?? [], path));
  });
}

/**
 * Said at boot, every boot, because the alternative is somebody finding out
 * later. This host can mint actor tokens and signing keys for any project, and
 * it asks nobody for anything.
 */
function warnLoudly(logger: Logger, port: number): void {
  const line = "=".repeat(72);
  logger.warn(line);
  logger.warn("This host authenticates nobody.");
  logger.warn(
    "Anyone who can reach port " +
      `${port} can read, create and delete every project, ` +
      "and mint credentials for any of them.",
  );
  logger.warn(
    "It exists to demonstrate @nolag/core, not to run anything real.",
  );
  logger.warn("Keep it on localhost. Do not put it on a network.");
  logger.warn(line);
}

async function bootstrap() {
  const app = await NestFactory.create(HostModule, {
    cors: false,
    logger: new ConsoleLogger({ prefix: "nolag-example" }),
  });

  const config = new ExampleConfig();

  // Off unless origins are named. The admin UI is a browser client on another
  // origin, so it needs this; a headless deployment does not.
  const corsOrigins = config.corsOrigins;
  if (corsOrigins.length > 0) {
    app.enableCors({
      origin: corsOrigins,
      methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type"],
      credentials: false,
    });
  }

  app.useGlobalPipes(
    new ValidationPipe({
      // Strip properties absent from the DTO, so a request cannot set fields
      // it was never meant to reach.
      whitelist: true,
      // Reject rather than silently strip. A configuration endpoint that
      // quietly ignores an unknown field is a bad way to find out about a typo.
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: (errors: ValidationError[]) =>
        new BadRequestException({
          message: "Validation failed",
          errors: flattenErrors(errors),
        }),
    }),
  );

  app.enableVersioning({ type: VersioningType.URI });

  const swagger = new DocumentBuilder()
    .setTitle("nolag-core example host")
    .setDescription(
      "A minimal host for @nolag/core. Authenticates nobody. " +
        "Not for production.",
    )
    .setVersion("v1")
    .build();

  SwaggerModule.setup(
    "swagger",
    app,
    SwaggerModule.createDocument(app, swagger),
  );

  await app.listen(config.port);

  warnLoudly(new Logger("nolag-example"), config.port);
}

bootstrap().catch((error) => {
  console.error(error);
  process.exit(1);
});

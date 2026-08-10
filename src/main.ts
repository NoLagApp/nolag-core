import {
  BadRequestException,
  ConsoleLogger,
  ValidationError,
  ValidationPipe,
  VersioningType,
} from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "./modules/appModule/app.module";
import { CoreConfigService } from "./modules/configModule/config.service";

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

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    cors: false,
    logger: new ConsoleLogger({ prefix: "nolag-core" }),
  });

  const config = app.get(CoreConfigService);

  app.useGlobalPipes(
    new ValidationPipe({
      // Strip properties absent from the DTO, so a request cannot set fields
      // it was never meant to reach.
      whitelist: true,
      // Reject rather than silently strip. Configuration endpoints that quietly
      // ignore an unknown field are a bad way to find out about a typo.
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
    .setTitle("nolag-core")
    .setDescription(
      "Authorization and configuration core for NoLag. " +
        "Answers whether an actor may reach a topic.",
    )
    .setVersion("v1")
    .addBearerAuth(
      { type: "http", scheme: "bearer", bearerFormat: "nlg_system_*" },
      "systemApiKey",
    )
    .build();

  SwaggerModule.setup(
    "swagger",
    app,
    SwaggerModule.createDocument(app, swagger),
  );

  await app.listen(config.port);
}

bootstrap().catch((error) => {
  console.error(error);
  process.exit(1);
});

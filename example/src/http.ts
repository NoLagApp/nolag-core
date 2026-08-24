import { BadRequestException, Logger } from "@nestjs/common";
import { validate as uuidValidate } from "uuid";

/**
 * Small HTTP helpers for the example host.
 *
 * Deliberately not imported from `@nolag/core`. Turning a domain outcome into
 * an HTTP status is a transport decision, and transport is the host's job: a
 * host that answers gRPC, or that maps a missing project to 204 rather than
 * 404, should be able to do that without arguing with the library.
 */

export function isUuid(value: string): boolean {
  return uuidValidate(value);
}

export function badRequest(logger: Logger, message: string): never {
  logger.warn(message);
  throw new BadRequestException({ message });
}

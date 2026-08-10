import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  type HttpException,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { generateRandomUuid } from "./guid";

export interface IErrorMessagesOptions {
  /** Returned to the caller. Must not contain internal detail. */
  errorMsgUser?: string;
  /** Logged only. Put the diagnostic detail here. */
  errorMsgSystem?: string;
}

export interface IException {
  id: string;
  message: string;
  timestamp: string;
}

/**
 * Exception factories that log the internal reason and return only the
 * user-facing message.
 *
 * The split matters here: an authorization service must not explain *why* it
 * refused, or the endpoints become an oracle for probing which tokens, keys,
 * projects and rooms exist. Diagnostic detail goes to errorMsgSystem, which is
 * logged alongside a correlation id and never serialised into the response.
 */
type ExceptionConstructor = new (payload: IException) => HttpException;

const build = (
  Exception: ExceptionConstructor,
  defaultMessage: string,
  level: "warn" | "error",
) => {
  return (
    loggerInstance: Logger,
    errorMessagesOptions?: IErrorMessagesOptions,
  ): HttpException => {
    const exception: IException = {
      id: generateRandomUuid(),
      message: errorMessagesOptions?.errorMsgUser || defaultMessage,
      timestamp: new Date().toISOString(),
    };

    loggerInstance[level]({
      ...exception,
      errorMsgSystem: errorMessagesOptions?.errorMsgSystem,
    });

    return new Exception(exception);
  };
};

export const badRequestException = build(
  BadRequestException,
  "Bad request",
  "warn",
);

export const unauthorizedException = build(
  UnauthorizedException,
  "Unauthorized",
  "warn",
);

export const forbiddenException = build(
  ForbiddenException,
  "Forbidden",
  "warn",
);

export const notFoundException = build(NotFoundException, "Not found", "warn");

export const conflictException = build(ConflictException, "Conflict", "warn");

import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from "class-validator";

/**
 * A topic name, as it appears in the last segment of an address.
 *
 * A forward slash is the separator in `app/room/topic`, so a topic containing
 * one would change the shape of every address it appears in and could be made
 * to collide with a room the actor was never granted. That is why this is a
 * validator rather than a convention.
 *
 * Colons are allowed, which is why the WebRTC signalling topics are named
 * `webrtc:offer` rather than `webrtc/offer`.
 *
 * Ported from Titus's `common/validators/isValidTopicName.validator.ts`.
 */
const VALID_TOPIC_PATTERN = /^[a-zA-Z0-9_:-]+$/;
const MAX_TOPIC_LENGTH = 100;

@ValidatorConstraint({ name: "isValidTopicName", async: false })
export class IsValidTopicNameConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (typeof value !== "string") {
      return false;
    }

    if (value.length === 0 || value.length > MAX_TOPIC_LENGTH) {
      return false;
    }

    return VALID_TOPIC_PATTERN.test(value);
  }

  defaultMessage(args: ValidationArguments): string {
    return (
      `${args.property} must contain only alphanumeric characters, hyphens, ` +
      `underscores and colons. Slashes separate the parts of an address and ` +
      `are not allowed inside one.`
    );
  }
}

export function IsValidTopicName(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsValidTopicNameConstraint,
    });
  };
}

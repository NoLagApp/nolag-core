import { v4, v7, validate } from "uuid";

/**
 * UUID v7 for primary keys: time-ordered, so rows cluster by creation time and
 * b-tree inserts stay at the right edge of the index.
 */
export const generateDBUuid = (): string => {
  return v7();
};

export const generateRandomUuid = (): string => {
  return v4();
};

export const validateUUID = (uuid: string): boolean => {
  return validate(uuid);
};

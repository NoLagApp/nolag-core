/**
 * Core's own paginated result.
 *
 * Structurally identical to the one in Titus
 * (`common/services/basePagination.service.ts`) so that a host mounting core's
 * facades behind its existing controllers keeps returning the same shape to its
 * clients. Core carries its own copy rather than importing one, because a
 * library that depends on its host's utilities is not a library.
 */
export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export function paginate<T>(
  data: T[],
  total: number,
  page: number,
  limit: number,
): PaginatedResult<T> {
  return {
    data,
    total,
    page,
    limit,
    // Guard the divisor: a limit of 0 would otherwise yield Infinity, and a
    // client paging through that never terminates.
    totalPages: limit > 0 ? Math.ceil(total / limit) : 0,
  };
}

import { Logger } from "@nestjs/common";
import { IsArray, IsOptional, IsString } from "class-validator";
import type {
  FindOptionsOrder,
  FindOptionsWhere,
  ObjectLiteral,
  SelectQueryBuilder,
} from "typeorm";

/**
 * Pagination, ported from Titus's `common/services/basePagination.service.ts`
 * and `common/queries/base.query.ts`.
 *
 * The shape is copied exactly, nesting under `pagination` rather than
 * flattening, so that a host mounting core's facades behind its existing
 * controllers keeps returning what its clients already parse. Core carries its
 * own copy rather than importing one, because a library that depends on its
 * host's utilities is not a library.
 */

export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    total: number;
    page: number;
    pageCount: number;
  };
}

export interface QueryOptions {
  /** Skip the limit entirely. Use sparingly, and never on a public route. */
  allRecords?: boolean;
}

export enum DefaultPagination {
  Page = "1",
  Limit = "10",
}

export interface IBaseQuery<T extends ObjectLiteral> {
  page?: string;
  limit?: string;
  order?: FindOptionsOrder<T>;
}

export abstract class BaseQuery<T> {
  @IsString()
  @IsOptional()
  page: string = DefaultPagination.Page;

  @IsString()
  @IsOptional()
  limit: string = DefaultPagination.Limit;

  /** `field:ASC` pairs. Validated against entity metadata before use. */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  orderBy?: string[];

  get order(): FindOptionsOrder<T> | undefined {
    if (!this.orderBy) return undefined;
    return Object.fromEntries(
      this.orderBy.map((i) => i.split(":")),
    ) as FindOptionsOrder<T>;
  }

  get queryParams(): FindOptionsWhere<T> {
    const query: FindOptionsWhere<T> = {};
    Object.keys(this).forEach((key) => {
      const value = (this as Record<string, unknown>)[key];
      if (!["page", "limit", "order", "orderBy"].includes(key) && value) {
        (query as Record<string, unknown>)[key] = value;
      }
    });
    return query;
  }
}

export class BasePaginationService {
  protected readonly logger = new Logger(BasePaginationService.name);

  async paginate<T extends ObjectLiteral>(
    qb: SelectQueryBuilder<T>,
    query: IBaseQuery<T>,
    options?: QueryOptions,
  ): Promise<PaginatedResult<T>> {
    const page = Number(query.page) || 1;
    const rawLimit = Number(query.limit) || 10;
    const limit = Math.min(Math.max(rawLimit, 1), 100);

    const alias = qb.alias;

    if (!options?.allRecords) {
      qb.skip((page - 1) * limit).take(limit);
    }

    if (query.order) {
      const metadata = qb.expressionMap.mainAlias?.metadata;

      if (metadata) {
        // A sort field goes straight into SQL, so it is checked against the
        // entity's own columns rather than trusted. An unknown field is
        // dropped, not passed through.
        const validColumns = new Set(
          metadata.columns.map((col) => col.propertyName),
        );

        for (const [field, direction] of Object.entries(query.order)) {
          if (!validColumns.has(field)) {
            this.logger.error(
              `Invalid sort field "${field}" on ${metadata.name}. ` +
                `Valid: ${Array.from(validColumns).join(", ")}`,
            );
            continue;
          }

          const normalized = String(direction).toUpperCase();
          if (normalized !== "ASC" && normalized !== "DESC") {
            this.logger.error(
              `Invalid sort direction "${direction}" for "${field}".`,
            );
            continue;
          }

          qb.addOrderBy(`${alias}.${field}`, normalized);
        }
      } else {
        // Without metadata there is nothing to validate against, so sorting is
        // dropped rather than guessed at.
        this.logger.warn(
          "Entity metadata unavailable. Skipping ORDER BY for safety.",
        );
      }
    }

    const [data, total] = await qb.getManyAndCount();

    return {
      data,
      pagination: {
        total,
        page,
        pageCount: Math.ceil(total / limit),
      },
    };
  }
}

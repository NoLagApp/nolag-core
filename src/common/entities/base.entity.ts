import {
  BaseEntity,
  CreateDateColumn,
  DeleteDateColumn,
  UpdateDateColumn,
} from "typeorm";

export interface IBaseTimeEntity {
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date | null;
}

export abstract class BaseTimeEntity
  extends BaseEntity
  implements IBaseTimeEntity
{
  /** Filled once by the database on INSERT */
  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  /** Automatically refreshed on every UPDATE */
  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;

  /** Populated only by softRemove() / softDelete() */
  @DeleteDateColumn({ name: "deleted_at", type: "timestamptz", nullable: true })
  deletedAt?: Date | null;
}

import { MigrationInterface, QueryRunner } from "typeorm";

export class InitialSchema1786323955167 implements MigrationInterface {
  name = "InitialSchema1786323955167";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "system_api_key" ("created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "system_api_key_id" uuid NOT NULL, "key_id" character varying(100) NOT NULL, "secret_hash" text NOT NULL, "name" character varying(255) NOT NULL, "status" character varying(50) NOT NULL DEFAULT 'active', "expires_at" TIMESTAMP WITH TIME ZONE, "last_used_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_881398ea16269dc9457c02bccf8" PRIMARY KEY ("system_api_key_id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_f682ee665cb42a77ed403ae506" ON "system_api_key" ("key_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "project" ("created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "project_id" uuid NOT NULL, "organization_id" uuid, "name" character varying(255) NOT NULL, "description" text, "max_connections" integer, "max_message_size_bytes" integer, "session_expiry_seconds" integer, "limits_synced_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_1a480c5734c5aacb9cef7b1499d" PRIMARY KEY ("project_id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "signing_key" ("created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "signing_key_id" uuid NOT NULL, "project_id" uuid NOT NULL, "key_id" character varying(100) NOT NULL, "secret_encrypted" text NOT NULL, "name" character varying(255) NOT NULL, "status" character varying(50) NOT NULL DEFAULT 'active', "last_used_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_3e229f8103ab8d33265fe967136" PRIMARY KEY ("signing_key_id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_f89db888411d43c6fa9e078faa" ON "signing_key" ("project_id") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_1d8b9aad2f1b48c5f2c813da62" ON "signing_key" ("key_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_a3d941e97746ae93181c3c5bb8" ON "signing_key" ("project_id", "status") `,
    );
    await queryRunner.query(
      `CREATE TABLE "access_scope" ("created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "access_scope_id" uuid NOT NULL, "project_id" uuid NOT NULL, "slug" character varying(100) NOT NULL, "name" character varying(255) NOT NULL, "description" character varying(500), "metadata" jsonb, "is_active" boolean NOT NULL DEFAULT true, CONSTRAINT "PK_26acb7cf35e5f4a08a85d937b6e" PRIMARY KEY ("access_scope_id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_72b40c19ab0a239ab3e03b0c2c" ON "access_scope" ("project_id") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_38775a22574e45bdc64f546aa8" ON "access_scope" ("project_id", "slug") WHERE "deleted_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE TABLE "actor_token" ("created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "actor_token_id" uuid NOT NULL, "project_id" uuid NOT NULL, "key_id" character varying(100) NOT NULL, "secret_hash" text NOT NULL, "name" character varying(255) NOT NULL, "actor_type" character varying(50) NOT NULL, "status" character varying(50) NOT NULL DEFAULT 'active', "expires_at" TIMESTAMP WITH TIME ZONE, "last_used_at" TIMESTAMP WITH TIME ZONE, "metadata" jsonb, "access_scope_id" uuid, CONSTRAINT "PK_2fa79d79c6c4bcb1b05c6109ea7" PRIMARY KEY ("actor_token_id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_9c143af4a94b67390ee6ec5a40" ON "actor_token" ("project_id") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_05288e51f3e0b0318a59496103" ON "actor_token" ("key_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ea90397617b14013b5eba88388" ON "actor_token" ("project_id", "status") `,
    );
    await queryRunner.query(
      `CREATE TABLE "app" ("created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "app_id" uuid NOT NULL, "project_id" uuid NOT NULL, "name" character varying(255) NOT NULL, "slug" character varying(100) NOT NULL, "description" text, "status" character varying(50) NOT NULL DEFAULT 'active', "access_mode" character varying(50) NOT NULL DEFAULT 'open', "topics" jsonb DEFAULT '[]', "topic_configs" jsonb, "hydration_webhook" jsonb, "trigger_webhook" jsonb, CONSTRAINT "PK_c8413c647faec35d0b3c56b9414" PRIMARY KEY ("app_id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_0f65d77d6dd3871880e071008f" ON "app" ("project_id") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "idx_app_project_slug" ON "app" ("project_id", "slug") WHERE "deleted_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE TABLE "room" ("created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "room_id" uuid NOT NULL, "app_id" uuid NOT NULL, "slug" character varying(100) NOT NULL, "name" character varying(255) NOT NULL, "description" text, "status" character varying(50) NOT NULL DEFAULT 'active', "topics" jsonb, "metadata" jsonb, CONSTRAINT "PK_483751c0abab68ed1ac952ae920" PRIMARY KEY ("room_id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_866eb7215827cec2d14c0eddc2" ON "room" ("app_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_895b35570f1078675468d98f83" ON "room" ("app_id", "status") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_4a49efc3d4997f7f7634ab55dd" ON "room" ("app_id", "slug") WHERE "deleted_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE TABLE "room_actor_access" ("created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "room_actor_access_id" uuid NOT NULL, "room_id" uuid NOT NULL, "actor_token_id" uuid, "actor_type" character varying(50), "permission" character varying(50) NOT NULL, "topics" jsonb, "is_active" boolean NOT NULL DEFAULT true, "expires_at" TIMESTAMP WITH TIME ZONE, "role" character varying(50), "metadata" jsonb, CONSTRAINT "PK_00ac03866098042936784177644" PRIMARY KEY ("room_actor_access_id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_120736be0c29c233ea9105d518" ON "room_actor_access" ("actor_token_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_9df0bf07d36820885a4f1f7d20" ON "room_actor_access" ("room_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "lobby" ("created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "lobby_id" uuid NOT NULL, "app_id" uuid NOT NULL, "slug" character varying(100) NOT NULL, "name" character varying(255) NOT NULL, "description" text, "metadata" jsonb, CONSTRAINT "PK_39224fccab9bee4ee67bf73a90c" PRIMARY KEY ("lobby_id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_63ba3c5d6cd9a4b0dff95c50cf" ON "lobby" ("app_id") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_8fd03b132d4171ff85e5024a69" ON "lobby" ("app_id", "slug") WHERE "deleted_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE TABLE "lobby_room" ("created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "lobby_id" uuid NOT NULL, "room_id" uuid NOT NULL, CONSTRAINT "PK_a0ea3873ccf6f0eaefcf69ca58a" PRIMARY KEY ("lobby_id", "room_id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_704543326486626cd378b205bb" ON "lobby_room" ("room_id") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_a0ea3873ccf6f0eaefcf69ca58" ON "lobby_room" ("lobby_id", "room_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "actor_token_state" ("created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "actor_token_state_id" uuid NOT NULL, "actor_token_id" uuid NOT NULL, "connection_state" jsonb, "kraken_node_id" character varying(255), "connected_at" TIMESTAMP WITH TIME ZONE, "last_activity_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_7d8ad834c9d4370c519c445e17d" PRIMARY KEY ("actor_token_state_id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_bb1346ef785f5b6f0472a1c314" ON "actor_token_state" ("actor_token_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "actor_app_access" ("created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "actor_app_access_id" uuid NOT NULL, "actor_token_id" uuid NOT NULL, "app_id" uuid NOT NULL, "permission" character varying(50) NOT NULL, "topics" jsonb, "is_active" boolean NOT NULL DEFAULT true, "expires_at" TIMESTAMP WITH TIME ZONE, "metadata" jsonb, CONSTRAINT "UQ_22d6319b8d0007f2669d89daf87" UNIQUE ("actor_token_id", "app_id"), CONSTRAINT "PK_2fe250762357fd8c00ae7909650" PRIMARY KEY ("actor_app_access_id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_e028c79734b0ff373a06e4e935" ON "actor_app_access" ("app_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_f0df59d3ec1e819460e181973b" ON "actor_app_access" ("actor_token_id") `,
    );
    await queryRunner.query(
      `ALTER TABLE "signing_key" ADD CONSTRAINT "FK_f89db888411d43c6fa9e078faa9" FOREIGN KEY ("project_id") REFERENCES "project"("project_id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "access_scope" ADD CONSTRAINT "FK_72b40c19ab0a239ab3e03b0c2cc" FOREIGN KEY ("project_id") REFERENCES "project"("project_id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "actor_token" ADD CONSTRAINT "FK_9c143af4a94b67390ee6ec5a40f" FOREIGN KEY ("project_id") REFERENCES "project"("project_id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "actor_token" ADD CONSTRAINT "FK_c0b2185ab746a658c13b0a2981d" FOREIGN KEY ("access_scope_id") REFERENCES "access_scope"("access_scope_id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "app" ADD CONSTRAINT "FK_0f65d77d6dd3871880e071008f5" FOREIGN KEY ("project_id") REFERENCES "project"("project_id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "room" ADD CONSTRAINT "FK_866eb7215827cec2d14c0eddc2e" FOREIGN KEY ("app_id") REFERENCES "app"("app_id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "room_actor_access" ADD CONSTRAINT "FK_9df0bf07d36820885a4f1f7d204" FOREIGN KEY ("room_id") REFERENCES "room"("room_id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "room_actor_access" ADD CONSTRAINT "FK_120736be0c29c233ea9105d518c" FOREIGN KEY ("actor_token_id") REFERENCES "actor_token"("actor_token_id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "lobby" ADD CONSTRAINT "FK_63ba3c5d6cd9a4b0dff95c50cff" FOREIGN KEY ("app_id") REFERENCES "app"("app_id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "lobby_room" ADD CONSTRAINT "FK_0d496346e48e885b7b475a44cdf" FOREIGN KEY ("lobby_id") REFERENCES "lobby"("lobby_id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "lobby_room" ADD CONSTRAINT "FK_704543326486626cd378b205bbc" FOREIGN KEY ("room_id") REFERENCES "room"("room_id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "actor_token_state" ADD CONSTRAINT "FK_bb1346ef785f5b6f0472a1c314a" FOREIGN KEY ("actor_token_id") REFERENCES "actor_token"("actor_token_id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "actor_app_access" ADD CONSTRAINT "FK_f0df59d3ec1e819460e181973b8" FOREIGN KEY ("actor_token_id") REFERENCES "actor_token"("actor_token_id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "actor_app_access" ADD CONSTRAINT "FK_e028c79734b0ff373a06e4e935a" FOREIGN KEY ("app_id") REFERENCES "app"("app_id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "actor_app_access" DROP CONSTRAINT "FK_e028c79734b0ff373a06e4e935a"`,
    );
    await queryRunner.query(
      `ALTER TABLE "actor_app_access" DROP CONSTRAINT "FK_f0df59d3ec1e819460e181973b8"`,
    );
    await queryRunner.query(
      `ALTER TABLE "actor_token_state" DROP CONSTRAINT "FK_bb1346ef785f5b6f0472a1c314a"`,
    );
    await queryRunner.query(
      `ALTER TABLE "lobby_room" DROP CONSTRAINT "FK_704543326486626cd378b205bbc"`,
    );
    await queryRunner.query(
      `ALTER TABLE "lobby_room" DROP CONSTRAINT "FK_0d496346e48e885b7b475a44cdf"`,
    );
    await queryRunner.query(
      `ALTER TABLE "lobby" DROP CONSTRAINT "FK_63ba3c5d6cd9a4b0dff95c50cff"`,
    );
    await queryRunner.query(
      `ALTER TABLE "room_actor_access" DROP CONSTRAINT "FK_120736be0c29c233ea9105d518c"`,
    );
    await queryRunner.query(
      `ALTER TABLE "room_actor_access" DROP CONSTRAINT "FK_9df0bf07d36820885a4f1f7d204"`,
    );
    await queryRunner.query(
      `ALTER TABLE "room" DROP CONSTRAINT "FK_866eb7215827cec2d14c0eddc2e"`,
    );
    await queryRunner.query(
      `ALTER TABLE "app" DROP CONSTRAINT "FK_0f65d77d6dd3871880e071008f5"`,
    );
    await queryRunner.query(
      `ALTER TABLE "actor_token" DROP CONSTRAINT "FK_c0b2185ab746a658c13b0a2981d"`,
    );
    await queryRunner.query(
      `ALTER TABLE "actor_token" DROP CONSTRAINT "FK_9c143af4a94b67390ee6ec5a40f"`,
    );
    await queryRunner.query(
      `ALTER TABLE "access_scope" DROP CONSTRAINT "FK_72b40c19ab0a239ab3e03b0c2cc"`,
    );
    await queryRunner.query(
      `ALTER TABLE "signing_key" DROP CONSTRAINT "FK_f89db888411d43c6fa9e078faa9"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_f0df59d3ec1e819460e181973b"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_e028c79734b0ff373a06e4e935"`,
    );
    await queryRunner.query(`DROP TABLE "actor_app_access"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_bb1346ef785f5b6f0472a1c314"`,
    );
    await queryRunner.query(`DROP TABLE "actor_token_state"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_a0ea3873ccf6f0eaefcf69ca58"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_704543326486626cd378b205bb"`,
    );
    await queryRunner.query(`DROP TABLE "lobby_room"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_8fd03b132d4171ff85e5024a69"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_63ba3c5d6cd9a4b0dff95c50cf"`,
    );
    await queryRunner.query(`DROP TABLE "lobby"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_9df0bf07d36820885a4f1f7d20"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_120736be0c29c233ea9105d518"`,
    );
    await queryRunner.query(`DROP TABLE "room_actor_access"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_4a49efc3d4997f7f7634ab55dd"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_895b35570f1078675468d98f83"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_866eb7215827cec2d14c0eddc2"`,
    );
    await queryRunner.query(`DROP TABLE "room"`);
    await queryRunner.query(`DROP INDEX "public"."idx_app_project_slug"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_0f65d77d6dd3871880e071008f"`,
    );
    await queryRunner.query(`DROP TABLE "app"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_ea90397617b14013b5eba88388"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_05288e51f3e0b0318a59496103"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_9c143af4a94b67390ee6ec5a40"`,
    );
    await queryRunner.query(`DROP TABLE "actor_token"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_38775a22574e45bdc64f546aa8"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_72b40c19ab0a239ab3e03b0c2c"`,
    );
    await queryRunner.query(`DROP TABLE "access_scope"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_a3d941e97746ae93181c3c5bb8"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_1d8b9aad2f1b48c5f2c813da62"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_f89db888411d43c6fa9e078faa"`,
    );
    await queryRunner.query(`DROP TABLE "signing_key"`);
    await queryRunner.query(`DROP TABLE "project"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_f682ee665cb42a77ed403ae506"`,
    );
    await queryRunner.query(`DROP TABLE "system_api_key"`);
  }
}

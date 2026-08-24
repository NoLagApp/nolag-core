import { DynamicModule, Global, Module } from "@nestjs/common";
import { CoreConfig } from "./core.config";
import {
  CORE_AUDIT_SINK,
  CORE_OPTIONS,
  CoreModuleOptions,
  NoopAuditSink,
} from "./core.options";
import { ActorTokenModule } from "./modules/actorTokenModule/actorToken.module";
import { AuthzModule } from "./modules/authzModule/authz.module";
import { ProjectConfigModule } from "./modules/projectConfigModule/projectConfig.module";
import { SigningKeyModule } from "./modules/signingKeyModule/signingKey.module";

/**
 * The authorization domain, mounted into a host.
 *
 * Core exposes facades and no transport. It has no controllers, no guards and
 * no opinion about who is calling it, because authenticating the caller is the
 * host's job: NoLag mounts these behind Kinde, permissions and subscription
 * guards, and the example host mounts them behind nothing.
 *
 * What core does keep is the authentication of *actors*: whether an access
 * token is real, whether a client token was signed by the right key, and what
 * either may reach. That is the product, and it lives nowhere else.
 *
 * The host owns the DataSource. Pass {@link coreEntities} and
 * {@link coreMigrations} into it; core will not open a connection of its own.
 *
 * ```ts
 * TypeOrmModule.forRoot({ ..., entities: [...coreEntities, ...myEntities] }),
 * CoreModule.forRoot({ signingKeyEncryptionKey: process.env.KEY }),
 * ```
 */
@Global()
@Module({})
export class CoreModule {
  static forRoot(options: CoreModuleOptions = {}): DynamicModule {
    return {
      module: CoreModule,
      imports: [
        ActorTokenModule,
        SigningKeyModule,
        AuthzModule,
        ProjectConfigModule,
      ],
      providers: [
        { provide: CORE_OPTIONS, useValue: options },
        {
          provide: CORE_AUDIT_SINK,
          useValue: options.auditSink ?? new NoopAuditSink(),
        },
        CoreConfig,
      ],
      exports: [
        CORE_OPTIONS,
        CORE_AUDIT_SINK,
        CoreConfig,
        ActorTokenModule,
        SigningKeyModule,
        AuthzModule,
        ProjectConfigModule,
      ],
    };
  }
}

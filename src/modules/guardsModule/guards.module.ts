import { Module } from "@nestjs/common";
import { SystemApiKeyModule } from "../systemKeyModule/systemApiKey.module";
import { InternalGuard } from "./internal.guard";

/**
 * SystemApiKeyModule is re-exported, not just imported.
 *
 * `@UseGuards(InternalGuard)` resolves the guard in the context of whichever
 * module declares the controller, so that module needs the guard's own
 * dependencies visible too. Exporting only the guard leaves consumers failing to
 * resolve SystemApiKeyFacade at boot.
 */
@Module({
  imports: [SystemApiKeyModule],
  providers: [InternalGuard],
  exports: [InternalGuard, SystemApiKeyModule],
})
export class GuardsModule {}

import { Module } from "@nestjs/common";
import { SystemApiKeyModule } from "../systemKeyModule/systemApiKey.module";
import { InternalGuard } from "./internal.guard";

@Module({
  imports: [SystemApiKeyModule],
  providers: [InternalGuard],
  exports: [InternalGuard],
})
export class GuardsModule {}

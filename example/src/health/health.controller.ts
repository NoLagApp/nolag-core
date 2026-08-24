import { Controller, Get } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { DatabaseService } from "../database/database.service";

@ApiTags("health")
@Controller("health")
export class HealthController {
  constructor(private readonly _database: DatabaseService) {}

  /**
   * Unauthenticated on purpose: this is what a container orchestrator calls.
   * It reveals only whether the process can reach its database.
   */
  @Get()
  @ApiOperation({ summary: "Liveness and database reachability" })
  @ApiResponse({ status: 200, description: "Core is up" })
  @ApiResponse({ status: 503, description: "Database unreachable" })
  async check() {
    const database = await this._database.checkHealth();

    return {
      status: database ? "ok" : "degraded",
      database: database ? "up" : "down",
    };
  }
}

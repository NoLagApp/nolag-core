import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { Logger } from "@nestjs/common";
import { ProjectConfigDocDto, ProjectConfigFacade } from "@nolag/core";
import { badRequest, isUuid } from "../http";

/**
 * Whole-project configuration.
 *
 * Guarded by the same system key as the broker endpoints: importing a project
 * mints credentials and defines who may reach what, so it is at least as
 * privileged as answering an authorization question.
 */
@ApiTags("projects")
@Controller({ path: "projects", version: "1" })
export class ProjectConfigController {
  private readonly _logger = new Logger(ProjectConfigController.name);

  constructor(private readonly _facade: ProjectConfigFacade) {}

  @Get()
  @ApiOperation({ summary: "List projects" })
  async list() {
    return this._facade.listProjects();
  }

  @Post("import")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: "Create a project from a configuration document",
    description:
      "Always creates a new project; never merges into an existing one. " +
      "Returns the minted actor and signing key credentials, which are shown " +
      "once and cannot be recovered afterwards.",
  })
  @ApiResponse({ status: 201, description: "Created, with credentials" })
  @ApiResponse({ status: 400, description: "Malformed document" })
  async import(@Body() doc: ProjectConfigDocDto) {
    return this._facade.importProject(doc);
  }

  @Get(":projectId/export")
  @ApiOperation({
    summary: "Export a project as a configuration document",
    description:
      "Contains no secrets, so the result is safe to keep in version control. " +
      "Re-importing mints fresh credentials.",
  })
  @ApiResponse({ status: 200, description: "The document" })
  @ApiResponse({ status: 404, description: "No such project" })
  async export(@Param("projectId") projectId: string) {
    this._assertUuid(projectId);
    return this._facade.exportProject(projectId);
  }

  @Delete(":projectId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: "Delete a project and all of its configuration",
    description:
      "Irreversible. Removes every app, room, lobby, scope, actor and signing " +
      "key belonging to the project.",
  })
  @ApiResponse({ status: 204, description: "Deleted" })
  async remove(@Param("projectId") projectId: string): Promise<void> {
    this._assertUuid(projectId);
    await this._facade.deleteProject(projectId);
  }

  private _assertUuid(value: string): void {
    if (!isUuid(value)) {
      throw badRequest(this._logger, "Invalid project id");
    }
  }
}

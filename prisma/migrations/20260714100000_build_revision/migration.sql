ALTER TABLE "Project"
ADD COLUMN "configurationRevision" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "BuildJob"
ADD COLUMN "projectRevision" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "BuildJob_projectId_type_status_projectRevision_idx"
ON "BuildJob"("projectId", "type", "status", "projectRevision");

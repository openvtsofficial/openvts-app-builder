import type { Asset, Project } from "@/generated/prisma/client";
import type { StudioProject } from "@/lib/types";

export function toStudioProject(project: Project & { assets?: Asset[] }): StudioProject {
  const assets = project.assets ?? [];
  const latest = (kind: Asset["kind"]) => assets.filter((asset) => asset.kind === kind).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
  const light = latest("LOGO_LIGHT");
  const dark = latest("LOGO_DARK");
  const preview = latest("ICON_PREVIEW");
  const icons = latest("ICON_KITCHEN_ARCHIVE");
  return {
    id: project.id,
    name: project.name,
    slug: project.slug,
    description: project.description ?? undefined,
    androidApplicationName: project.androidApplicationName,
    iosApplicationName: project.iosApplicationName,
    androidPackageName: project.androidPackageName,
    iosBundleId: project.iosBundleId,
    apiBaseUrl: project.apiBaseUrl,
    accentColor: project.accentColor,
    logoLightUrl: light ? `/api/assets/${light.id}` : undefined,
    logoDarkUrl: dark ? `/api/assets/${dark.id}` : undefined,
    iconPreviewUrl: preview ? `/api/assets/${preview.id}` : undefined,
    iconArchiveName: icons?.originalName,
    iconManifest: project.iconManifest as unknown as StudioProject["iconManifest"],
    templateVersion: project.templateVersion,
    configurationRevision: project.configurationRevision,
    status: project.status,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
  };
}

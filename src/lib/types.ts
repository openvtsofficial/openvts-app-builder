export type ProjectStatus = "DRAFT" | "READY" | "BUILDING" | "FAILED" | "ARCHIVED";
export type BuildType = "DEBUG_APK" | "RELEASE_APK" | "SIGNED_APK" | "RELEASE_AAB" | "SOURCE_ZIP";
export type BuildStatus =
  | "QUEUED"
  | "PREPARING"
  | "CUSTOMIZING"
  | "RESOLVING_DEPENDENCIES"
  | "COMPILING"
  | "SIGNING"
  | "UPLOADING"
  | "SUCCEEDED"
  | "FAILED"
  | "CANCELLED";

export interface StudioProject {
  id: string;
  name: string;
  slug: string;
  description?: string;
  androidApplicationName: string;
  iosApplicationName: string;
  androidPackageName: string;
  iosBundleId: string;
  accentColor: string;
  logoLightUrl?: string;
  logoDarkUrl?: string;
  iconPreviewUrl?: string;
  iconArchiveName?: string;
  iconManifest?: IconKitchenManifest;
  templateVersion: string;
  configurationRevision: number;
  status: ProjectStatus;
  updatedAt: string;
  createdAt: string;
}

export interface IconKitchenManifest {
  valid: boolean;
  fileCount: number;
  platforms: { android: boolean; ios: boolean; web: boolean };
  missing: string[];
  warnings: string[];
  sampleIconPath?: string;
}

export interface StudioBuild {
  id: string;
  projectId: string;
  type: BuildType;
  projectRevision: number;
  status: BuildStatus;
  progress: number;
  currentStage: string;
  etaSeconds?: number;
  createdAt: string;
  finishedAt?: string;
  artifactName?: string;
}

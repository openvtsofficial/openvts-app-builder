import { z } from "zod";

export const androidPackageRegex = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*){1,}$/;
export const iosBundleRegex = /^[A-Za-z][A-Za-z0-9-]*(\.[A-Za-z][A-Za-z0-9-]*){1,}$/;

export const apiBaseUrlSchema = z
  .string()
  .trim()
  .url("Must be a valid URL")
  .regex(/^https?:\/\//, "Must start with http:// or https://")
  .refine((url) => !url.endsWith("/"), { message: "Remove the trailing slash" })
  .default("https://app.openvts.io/api");

export const projectSchema = z.object({
  name: z.string().trim().min(2).max(60),
  androidApplicationName: z.string().trim().min(2).max(50),
  iosApplicationName: z.string().trim().min(2).max(30),
  androidPackageName: z.string().trim().regex(androidPackageRegex, "Use a reverse-domain name such as com.company.app"),
  iosBundleId: z.string().trim().regex(iosBundleRegex, "Use a bundle identifier such as com.company.app"),
  apiBaseUrl: apiBaseUrlSchema,
  accentColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default("#111111"),
  description: z.string().trim().max(240).optional(),
});

export type ProjectInput = z.infer<typeof projectSchema>;

export function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

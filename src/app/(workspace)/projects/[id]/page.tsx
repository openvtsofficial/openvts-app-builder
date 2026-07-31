import type { Metadata } from "next";
import { ProjectPage } from "@/components/studio/project-page";

export const metadata: Metadata = { title: "Application studio" };

export default async function StudioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ProjectPage id={id} />;
}

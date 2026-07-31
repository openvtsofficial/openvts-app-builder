import type { Metadata } from "next";
import { NewProjectForm } from "@/components/studio/new-project-form";

export const metadata: Metadata = { title: "Create application" };

export default function NewProjectPage() {
  return <NewProjectForm />;
}

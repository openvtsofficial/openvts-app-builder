import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { StudioProvider } from "@/components/studio-provider";
import { WorkspaceShell } from "@/components/workspace-shell";
import { isDemoMode } from "@/lib/env";

export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session && !isDemoMode) redirect("/");
  return (
    <StudioProvider>
      <WorkspaceShell user={session?.user ?? { name: "Demo Workspace", email: "demo@openvts.io" }}>{children}</WorkspaceShell>
    </StudioProvider>
  );
}

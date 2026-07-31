import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { LoginScreen } from "@/components/login-screen";

export default async function HomePage() {
  const session = await auth();
  if (session) redirect("/dashboard");
  return <LoginScreen />;
}

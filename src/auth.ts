import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/db";
import { env, isDemoMode } from "@/lib/env";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: isDemoMode ? undefined : PrismaAdapter(prisma),
  secret: env.AUTH_SECRET,
  providers: [
    Google({
      clientId: env.AUTH_GOOGLE_ID,
      clientSecret: env.AUTH_GOOGLE_SECRET,
      allowDangerousEmailAccountLinking: false,
    }),
  ],
  session: { strategy: isDemoMode ? "jwt" : "database" },
  pages: { signIn: "/" },
  callbacks: {
    authorized: async ({ auth: session }) => isDemoMode || Boolean(session),
    session: async ({ session, user, token }) => {
      if (session.user) {
        session.user.id = user?.id ?? token?.sub ?? "demo-user";
      }
      return session;
    },
  },
  trustHost: true,
});

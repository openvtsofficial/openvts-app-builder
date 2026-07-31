import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "OpenVTS App Studio", template: "%s · OpenVTS App Studio" },
  description: "Build and brand production-ready Flutter applications without touching code.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{const t=localStorage.getItem('openvts-theme');document.documentElement.dataset.theme=t||'light'}catch{}`,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}

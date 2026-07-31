import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "OpenVTS App Studio", template: "%s · OpenVTS App Studio" },
  description: "Build and brand production-ready Flutter applications without touching code.",
  robots: { index: false, follow: false },
  icons: {
    icon: [
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon.svg", type: "image/svg+xml" },
    ],
    apple: "/apple-touch-icon.png",
  },
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

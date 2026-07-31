"use client";

import { Eye, Lock, Moon, Settings2, Signal, User, Wifi } from "lucide-react";
import { BrandMark } from "@/components/brand";
import { cn } from "@/lib/cn";
import type { StudioProject } from "@/lib/types";

export function AppPreview({ project, platform, appearance, onPlatformChange, onAppearanceChange }: {
  project: StudioProject;
  platform: "android" | "ios";
  appearance: "light" | "dark";
  onPlatformChange: (value: "android" | "ios") => void;
  onAppearanceChange: (value: "light" | "dark") => void;
}) {
  const dark = appearance === "dark";
  const appName = platform === "android" ? project.androidApplicationName : project.iosApplicationName;
  const logo = dark ? project.logoDarkUrl || project.logoLightUrl : project.logoLightUrl || project.logoDarkUrl;
  const bg = dark ? "#1a1a1a" : "#f5f5f5";
  const fg = dark ? "#f4f5f1" : "#171815";
  const muted = dark ? "#969b94" : "#74786f";
  const cardBg = dark ? "#222222" : "#ffffff";
  const inputBg = dark ? "#2a2a2a" : "#f8f8f8";
  const inputBorder = dark ? "#3a3a3a" : "#e8e8e8";

  return (
    <div className="flex min-h-[660px] flex-col rounded-[22px] border border-[var(--line)] bg-[var(--surface)] p-4 shadow-[var(--shadow-card)] sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] pb-4">
        <div><p className="text-[10px] font-bold uppercase tracking-[.14em] text-[var(--subtle)]">Live application preview</p><p className="mt-1 text-[11px] text-[var(--muted)]">Brand changes update instantly.</p></div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-[10px] bg-[var(--accent-soft)] p-1">{(["android", "ios"] as const).map((value) => <button key={value} onClick={() => onPlatformChange(value)} className={cn("h-7 rounded-[7px] px-3 text-[9px] font-bold capitalize transition", platform === value ? "bg-[var(--surface)] text-[var(--foreground)] shadow-sm" : "text-[var(--muted)]")}>{value}</button>)}</div>
          <div className="flex rounded-[10px] bg-[var(--accent-soft)] p-1">{(["light", "dark"] as const).map((value) => <button key={value} onClick={() => onAppearanceChange(value)} className={cn("h-7 rounded-[7px] px-3 text-[9px] font-bold capitalize transition", appearance === value ? "bg-[var(--surface)] text-[var(--foreground)] shadow-sm" : "text-[var(--muted)]")}>{value}</button>)}</div>
        </div>
      </div>

      <div className="quiet-grid relative mt-4 flex flex-1 items-center justify-center overflow-hidden rounded-[18px] border border-[var(--line)] bg-[var(--background)] px-4 py-8">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,color-mix(in_srgb,var(--surface)_95%,transparent),transparent_20rem)]" />
        <div className={cn("relative w-[292px] border-[7px] border-[#171816] bg-[#171816] p-[3px] shadow-[0_30px_70px_rgb(0_0_0/28%)]", platform === "ios" ? "rounded-[43px]" : "rounded-[31px]")}>
          <div className={cn("relative h-[590px] overflow-hidden", platform === "ios" ? "rounded-[33px]" : "rounded-[21px]")} style={{ background: bg, color: fg }}>
            {/* Status bar */}
            <div className="flex h-7 items-center justify-between px-4 text-[7px] font-bold" style={{ background: "transparent" }}>
              <span>11:05</span>
              {platform === "ios" ? <span className="absolute left-1/2 top-1 h-4 w-[72px] -translate-x-1/2 rounded-full bg-[#060606]" /> : null}
              <span className="flex items-center gap-1"><Signal className="size-2.5" /><Wifi className="size-2.5" /><span className="h-2.5 w-4 rounded-[2px] border border-current p-[1px]"><span className="block h-full w-[75%] bg-current" /></span></span>
            </div>

            {/* Map background with roads */}
            <div className="absolute inset-0 overflow-hidden" style={{ background: dark ? "#2a2d2a" : "#eae8e3" }}>
              <svg className="absolute inset-0 size-full opacity-40" viewBox="0 0 280 600" fill="none">
                <path d="M-20 100 L80 100 L80 250 L180 250 L180 450 L280 450" stroke={dark ? "#555" : "#ccc"} strokeWidth="12" />
                <path d="M140 -20 L140 180 L240 180 L240 380 L140 380 L140 620" stroke={dark ? "#555" : "#ccc"} strokeWidth="12" />
                <path d="M-20 350 L60 350 L60 500 L300 500" stroke={dark ? "#555" : "#ccc"} strokeWidth="8" />
                <path d="M200 -20 L200 120 L300 120" stroke={dark ? "#555" : "#ccc"} strokeWidth="8" />
                <path d="M-20 200 L40 200 L40 400 L100 400 L100 600" stroke={dark ? "#444" : "#ddd"} strokeWidth="6" />
                <path d="M60 -20 L60 60 L200 60 L200 160" stroke={dark ? "#444" : "#ddd"} strokeWidth="6" />
                {/* Road labels - subtle text */}
                <text x="20" y="96" fill={dark ? "#666" : "#bbb"} fontSize="5" fontFamily="sans-serif">W 69th St</text>
                <text x="144" y="176" fill={dark ? "#666" : "#bbb"} fontSize="5" fontFamily="sans-serif">Main Ave</text>
                <text x="64" y="346" fill={dark ? "#666" : "#bbb"} fontSize="5" fontFamily="sans-serif">Church Ave</text>
                <text x="204" y="116" fill={dark ? "#666" : "#bbb"} fontSize="5" fontFamily="sans-serif">8th Ave</text>
              </svg>
            </div>

            {/* Top right icons - dark mode toggle and settings */}
            <div className="relative z-10 flex justify-end gap-2 px-4 pt-2">
              <span className="grid size-9 place-items-center rounded-xl border shadow-sm" style={{ background: cardBg, borderColor: inputBorder }}>
                <Moon className="size-4" style={{ color: fg }} />
              </span>
              <span className="grid size-9 place-items-center rounded-xl border shadow-sm" style={{ background: cardBg, borderColor: inputBorder }}>
                <Settings2 className="size-4" style={{ color: fg }} />
              </span>
            </div>

            {/* Login card */}
            <div className="relative z-10 mx-4 mt-16 rounded-2xl border p-5 shadow-lg" style={{ background: cardBg, borderColor: inputBorder }}>
              {/* Logo */}
              <div className="mb-6 flex items-center justify-center">
                {logo ? <img src={logo} alt="" className="h-10 w-auto object-contain" /> : <BrandMark className="size-10" />}
              </div>

              {/* Username field */}
              <div className="mb-3">
                <label className="mb-1.5 block text-[7px] font-bold" style={{ color: fg }}>Username</label>
                <div className="flex items-center gap-2 rounded-xl border px-3 py-2.5" style={{ background: inputBg, borderColor: inputBorder }}>
                  <User className="size-3.5" style={{ color: muted }} />
                  <span className="text-[8px]" style={{ color: muted }}>Enter your username</span>
                </div>
              </div>

              {/* Password field */}
              <div className="mb-3">
                <label className="mb-1.5 block text-[7px] font-bold" style={{ color: fg }}>Password</label>
                <div className="flex items-center justify-between rounded-xl border px-3 py-2.5" style={{ background: inputBg, borderColor: inputBorder }}>
                  <div className="flex items-center gap-2">
                    <Lock className="size-3.5" style={{ color: muted }} />
                    <span className="text-[8px]" style={{ color: muted }}>Enter your passw...</span>
                  </div>
                  <Eye className="size-3.5" style={{ color: muted }} />
                </div>
              </div>

              {/* Forgot password */}
              <div className="mb-4 text-right">
                <span className="text-[7px] font-medium" style={{ color: project.accentColor }}>Forgot Password?</span>
              </div>

              {/* Login button */}
              <button className="flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-[9px] font-bold text-white" style={{ background: dark ? "#333" : "#1a1a1a" }}>
                Login
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M3 2l3 3-3 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </button>
            </div>

            {/* Bottom navigation bar (Android) */}
            {platform === "android" ? (
              <div className="absolute inset-x-0 bottom-0 flex h-6 items-center justify-center">
                <span className="h-1 w-16 rounded-full" style={{ background: fg, opacity: 0.3 }} />
              </div>
            ) : (
              <span className="absolute bottom-1 left-1/2 h-1 w-20 -translate-x-1/2 rounded-full" style={{ background: fg, opacity: 0.3 }} />
            )}
          </div>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-[9px] text-[var(--muted)]"><span>{platform === "android" ? "Pixel 9 · Android 16" : "iPhone 16 · iOS 19"}</span><code className="rounded-md bg-[var(--accent-soft)] px-2 py-1 font-mono">{platform === "android" ? project.androidPackageName : project.iosBundleId}</code></div>
    </div>
  );
}

"use client";

import { Bell, CarFront, Gauge, LocateFixed, Map, Navigation, Route, Settings2, Signal, Wifi } from "lucide-react";
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
  const surface = dark ? "#111311" : "#ffffff";
  const bg = dark ? "#080a09" : "#f3f4f0";
  const fg = dark ? "#f4f5f1" : "#171815";
  const muted = dark ? "#969b94" : "#74786f";
  const line = dark ? "#282c28" : "#e1e4de";

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
            <div className="flex h-7 items-center justify-between px-4 text-[7px] font-bold" style={{ background: surface }}>
              <span>9:41</span>
              {platform === "ios" ? <span className="absolute left-1/2 top-1 h-4 w-[72px] -translate-x-1/2 rounded-full bg-[#060606]" /> : null}
              <span className="flex items-center gap-1"><Signal className="size-2.5" /><Wifi className="size-2.5" /><span className="h-2.5 w-4 rounded-[2px] border border-current p-[1px]"><span className="block h-full w-[75%] bg-current" /></span></span>
            </div>
            <div className="flex h-14 items-center justify-between border-b px-3.5" style={{ background: surface, borderColor: line }}>
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="grid size-8 shrink-0 place-items-center overflow-hidden rounded-[9px]" style={{ background: project.accentColor }}>
                  {logo ? <img src={logo} alt="" className="max-h-6 max-w-6 object-contain" /> : <BrandMark className="size-6 rounded-[7px] border border-white/15 bg-transparent text-white" />}
                </span>
                <span className="min-w-0"><span className="block truncate text-[9px] font-extrabold">{appName || "Your Application"}</span><span className="mt-0.5 flex items-center gap-1 text-[6px]" style={{ color: muted }}><span className="size-1 rounded-full bg-[#35a568]" />12 vehicles online</span></span>
              </div>
              <span className="relative grid size-8 place-items-center rounded-[9px]" style={{ background: bg }}><Bell className="size-3.5" /><span className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-[#e54c47] ring-2" style={{ "--tw-ring-color": bg } as React.CSSProperties} /></span>
            </div>

            <div className="p-3">
              <div className="relative h-[245px] overflow-hidden rounded-[16px] border" style={{ borderColor: line, background: dark ? "#171b18" : "#e9ece6" }}>
                <div className="absolute inset-0 opacity-60" style={{ backgroundImage: `linear-gradient(35deg, transparent 48%, ${dark ? "#30362f" : "#d2d7cf"} 49%, ${dark ? "#30362f" : "#d2d7cf"} 51%, transparent 52%), linear-gradient(125deg, transparent 48%, ${dark ? "#30362f" : "#d2d7cf"} 49%, ${dark ? "#30362f" : "#d2d7cf"} 51%, transparent 52%)`, backgroundSize: "62px 54px" }} />
                <svg className="absolute inset-0 size-full" viewBox="0 0 260 245" fill="none"><path d="M-10 212C38 180 44 147 92 145C143 143 131 86 183 82C222 78 234 37 275 28" stroke="white" strokeWidth="8" strokeLinecap="round" opacity={dark ? .12 : .8} /><path d="M-10 212C38 180 44 147 92 145C143 143 131 86 183 82C222 78 234 37 275 28" stroke={project.accentColor} strokeWidth="3" strokeLinecap="round" /></svg>
                <span className="absolute left-[44%] top-[47%] grid size-8 place-items-center rounded-full border-[3px] border-white text-white shadow-lg" style={{ background: project.accentColor }}><Navigation className="size-3.5 fill-current" /></span>
                <div className="absolute left-3 right-3 top-3 flex items-center justify-between"><span className="rounded-lg bg-white/90 px-2.5 py-1.5 text-[7px] font-bold text-[#161715] shadow-sm">Live map</span><span className="grid size-7 place-items-center rounded-lg bg-white/90 text-[#161715] shadow-sm"><LocateFixed className="size-3" /></span></div>
                <div className="absolute bottom-3 left-3 right-3 rounded-xl bg-white/94 p-2.5 text-[#171815] shadow-[0_10px_30px_rgb(0_0_0/16%)] backdrop-blur"><div className="flex items-center justify-between"><span className="flex items-center gap-2"><span className="grid size-7 place-items-center rounded-lg bg-[#eef0eb]"><CarFront className="size-3" /></span><span><span className="block text-[7px] font-extrabold">Truck 1247</span><span className="block text-[5px] text-[#7d8179]">Moving · 2 min ago</span></span></span><span className="text-[10px] font-extrabold">68 <small className="text-[5px] font-semibold">km/h</small></span></div></div>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2">
                {[{ label: "Fleet", value: "24", icon: CarFront }, { label: "On trip", value: "09", icon: Route }, { label: "Distance", value: "842 km", icon: Gauge }, { label: "Alerts", value: "03", icon: Bell }].map((item) => <div key={item.label} className="rounded-xl border p-2.5" style={{ background: surface, borderColor: line }}><div className="flex items-center justify-between"><item.icon className="size-3" style={{ color: muted }} /><span className="text-[9px] font-extrabold">{item.value}</span></div><p className="mt-2 text-[6px] font-semibold" style={{ color: muted }}>{item.label}</p></div>)}
              </div>
            </div>

            <div className={cn("absolute inset-x-0 bottom-0 grid h-[54px] grid-cols-4 border-t px-2", platform === "ios" && "pb-2")} style={{ background: surface, borderColor: line }}>
              {[{ label: "Map", icon: Map }, { label: "Trips", icon: Route }, { label: "Fleet", icon: CarFront }, { label: "Settings", icon: Settings2 }].map((item, index) => <div key={item.label} className="grid place-items-center content-center gap-1 text-[5px] font-bold" style={{ color: index === 0 ? project.accentColor : muted }}><item.icon className="size-3.5" />{item.label}</div>)}
              {platform === "ios" ? <span className="absolute bottom-1 left-1/2 h-1 w-20 -translate-x-1/2 rounded-full" style={{ background: fg }} /> : null}
            </div>
          </div>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-[9px] text-[var(--muted)]"><span>{platform === "android" ? "Pixel 9 · Android 16" : "iPhone 16 · iOS 19"}</span><code className="rounded-md bg-[var(--accent-soft)] px-2 py-1 font-mono">{platform === "android" ? project.androidPackageName : project.iosBundleId}</code></div>
    </div>
  );
}

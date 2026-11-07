"use client";

import type { ButtonHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";

export function Button({
  variant = "default",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "default" | "primary" | "ghost" | "danger" }) {
  const styles = {
    default: "bg-white/10 hover:bg-white/15 text-white",
    primary: "bg-accent hover:bg-accent/90 text-white",
    ghost: "hover:bg-white/10 text-white/70",
    danger: "bg-red-500/15 hover:bg-red-500/25 text-red-300",
  }[variant];
  return (
    <button
      className={`inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${styles} ${className}`}
      {...props}
    />
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-white/60">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-white/40">{hint}</span>}
    </label>
  );
}

export const inputCls =
  "w-full rounded-lg border border-line bg-black/40 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-accent focus:outline-none";

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${inputCls} ${props.className ?? ""}`} />;
}

export function Panel({ title, children, actions }: { title?: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-panel p-4">
      {(title || actions) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          {title && <h2 className="text-sm font-semibold text-white/80">{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function Badge({ children, tone = "default" }: { children: ReactNode; tone?: "default" | "accent" | "warn" }) {
  const c = {
    default: "bg-black/60 text-white/90",
    accent: "bg-accent/80 text-white",
    warn: "bg-amber-500/80 text-black",
  }[tone];
  return <span className={`inline-block whitespace-nowrap rounded-md px-1.5 py-0.5 text-[11px] font-medium backdrop-blur ${c}`}>{children}</span>;
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 text-xs text-white/60">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/20 border-t-accent" />
      {label}
    </div>
  );
}

export function KeyWarning({ show, children }: { show: boolean; children: ReactNode }) {
  if (!show) return null;
  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">{children}</div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-dashed border-line p-10 text-center text-sm text-white/40">{children}</div>;
}

import { Link } from "@tanstack/react-router";
import {
  LayoutDashboard,
  ShoppingCart,
  Boxes,
  Factory,
  Truck,
  Wallet,
  Sparkles,
  History,
  UploadCloud,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { useOps } from "@/lib/ops-store";
import { cn } from "@/lib/utils";

const NAV: { to: string; label: string; icon: LucideIcon }[] = [
  { to: "/", label: "Overview", icon: LayoutDashboard },
  { to: "/upload", label: "Upload", icon: UploadCloud },
  { to: "/orders", label: "Orders", icon: ShoppingCart },
  { to: "/inventory", label: "Inventory", icon: Boxes },
  { to: "/production", label: "Production", icon: Factory },
  { to: "/logistics", label: "Logistics", icon: Truck },
  { to: "/finance", label: "Finance", icon: Wallet },
];

function NavItem({ to, label, icon: Icon, badge }: { to: string; label: string; icon: LucideIcon; badge?: number }) {
  return (
    <Link
      to={to}
      className="group flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
      activeProps={{ className: "bg-surface-2 text-foreground" }}
      activeOptions={{ exact: to === "/" }}
    >
      <Icon className="size-4 shrink-0 opacity-80" />
      <span className="truncate">{label}</span>
      {badge ? (
        <span className="num ml-auto rounded-full bg-destructive/15 px-1.5 py-0.5 text-[10px] font-medium text-destructive">
          {badge}
        </span>
      ) : null}
    </Link>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { openExceptions } = useOps();

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto flex min-h-screen w-full max-w-[1600px]">
        <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-border bg-surface/60 px-3 py-4 md:flex">
          <div className="flex items-center gap-2.5 px-2.5 pb-5">
            <div className="grid size-7 place-items-center rounded-md bg-primary text-primary-foreground">
              <Sparkles className="size-4" />
            </div>
            <div className="leading-tight">
              <div className="text-sm font-semibold">Nusantara Seller</div>
              <div className="text-[11px] text-muted-foreground">Operations workspace</div>
            </div>
          </div>

          <nav className="flex flex-col gap-0.5">
            {NAV.map((n) => (
              <NavItem key={n.to} {...n} />
            ))}
          </nav>

          <div className="mt-6 px-2.5 pb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            AI Operations
          </div>
          <nav className="flex flex-col gap-0.5">
            <NavItem to="/ai-operations" label="Exceptions" icon={Sparkles} badge={openExceptions.length} />
            <NavItem to="/ai-operations/history" label="Action history" icon={History} />
          </nav>

          <div className="mt-auto rounded-md border border-border bg-surface-2/60 p-3 text-[11px] leading-relaxed text-muted-foreground">
            Human-in-the-loop mode. AI never executes irreversible actions without approval.
          </div>
        </aside>

        <main className="min-w-0 flex-1">
          <div className="flex items-center gap-2 border-b border-border px-4 py-2.5 md:hidden">
            <div className="grid size-6 place-items-center rounded bg-primary text-primary-foreground">
              <Sparkles className="size-3.5" />
            </div>
            <span className="text-sm font-semibold">Nusantara Seller</span>
            <Link to="/ai-operations" className="ml-auto text-xs text-primary">
              AI Operations
            </Link>
          </div>
          {children}
        </main>
      </div>
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="border-b border-border px-6 py-6 md:px-8">
      {eyebrow ? (
        <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{eyebrow}</div>
      ) : null}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold md:text-2xl">{title}</h1>
          {description ? <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">{description}</p> : null}
        </div>
        {actions}
      </div>
    </div>
  );
}

export function SeverityDot({ severity }: { severity: string }) {
  return (
    <span
      className={cn(
        "inline-block size-1.5 rounded-full",
        severity === "critical" && "bg-destructive",
        severity === "high" && "bg-warning",
        severity === "medium" && "bg-info",
      )}
    />
  );
}

export function Chip({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: "neutral" | "danger" | "warning" | "success" | "primary";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium",
        tone === "neutral" && "border-border bg-surface-2 text-muted-foreground",
        tone === "danger" && "border-destructive/30 bg-destructive/10 text-destructive",
        tone === "warning" && "border-warning/30 bg-warning/10 text-warning",
        tone === "success" && "border-success/30 bg-success/10 text-success",
        tone === "primary" && "border-primary/40 bg-primary/12 text-foreground",
        className,
      )}
    >
      {children}
    </span>
  );
}

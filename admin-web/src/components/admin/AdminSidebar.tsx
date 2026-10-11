import { Link } from "@tanstack/react-router";
import { TenantLogo } from "@/components/TenantLogo";
import { MobileBottomNav, type MobileNavItem } from "@/components/mobile/MobileBottomNav";
import { SidebarToggle } from "@/components/SidebarToggle";
import { useSidebarCollapsed } from "@/hooks/use-sidebar-collapsed";
import {
  BarChart3,
  Building2,
  Layers,
  FileCheck2,
  FileText,
  LayoutDashboard,
  LogOut,
  Settings,
  Shield,
  ShoppingBag,
  Users,
  UsersRound,
  X,
} from "lucide-react";
import { useAdminSignOut } from "@/hooks/use-admin-sign-out";
import { useCurrentUser } from "@/hooks/use-current-user";

export interface AdminSidebarProps {
  currentPath?: string;
  isOpen?: boolean;
  onClose?: () => void;
}

export function AdminSidebar({ currentPath = "/admin/dashboard", onClose }: AdminSidebarProps) {
  const [collapsed, toggleCollapsed] = useSidebarCollapsed();
  const { signOut: handleLogout, isSigningOut: isLoggingOut } = useAdminSignOut();

  const { data: me } = useCurrentUser();
  const isPlatform = me?.role === "SUPER_ADMIN";

  const platformItems = [
    { label: "Tenants", href: "/admin/tenants", icon: Building2 },
    { label: "Settings", href: "/admin/platform-settings", icon: Settings },
  ];
  const tenantItems = [
    { label: "Dashboard", href: "/admin/dashboard", icon: LayoutDashboard },
    { label: "Agents", href: "/admin/agents", icon: UsersRound },
    { label: "Customers", href: "/admin/customers", icon: Users },
    { label: "Catalog", href: "/admin/catalog", icon: Layers },
    { label: "Policies", href: "/admin/policies", icon: Shield },
    { label: "Sold Policies", href: "/admin/sold-policies", icon: ShoppingBag },
    { label: "Reports", href: "/admin/reports", icon: BarChart3 },
    { label: "Settings", href: "/admin/settings", icon: Settings },
  ];
  const navItems = isPlatform ? platformItems : tenantItems;

  const byLabel = (label: string) => navItems.find((item) => item.label === label);
  const toMobile = (labels: string[]): MobileNavItem[] =>
    labels.flatMap((label) => {
      const item = byLabel(label);
      return item
        ? [
            {
              label: item.label,
              icon: item.icon,
              href: item.href,
            },
          ]
        : [];
    });
  const mobilePrimary = isPlatform
    ? toMobile(["Tenants", "Settings"])
    : toMobile(["Dashboard", "Sold Policies", "Agents", "Reports"]).map((item) =>
        item.label === "Sold Policies" ? { ...item, label: "Sold" } : item,
      );
  const mobileMore = isPlatform
    ? []
    : toMobile(["Customers", "Policies", "Catalog", "Settings"]);

  const renderContent = (compact: boolean) => (
    <div className="flex h-full flex-col justify-between overflow-x-hidden bg-background text-foreground border-r border-border/80">
      {/* Brand Header */}
      <div>
        <div
          className={`flex h-16 items-center border-b border-border/70 ${compact ? "justify-center px-2" : "justify-between px-6"}`}
        >
          <Link
            to={isPlatform ? "/admin/tenants" : "/admin/dashboard"}
            title={compact ? (me?.tenant?.name ?? "InsuroX") : undefined}
            className="flex items-center gap-2.5 transition-opacity hover:opacity-90"
          >
            <TenantLogo logoUrl={me?.tenant?.logoUrl} name={me?.tenant?.name} size="lg" />
            {!compact && (
              <div className="flex flex-col">
                <span className="font-display text-sm font-extrabold tracking-tight leading-tight">
                  {me?.tenant?.name ?? "InsuroX"}
                </span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-primary">
                  Prime Admin
                </span>
              </div>
            )}
          </Link>

          {/* Mobile close button */}
          {onClose && !compact && (
            <button
              type="button"
              onClick={onClose}
              className="grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground lg:hidden cursor-pointer"
              aria-label="Close navigation"
            >
              <X className="size-5" />
            </button>
          )}
        </div>

        {/* Navigation List */}
        <div className="px-3 py-4">
          {!compact && (
            <p className="px-3 pb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Main Menu
            </p>
          )}
          <nav className="space-y-1" aria-label="Sidebar navigation">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentPath === item.href;

              return (
                <Link
                  key={item.label}
                  to={item.href}
                  onClick={onClose}
                  title={compact ? item.label : undefined}
                  aria-label={item.label}
                  className={`flex items-center gap-3 rounded-xl py-2.5 text-sm font-medium transition-colors ${compact ? "justify-center px-0" : "px-3.5"} ${
                    isActive
                      ? "bg-primary text-primary-foreground shadow-sm font-semibold"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  <Icon className="size-4 shrink-0" />
                  {!compact && <span>{item.label}</span>}
                  {isActive && !compact && (
                    <span className="ml-auto size-1.5 rounded-full bg-signal" />
                  )}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Footer Profile & Logout */}
      <div className={`border-t border-border/80 ${compact ? "p-2" : "p-4"}`}>
        <div
          title={compact ? (me?.tenant?.name ?? me?.email ?? "Admin") : undefined}
          className={`mb-3 flex items-center gap-3 rounded-xl bg-surface/60 border border-border/50 ${compact ? "justify-center p-1.5" : "p-2.5"}`}
        >
          <div className="grid size-9 place-items-center rounded-full bg-primary/10 text-primary font-bold text-xs ring-2 ring-primary/20">
            {(me?.tenant?.name ?? me?.email ?? "SA").slice(0, 2).toUpperCase()}
          </div>
          {!compact && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-bold text-foreground leading-tight">
                {me?.tenant?.name ?? me?.email ?? "Admin"}
              </p>
              <p className="truncate text-[11px] text-muted-foreground">
                {isPlatform ? "Platform Admin" : "Agency Admin"}
              </p>
            </div>
          )}
          {!compact && <span className="size-2 rounded-full bg-signal shrink-0" title="Online" />}
        </div>

        <button
          type="button"
          onClick={handleLogout}
          disabled={isLoggingOut}
          title={compact ? "Logout" : undefined}
          aria-label="Logout"
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-background py-2 text-xs font-semibold text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30 disabled:opacity-60"
        >
          <LogOut className="size-3.5" />
          {!compact && <span>{isLoggingOut ? "Logging out..." : "Logout"}</span>}
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Fixed Sidebar */}
      <aside className="app-sidebar hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-30 lg:flex lg:flex-col shadow-sm">
        {renderContent(collapsed)}
        <SidebarToggle collapsed={collapsed} onToggle={toggleCollapsed} />
      </aside>

      {/* Phones: bottom tab bar instead of a drawer */}
      <MobileBottomNav
        currentPath={currentPath}
        primary={mobilePrimary}
        more={mobileMore}
        account={{
          name: me?.tenant?.name ?? me?.email ?? "Admin",
          role: isPlatform ? "Platform Admin" : "Agency Admin",
        }}
        onLogout={handleLogout}
        isLoggingOut={isLoggingOut}
      />
    </>
  );
}

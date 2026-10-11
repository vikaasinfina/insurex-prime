import { Link } from "@tanstack/react-router";
import { TenantLogo } from "@/components/TenantLogo";
import { MobileBottomNav } from "@/components/mobile/MobileBottomNav";
import { SidebarToggle } from "@/components/SidebarToggle";
import { useSidebarCollapsed } from "@/hooks/use-sidebar-collapsed";
import { useState } from "react";
import { LayoutDashboard, LogOut, Shield, ShoppingBag, UserRound, Users, X } from "lucide-react";
import { initialsOf } from "@/lib/format";
import { useAgentSession } from "./agent-session-context";

export const agentNavItems = [
  { label: "Dashboard", href: "/agent/dashboard", icon: LayoutDashboard },
  { label: "Customers", href: "/agent/customers", icon: Users },
  { label: "Policies", href: "/agent/policies", icon: Shield },
  { label: "Sold Policies", href: "/agent/sold-policies", icon: ShoppingBag },
  { label: "Profile", href: "/agent/profile", icon: UserRound },
] as const;

export interface AgentSidebarProps {
  currentPath: string;
  isOpen: boolean;
  onClose: () => void;
}

export function AgentSidebar({ currentPath, isOpen, onClose }: AgentSidebarProps) {
  const { user, agent, signOut } = useAgentSession();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [collapsed, toggleCollapsed] = useSidebarCollapsed();

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await signOut();
    } finally {
      setIsLoggingOut(false);
    }
  };

  const renderContent = (compact: boolean) => (
    <div className="flex h-full flex-col justify-between overflow-x-hidden border-r border-border/80 bg-background text-foreground">
      <div className="min-h-0 overflow-y-auto">
        <div
          className={`flex h-16 items-center border-b border-border/70 ${compact ? "justify-center px-2" : "justify-between px-6"}`}
        >
          <Link
            to="/agent/dashboard"
            onClick={onClose}
            title={compact ? (user.tenant?.name ?? "InsuroX") : undefined}
            className="flex items-center gap-2.5 transition-opacity hover:opacity-90"
          >
            <TenantLogo logoUrl={user.tenant?.logoUrl} name={user.tenant?.name} size="lg" />
            {!compact && (
              <div className="flex flex-col">
                <span className="font-display text-sm font-extrabold leading-tight tracking-tight">
                  {user.tenant?.name ?? "InsuroX"}
                </span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-primary">
                  Agent Workspace
                </span>
              </div>
            )}
          </Link>
          {!compact && (
            <button
              type="button"
              onClick={onClose}
              className="grid size-8 cursor-pointer place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground lg:hidden"
              aria-label="Close navigation"
            >
              <X className="size-5" />
            </button>
          )}
        </div>

        <div className="px-3 py-4">
          {!compact && (
            <p className="px-3 pb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Main Menu
            </p>
          )}
          <nav className="space-y-1" aria-label="Agent navigation">
            {agentNavItems.map((item) => {
              const Icon = item.icon;
              // Recording a sale is reached from Sold Policies, so that tab stays highlighted.
              const isActive =
                currentPath === item.href ||
                currentPath.startsWith(`${item.href}/`) ||
                (item.href === "/agent/sold-policies" && currentPath === "/agent/sell-policy");
              return (
                <Link
                  key={item.href}
                  to={item.href}
                  onClick={onClose}
                  aria-current={isActive ? "page" : undefined}
                  title={compact ? item.label : undefined}
                  aria-label={item.label}
                  className={`flex items-center gap-3 rounded-xl py-2.5 text-sm font-medium transition-colors ${compact ? "justify-center px-0" : "px-3.5"} ${
                    isActive
                      ? "bg-primary font-semibold text-primary-foreground shadow-sm"
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

      <div className={`border-t border-border/80 ${compact ? "p-2" : "p-4"}`}>
        <Link
          to="/agent/profile"
          onClick={onClose}
          title={compact ? agent.fullName : undefined}
          className={`mb-3 flex items-center gap-3 rounded-xl border border-border/50 bg-surface/60 transition-colors hover:border-primary/30 ${compact ? "justify-center p-1.5" : "p-2.5"}`}
        >
          <div className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-bold text-primary ring-2 ring-primary/20">
            {initialsOf(agent.fullName)}
          </div>
          {!compact && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-bold leading-tight text-foreground">
                {agent.fullName}
              </p>
              <p className="truncate font-mono text-[11px] text-muted-foreground">
                {agent.agentCode}
              </p>
            </div>
          )}
          {!compact && (
            <span className="size-2 shrink-0 rounded-full bg-emerald-500" title="Active" />
          )}
        </Link>

        <button
          type="button"
          onClick={handleLogout}
          disabled={isLoggingOut}
          title={compact ? "Logout" : undefined}
          aria-label="Logout"
          className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-border bg-background py-2 text-xs font-semibold text-muted-foreground transition-colors hover:border-destructive/30 hover:bg-destructive/10 hover:text-destructive disabled:opacity-60"
        >
          <LogOut className="size-3.5" />
          {!compact && <span>{isLoggingOut ? "Logging out..." : "Logout"}</span>}
        </button>
      </div>
    </div>
  );

  return (
    <>
      <aside className="app-sidebar hidden shadow-sm lg:fixed lg:inset-y-0 lg:left-0 lg:z-30 lg:flex lg:flex-col">
        {renderContent(collapsed)}
        <SidebarToggle collapsed={collapsed} onToggle={toggleCollapsed} />
      </aside>

      <MobileBottomNav
        currentPath={currentPath}
        primary={[
          { label: "Home", icon: LayoutDashboard, href: "/agent/dashboard" },
          { label: "Customers", icon: Users, href: "/agent/customers" },
          {
            label: "Sold",
            icon: ShoppingBag,
            href: "/agent/sold-policies",
            // Recording a sale is reached from Sold Policies.
            alsoActiveFor: ["/agent/sell-policy"],
          },
        ]}
        more={[
          { label: "Policies", icon: Shield, href: "/agent/policies" },
          { label: "Profile", icon: UserRound, href: "/agent/profile" },
        ]}
        account={{ name: agent.fullName, role: `Agent · ${agent.agentCode}` }}
        onLogout={() => void handleLogout()}
        isLoggingOut={isLoggingOut}
      />
    </>
  );
}

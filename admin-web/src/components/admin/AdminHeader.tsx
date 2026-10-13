import { Link, useRouterState } from "@tanstack/react-router";
import { Bell, CheckCircle2, Menu, Shield } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ThemeToggle } from "@/components/ThemeToggle";
import { MobileTopBar, mobileIconButton } from "@/components/mobile/MobileTopBar";
import { useCurrentUser } from "@/hooks/use-current-user";
import type { AdminNotification } from "./admin-mock-data";

const PAGE_TITLES: Record<string, string> = {
  "/admin/dashboard": "Dashboard",
  "/admin/agents": "Agents",
  "/admin/customers": "Customers",
  "/admin/catalog": "Catalog",
  "/admin/policies": "Policies",
  "/admin/sold-policies": "Sold Policies",
  "/admin/notes": "Field Notes",
  "/admin/calendar": "Calendar",
  "/admin/reports": "Reports",
  "/admin/settings": "Settings",
  "/admin/platform-settings": "Platform Settings",
  "/admin/tenants": "Tenants",
};

export interface AdminHeaderProps {
  onToggleSidebar?: () => void;
}

export function AdminHeader({ onToggleSidebar }: AdminHeaderProps) {
  const { data: me } = useCurrentUser();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const pageTitle = PAGE_TITLES[pathname.replace(/\/$/, "")] ?? "Admin";
  const isTenantAdmin = me?.role === "TENANT_ADMIN";
  const roleLabel = isTenantAdmin
    ? "Agency Admin"
    : me?.role === "SUPER_ADMIN"
      ? "Platform Admin"
      : "Admin";
  // Agency admins keep their profile under Settings; platform admins under Platform Settings.
  const profileHref = isTenantAdmin ? "/admin/settings" : "/admin/platform-settings";
  const initials = (me?.tenant?.name ?? me?.email ?? "SA")
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
  const [notifications, setNotifications] = useState<AdminNotification[]>([]);
  const unreadCount = notifications.filter((n) => n.unread).length;

  const handleMarkAllRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, unread: false })));
    toast.success("All notifications marked as read");
  };

  const mobileBar = (
    <MobileTopBar eyebrow={me?.tenant?.name ?? "InsuroX Prime"} title={pageTitle}>
      <Popover>
        <PopoverTrigger asChild>
          <button type="button" className={mobileIconButton} aria-label="Open notifications">
            <Bell className="size-[22px]" />
            {unreadCount > 0 && (
              <span className="absolute right-2 top-2 flex size-4 items-center justify-center rounded-full bg-signal text-[10px] font-bold text-signal-foreground ring-2 ring-background">
                {unreadCount}
              </span>
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-80 p-0 rounded-2xl shadow-nav border-border">
          <div className="flex items-center justify-between border-b border-border p-3.5">
            <div className="flex items-center gap-2">
              <span className="font-bold text-xs">Notifications</span>
              {unreadCount > 0 && (
                <span className="rounded-full bg-signal/20 px-2 py-0.5 text-[10px] font-bold text-foreground">
                  {unreadCount} new
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                className="text-[11px] font-medium text-primary hover:underline cursor-pointer"
              >
                Mark all read
              </button>
            )}
          </div>
          <div className="divide-y divide-border/60 max-h-72 overflow-y-auto">
            {notifications.length === 0 && (
              <p className="p-4 text-center text-xs text-muted-foreground">No notifications yet</p>
            )}
            {notifications.map((notif) => (
              <div
                key={notif.id}
                className={`p-3 text-xs transition-colors hover:bg-muted/40 ${
                  notif.unread ? "bg-primary/5" : ""
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold text-foreground">{notif.title}</p>
                  <span className="text-[10px] text-muted-foreground shrink-0">{notif.time}</span>
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground leading-normal">
                  {notif.description}
                </p>
              </div>
            ))}
          </div>
          <div className="border-t border-border p-2.5 text-center">
            <span className="text-[11px] text-muted-foreground">
              Automated insurance event audit stream
            </span>
          </div>
        </PopoverContent>
      </Popover>
      <Link
        to={profileHref}
        aria-label="My profile"
        className="ml-1 grid size-8 shrink-0 place-items-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground"
      >
        {initials}
      </Link>
    </MobileTopBar>
  );

  return (
    <>
      {mobileBar}
      <header className="sticky top-0 z-20 hidden h-20 lg:flex w-full items-center justify-between border-b border-border/80 bg-background/80 px-4 sm:px-8 backdrop-blur-xl">
        {/* Left: Mobile Toggle & Page Title */}
        <div className="flex items-center gap-3.5">
          <button
            type="button"
            onClick={onToggleSidebar}
            className="grid size-10 place-items-center rounded-xl border border-border bg-background text-foreground hover:bg-muted lg:hidden cursor-pointer"
            aria-label="Open sidebar navigation"
          >
            <Menu className="size-5" />
          </button>

          <div>
            <h1 className="font-display text-xl font-extrabold tracking-tight text-foreground sm:text-2xl">
              {me?.tenant?.name ?? "Admin Dashboard"}
            </h1>
            <p className="text-xs text-muted-foreground hidden sm:block">
              {me?.tenant
                ? me.tenant.insurers.map((insurer) => insurer.name).join(" · ")
                : "Overview of your insurance operations"}
            </p>
          </div>
        </div>

        {/* Right: Notifications, Admin Profile */}
        <div className="flex items-center gap-2 sm:gap-3">
          <ThemeToggle />

          {/* Notification Popover */}
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="relative grid size-9 place-items-center rounded-xl border border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer transition-colors"
                aria-label="Open notifications"
              >
                <Bell className="size-4" />
                {unreadCount > 0 && (
                  <span className="absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-signal text-[10px] font-bold text-signal-foreground ring-2 ring-background">
                    {unreadCount}
                  </span>
                )}
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80 p-0 rounded-2xl shadow-nav border-border">
              <div className="flex items-center justify-between border-b border-border p-3.5">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-xs">Notifications</span>
                  {unreadCount > 0 && (
                    <span className="rounded-full bg-signal/20 px-2 py-0.5 text-[10px] font-bold text-foreground">
                      {unreadCount} new
                    </span>
                  )}
                </div>
                {unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={handleMarkAllRead}
                    className="text-[11px] font-medium text-primary hover:underline cursor-pointer"
                  >
                    Mark all read
                  </button>
                )}
              </div>
              <div className="divide-y divide-border/60 max-h-72 overflow-y-auto">
                {notifications.length === 0 && (
                  <p className="p-4 text-center text-xs text-muted-foreground">
                    No notifications yet
                  </p>
                )}
                {notifications.map((notif) => (
                  <div
                    key={notif.id}
                    className={`p-3 text-xs transition-colors hover:bg-muted/40 ${
                      notif.unread ? "bg-primary/5" : ""
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-semibold text-foreground">{notif.title}</p>
                      <span className="text-[10px] text-muted-foreground shrink-0">
                        {notif.time}
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] text-muted-foreground leading-normal">
                      {notif.description}
                    </p>
                  </div>
                ))}
              </div>
              <div className="border-t border-border p-2.5 text-center">
                <span className="text-[11px] text-muted-foreground">
                  Automated insurance event audit stream
                </span>
              </div>
            </PopoverContent>
          </Popover>

          {/* Admin Profile & Avatar */}
          <Link
            to={profileHref}
            aria-label="My profile"
            className="flex items-center gap-2 pl-1 border-l border-border/80"
          >
            <div className="relative">
              <div className="grid size-9 place-items-center rounded-full bg-primary text-primary-foreground font-bold text-xs shadow-xs">
                {initials}
              </div>
              <span className="absolute bottom-0 right-0 size-2.5 rounded-full bg-signal ring-2 ring-background" />
            </div>
            <div className="hidden xl:flex flex-col text-left leading-tight">
              <span className="font-display text-xs font-bold text-foreground">
                {me?.email ?? "Admin"}
              </span>
              <span className="text-[11px] font-semibold text-primary">{roleLabel}</span>
            </div>
          </Link>
        </div>
      </header>
    </>
  );
}

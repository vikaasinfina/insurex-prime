import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Bell, CalendarClock, LogOut, Menu } from "lucide-react";
import { DismissButton, NotificationsHeader } from "@/components/NotificationsHeader";
import { ThemeToggle } from "@/components/ThemeToggle";
import { MobileTopBar, mobileIconButton } from "@/components/mobile/MobileTopBar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  UpcomingMeetingsList,
  useMeetingNotifications,
} from "@/components/calendar/UpcomingMeetings";
import { useAutoPushAlerts } from "@/components/pwa/pwa";
import { agentApi, retryUnlessClientError } from "@/lib/api";
import { agentKeys } from "@/lib/agent-queries";
import { formatDate, initialsOf } from "@/lib/format";
import { useAgentSession } from "./agent-session-context";

export interface AgentHeaderProps {
  title: string;
  subtitle: string;
  onToggleSidebar: () => void;
}

/** Notifications are derived from live dashboard data (expiring policies). */
function AgentNotifications({ mobile = false }: { mobile?: boolean }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: agentKeys.dashboard("30D"),
    queryFn: () => agentApi.dashboard("30D"),
    retry: retryUnlessClientError,
    staleTime: 60_000,
  });
  const expiring = data?.expiringPolicies ?? [];
  const meetings = useMeetingNotifications("agent");
  const { state } = meetings;
  const policies = expiring.filter((policy) => !state.isDismissed(`policy:${policy.id}`));
  const policyIds = policies.map((policy) => `policy:${policy.id}`);
  const allIds = [...meetings.ids, ...policyIds];
  const count = meetings.unread + policyIds.filter((id) => !state.isRead(id)).length;
  const total = meetings.visible.length + policies.length;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={
            mobile
              ? mobileIconButton
              : "relative grid size-9 cursor-pointer place-items-center rounded-xl border border-border bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          }
          aria-label={count ? `Notifications (${count})` : "Notifications"}
        >
          <Bell className={mobile ? "size-[22px]" : "size-4"} />
          {count > 0 && (
            <span className="absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-signal text-[10px] font-bold text-signal-foreground ring-2 ring-background">
              {count > 9 ? "9+" : count}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        collisionPadding={16}
        className="w-[calc(100vw-2rem)] sm:w-80 rounded-2xl border-border p-0 shadow-nav"
      >
        <NotificationsHeader unread={count} onMarkAllRead={() => state.markRead(allIds)} />
        <div className="max-h-80 divide-y divide-border/60 overflow-y-auto">
          {isLoading && <p className="p-4 text-xs text-muted-foreground">Loading…</p>}
          {isError && (
            <p className="p-4 text-xs text-muted-foreground">Notifications are unavailable.</p>
          )}
          {!isLoading && !isError && total === 0 && (
            <p className="p-4 text-xs text-muted-foreground">
              You're all caught up. No meetings or expiring policies.
            </p>
          )}
          <UpcomingMeetingsList scope="agent" meetings={meetings.visible} state={state} />
          {policies.map((policy) => {
            const noteId = `policy:${policy.id}`;
            return (
              <div
                key={policy.id}
                className={`flex gap-3 p-3 text-xs transition-colors hover:bg-muted/40 ${
                  state.isRead(noteId) ? "" : "bg-primary/5"
                }`}
              >
                <CalendarClock className="mt-0.5 size-4 shrink-0 text-primary" />
                <Link
                  to="/agent/sold-policies"
                  search={{ view: policy.id }}
                  onClick={() => state.markRead([noteId])}
                  className="min-w-0 flex-1"
                >
                  <p className="truncate font-semibold text-foreground">
                    {policy.customer.fullName} · {policy.policy.policyName}
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    Expires {formatDate(policy.expiryDate)} (
                    {policy.daysRemaining === 0
                      ? "today"
                      : `in ${policy.daysRemaining} day${policy.daysRemaining === 1 ? "" : "s"}`}
                    )
                  </p>
                </Link>
                <DismissButton onClick={() => state.dismiss([noteId])} />
              </div>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function AgentHeader({ title, subtitle, onToggleSidebar }: AgentHeaderProps) {
  const { agent, user, signOut } = useAgentSession();
  useAutoPushAlerts();

  return (
    <>
      <MobileTopBar eyebrow={user.tenant?.name ?? "InsuroX Prime"} title={title}>
        <AgentNotifications mobile />
        <Link
          to="/agent/profile"
          aria-label="My profile"
          className="ml-1 grid size-8 shrink-0 place-items-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground"
        >
          {initialsOf(agent.fullName)}
        </Link>
      </MobileTopBar>
      <header className="sticky top-0 z-20 hidden h-20 lg:flex w-full items-center justify-between gap-3 border-b border-border/80 bg-background/80 px-4 backdrop-blur-xl sm:px-8">
        <div className="flex min-w-0 items-center gap-3.5">
          <button
            type="button"
            onClick={onToggleSidebar}
            className="grid size-10 shrink-0 cursor-pointer place-items-center rounded-xl border border-border bg-background text-foreground hover:bg-muted lg:hidden"
            aria-label="Open navigation"
          >
            <Menu className="size-5" />
          </button>
          <div className="min-w-0">
            <h1 className="truncate font-display text-xl font-extrabold tracking-tight text-foreground sm:text-2xl">
              {title}
            </h1>
            <p className="hidden truncate text-xs text-muted-foreground sm:block">{subtitle}</p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <ThemeToggle />
          <AgentNotifications />

          <Link
            to="/agent/profile"
            className="flex items-center gap-2 border-l border-border/80 pl-2 sm:pl-3"
            aria-label="My profile"
          >
            <div className="relative">
              <div className="grid size-9 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground shadow-xs">
                {initialsOf(agent.fullName)}
              </div>
              <span className="absolute bottom-0 right-0 size-2.5 rounded-full bg-emerald-500 ring-2 ring-background" />
            </div>
            <div className="hidden flex-col text-left leading-tight xl:flex">
              <span className="max-w-40 truncate font-display text-xs font-bold text-foreground">
                {agent.fullName}
              </span>
              <span className="font-mono text-[11px] font-semibold text-primary">
                {agent.agentCode}
              </span>
            </div>
          </Link>

          <button
            type="button"
            onClick={() => void signOut()}
            className="hidden size-9 cursor-pointer place-items-center rounded-xl border border-border bg-background text-muted-foreground transition-colors hover:border-destructive/30 hover:bg-destructive/10 hover:text-destructive sm:grid"
            aria-label="Logout"
            title="Logout"
          >
            <LogOut className="size-4" />
          </button>
        </div>
      </header>
    </>
  );
}

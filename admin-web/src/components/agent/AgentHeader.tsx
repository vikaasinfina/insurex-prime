import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { Bell, CalendarClock, LogOut, Menu, Search, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { MobileTopBar, mobileIconButton } from "@/components/mobile/MobileTopBar";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
  const count = expiring.length;

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
      <PopoverContent align="end" className="w-80 rounded-2xl border-border p-0 shadow-nav">
        <div className="border-b border-border p-3.5">
          <span className="text-xs font-bold">Notifications</span>
        </div>
        <div className="max-h-80 divide-y divide-border/60 overflow-y-auto">
          {isLoading && <p className="p-4 text-xs text-muted-foreground">Loading…</p>}
          {isError && (
            <p className="p-4 text-xs text-muted-foreground">Notifications are unavailable.</p>
          )}
          {!isLoading && !isError && count === 0 && (
            <p className="p-4 text-xs text-muted-foreground">
              You're all caught up. No policies are expiring soon.
            </p>
          )}
          {expiring.map((policy) => (
            <Link
              key={policy.id}
              to="/agent/sold-policies"
              search={{ view: policy.id }}
              className="flex gap-3 p-3 text-xs transition-colors hover:bg-muted/40"
            >
              <CalendarClock className="mt-0.5 size-4 shrink-0 text-primary" />
              <div className="min-w-0">
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
              </div>
            </Link>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function AgentHeader({ title, subtitle, onToggleSidebar }: AgentHeaderProps) {
  const { agent, user, signOut } = useAgentSession();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  useAutoPushAlerts();

  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    const search = query.trim();
    if (!search) return;
    void navigate({ to: "/agent/customers", search: { search } });
  };

  return (
    <>
      <MobileTopBar eyebrow={user.tenant?.name ?? "InsuroX Prime"} title={title}>
        <Link to="/agent/customers" aria-label="Search my customers" className={mobileIconButton}>
          <Search className="size-[22px]" />
        </Link>
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
          <form
            onSubmit={submitSearch}
            role="search"
            className="relative hidden w-48 md:block lg:w-64"
          >
            <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search my customers…"
              aria-label="Search my customers"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="h-9 w-full rounded-xl bg-surface/60 pl-9 pr-8 text-xs focus-visible:ring-1 focus-visible:ring-primary"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="absolute right-2.5 top-2.5 cursor-pointer text-muted-foreground hover:text-foreground"
                aria-label="Clear search"
              >
                <X className="size-3.5" />
              </button>
            )}
          </form>

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

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { Loader2, ServerOff, ShieldAlert } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { AppFooter } from "@/components/AppFooter";
import { currentUserKey } from "@/hooks/use-current-user";
import { AgentHeader } from "@/components/agent/AgentHeader";
import { AgentSidebar } from "@/components/agent/AgentSidebar";
import { ErrorState } from "@/components/agent/agent-ui";
import {
  AgentSessionContext,
  type AgentSessionValue,
} from "@/components/agent/agent-session-context";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import {
  agentAuthApi,
  ApiError,
  authApi,
  isApiConfigured,
  isSessionEndedError,
  retryUnlessClientError,
} from "@/lib/api";
import { agentKeys } from "@/lib/agent-queries";
import { forgetAgentSignIn } from "@/lib/agent-session";

export const Route = createFileRoute("/agent")({
  head: () => ({
    meta: [
      { title: "Agent Workspace — InsuroX Prime" },
      { name: "description", content: "InsuroX agent workspace for customers and policy sales." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AgentLayout,
});

const CHANGE_PASSWORD_PATH = "/agent/change-password";

const pageTitles: Record<string, [string, string]> = {
  "/agent/dashboard": ["Agent Dashboard", "Manage your customers, policies and insurance sales"],
  "/agent/customers": ["My Customers", "Add, update and look after the customers you manage"],
  "/agent/policies": ["Policies", "Active health and motor policies you can offer"],
  "/agent/sell-policy": ["Record Sold Policy", "Log a policy you sold offline"],
  "/agent/sold-policies": ["Sold Policies", "Every policy you have sold"],
  "/agent/profile": ["My Profile", "Your agent details and account security"],
};

function FullScreen({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface/30 px-4 py-10">
      <Toaster position="top-right" richColors />
      {children}
    </div>
  );
}

function AgentLayout() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const endingRef = useRef(false);

  const me = useQuery({
    queryKey: agentKeys.me,
    queryFn: authApi.me,
    enabled: isApiConfigured && typeof window !== "undefined",
    retry: retryUnlessClientError,
    staleTime: 5 * 60_000,
  });

  /** Clears everything agent-related in this browser and returns to /login. */
  const endSession = useCallback(
    async (message?: string) => {
      if (endingRef.current) return;
      endingRef.current = true;
      forgetAgentSignIn();
      if (message) toast.error(message);
      await navigate({ to: "/login", replace: true });
      queryClient.removeQueries({ queryKey: agentKeys.all });
      // The admin route guard reads this key; a later admin sign-in must not see this user.
      queryClient.removeQueries({ queryKey: currentUserKey });
      endingRef.current = false;
    },
    [navigate, queryClient],
  );

  // One place to react to an expired session, suspension or a pending password change,
  // whichever request discovers it.
  useEffect(() => {
    const handle = (error: unknown) => {
      if (isSessionEndedError(error)) {
        void endSession(
          (error as ApiError).code === "UNAUTHENTICATED"
            ? undefined
            : "Your session has expired. Please sign in again.",
        );
      } else if (error instanceof ApiError && error.code === "ACCOUNT_DISABLED") {
        void endSession(error.message);
      } else if (error instanceof ApiError && error.code === "PASSWORD_CHANGE_REQUIRED") {
        void queryClient.invalidateQueries({ queryKey: agentKeys.me });
        void navigate({ to: CHANGE_PASSWORD_PATH, replace: true });
      }
    };
    const unsubscribeQueries = queryClient.getQueryCache().subscribe((event) => {
      if (event.type === "updated" && event.action.type === "error") handle(event.action.error);
    });
    const unsubscribeMutations = queryClient.getMutationCache().subscribe((event) => {
      if (event.type === "updated" && event.action.type === "error") handle(event.action.error);
    });
    return () => {
      unsubscribeQueries();
      unsubscribeMutations();
    };
  }, [endSession, navigate, queryClient]);

  const user = me.data;
  const mustChange = user?.mustChangePassword ?? false;
  const onChangePasswordPage = pathname === CHANGE_PASSWORD_PATH;

  // Route the agent to the one page they are allowed on.
  useEffect(() => {
    if (!user) return;
    if (user.role !== "AGENT" || !user.agent) {
      void endSession("This workspace is for agents. Please sign in with an agent account.");
    } else if (mustChange && !onChangePasswordPage) {
      void navigate({ to: CHANGE_PASSWORD_PATH, replace: true });
    } else if (!mustChange && onChangePasswordPage) {
      // Voluntary changes happen on the profile page; this page is for the forced flow.
      void navigate({ to: "/agent/dashboard", replace: true });
    }
  }, [user, mustChange, onChangePasswordPage, navigate, endSession]);

  const signOut = useCallback(async () => {
    try {
      await agentAuthApi.logout();
    } catch {
      // The server session may already be gone; sign out locally regardless.
    }
    toast.success("You have been signed out.");
    await endSession();
  }, [endSession]);

  const session = useMemo<AgentSessionValue | null>(
    () => (user?.agent ? { user, agent: user.agent, signOut } : null),
    [user, signOut],
  );

  if (!isApiConfigured) {
    return (
      <FullScreen>
        <div className="max-w-md rounded-2xl border border-border bg-background p-8 text-center shadow-sm">
          <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-muted text-muted-foreground">
            <ServerOff className="size-6" />
          </span>
          <h1 className="mt-4 font-display text-xl font-extrabold">Agent workspace unavailable</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            The agent workspace needs the InsuroX API. Set <code>VITE_API_BASE_URL</code> to the
            backend URL and reload.
          </p>
          <Button asChild variant="outline" className="mt-6 rounded-xl">
            <Link to="/">Back to InsuroX</Link>
          </Button>
        </div>
      </FullScreen>
    );
  }

  if (me.error instanceof ApiError && me.error.code === "ACCOUNT_DISABLED") {
    return (
      <FullScreen>
        <div className="max-w-md rounded-2xl border border-border bg-background p-8 text-center shadow-sm">
          <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-destructive/10 text-destructive">
            <ShieldAlert className="size-6" />
          </span>
          <h1 className="mt-4 font-display text-xl font-extrabold">Account not active</h1>
          <p className="mt-2 text-sm text-muted-foreground">{me.error.message}</p>
          <Button asChild className="mt-6 rounded-xl">
            <Link to="/login">Back to sign in</Link>
          </Button>
        </div>
      </FullScreen>
    );
  }

  if (me.error && !isSessionEndedError(me.error)) {
    return (
      <FullScreen>
        <ErrorState
          error={me.error}
          title="We couldn't open your workspace"
          onRetry={() => void me.refetch()}
          className="w-full max-w-lg bg-background"
        />
      </FullScreen>
    );
  }

  const redirecting =
    !session || (mustChange && !onChangePasswordPage) || (!mustChange && onChangePasswordPage);
  if (redirecting) {
    return (
      <FullScreen>
        <div className="flex items-center gap-3 text-sm text-muted-foreground" aria-live="polite">
          <Loader2 className="size-5 animate-spin text-primary" />
          Opening your workspace…
        </div>
      </FullScreen>
    );
  }

  if (onChangePasswordPage) {
    return (
      <AgentSessionContext.Provider value={session}>
        <FullScreen>
          <Outlet />
        </FullScreen>
      </AgentSessionContext.Provider>
    );
  }

  const [title, subtitle] = pageTitles[pathname] ?? ["Agent Workspace", ""];

  return (
    <AgentSessionContext.Provider value={session}>
      <div className="min-h-screen bg-surface/30 text-foreground selection:bg-primary/20 selection:text-primary">
        <Toaster position="top-right" richColors />
        <AgentSidebar
          currentPath={pathname}
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />
        <div className="flex min-h-screen min-w-0 flex-col app-shell-pad">
          <AgentHeader
            title={title}
            subtitle={subtitle}
            onToggleSidebar={() => setSidebarOpen(true)}
          />
          <main className="mx-auto flex w-full min-w-0 max-w-[1600px] flex-1 flex-col space-y-6 p-4 sm:p-6 lg:p-8">
            <Outlet />
          </main>
          <AppFooter tenantName={user?.tenant?.name} className="mx-auto w-full max-w-[1600px]" />
        </div>
      </div>
    </AgentSessionContext.Provider>
  );
}

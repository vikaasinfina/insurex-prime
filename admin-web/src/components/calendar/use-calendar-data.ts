import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { isApiConfigured, meetingsApi, retryUnlessClientError, type MeetingInput } from "@/lib/api";

export type CalendarScope = "admin" | "agent";

/** Admin and agent caches live under their own roots so a sign-out drops the right one. */
const meetingsKey = (scope: CalendarScope) => [scope, "meetings"] as const;

export function useMeetings(scope: CalendarScope, from: Date, to: Date) {
  const fromIso = from.toISOString();
  const toIso = to.toISOString();
  return useQuery({
    queryKey: [...meetingsKey(scope), fromIso, toIso],
    queryFn: () => meetingsApi.list(fromIso, toIso),
    enabled: isApiConfigured,
    retry: retryUnlessClientError,
  });
}

/** Active agents an admin can invite. */
export function useInvitableAgents(enabled: boolean) {
  return useQuery({
    queryKey: ["admin", "meeting-agents"],
    queryFn: meetingsApi.agents,
    enabled: enabled && isApiConfigured,
    staleTime: 60_000,
  });
}

export function useMeetingActions(scope: CalendarScope) {
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: meetingsKey(scope) });
  const failed = (error: unknown) =>
    toast.error(error instanceof Error ? error.message : "Couldn't save the meeting.");

  return {
    async create(input: MeetingInput) {
      try {
        const created = await meetingsApi.create(input);
        await refresh();
        return created;
      } catch (error) {
        failed(error);
        throw error;
      }
    },
    async update(id: string, input: Partial<MeetingInput>) {
      try {
        const updated = await meetingsApi.update(id, input);
        await refresh();
        return updated;
      } catch (error) {
        failed(error);
        throw error;
      }
    },
    async remove(id: string) {
      try {
        await meetingsApi.remove(id);
        await refresh();
      } catch (error) {
        failed(error);
        throw error;
      }
    },
  };
}

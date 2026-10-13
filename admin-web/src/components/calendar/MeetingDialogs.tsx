import { Link } from "@tanstack/react-router";
import {
  CalendarClock,
  ExternalLink,
  Loader2,
  Pencil,
  StickyNote,
  Search,
  Trash2,
  Users,
  Video,
  X,
} from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ApiMeeting } from "@/lib/api";
import {
  formatDay,
  formatTimeRange,
  fromInputs,
  meetingLinkLabel,
  toDateInput,
  toTimeInput,
  type CalendarEvent,
} from "./calendar-utils";
import { useInvitableAgents, useMeetingActions, type CalendarScope } from "./use-calendar-data";

export interface MeetingFormState {
  /** Set when editing; undefined when scheduling a new meeting. */
  meeting?: ApiMeeting;
  /** Pre-filled start for a new meeting (the slot that was clicked). */
  start?: Date;
}

interface MeetingFormDialogProps {
  scope: CalendarScope;
  state: MeetingFormState | null;
  onClose: () => void;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const DEFAULT_LENGTH_MS = 30 * 60_000;

/** The end time 30 minutes after `start` (HH:mm), kept within the same day. */
const thirtyMinutesAfter = (date: string, start: string) => {
  const begin = fromInputs(date, start);
  if (Number.isNaN(begin.getTime())) return null;
  const end = new Date(begin.getTime() + DEFAULT_LENGTH_MS);
  return end.getDate() === begin.getDate() ? toTimeInput(end) : "23:59";
};

const defaultStart = () => {
  const now = new Date();
  now.setMinutes(0, 0, 0);
  now.setHours(now.getHours() + 1);
  return now;
};

export function MeetingFormDialog({ scope, state, onClose }: MeetingFormDialogProps) {
  const open = state !== null;
  const editing = state?.meeting;
  const isAdmin = scope === "admin";
  const actions = useMeetingActions(scope);
  const agents = useInvitableAgents(isAdmin && open);

  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [link, setLink] = useState("");
  const [description, setDescription] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [agentQuery, setAgentQuery] = useState("");
  const [guests, setGuests] = useState<string[]>([]);
  const [guestDraft, setGuestDraft] = useState("");
  const [saving, setSaving] = useState(false);
  // Once the user picks an end time themselves, changing the start no longer moves it.
  const [endEdited, setEndEdited] = useState(false);

  // Reset the form each time the dialog opens.
  useEffect(() => {
    if (!state) return;
    const meeting = state.meeting;
    const start = meeting ? new Date(meeting.startsAt) : (state.start ?? defaultStart());
    const end = meeting ? new Date(meeting.endsAt) : new Date(start.getTime() + DEFAULT_LENGTH_MS);
    setTitle(meeting?.title ?? "");
    setDate(toDateInput(start));
    setStartTime(toTimeInput(start));
    setEndEdited(Boolean(meeting));
    setEndTime(toTimeInput(end));
    setLink(meeting?.meetingUrl ?? "");
    setDescription(meeting?.description ?? "");
    setGuests(meeting?.guestEmails ?? []);
    setGuestDraft("");
    setSelected(
      new Set(
        meeting?.attendees.flatMap((attendee) => (attendee.agentId ? [attendee.agentId] : [])) ??
          [],
      ),
    );
  }, [state]);

  const agentList = agents.data ?? [];
  const query = agentQuery.trim().toLowerCase();
  // With a search typed, "select all" applies to the agents that match it.
  const visibleAgents = query
    ? agentList.filter(
        (agent) =>
          agent.fullName.toLowerCase().includes(query) ||
          agent.agentCode.toLowerCase().includes(query),
      )
    : agentList;
  const allSelected =
    visibleAgents.length > 0 && visibleAgents.every((agent) => selected.has(agent.id));
  const toggleAll = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      for (const agent of visibleAgents) {
        if (allSelected) next.delete(agent.id);
        else next.add(agent.id);
      }
      return next;
    });
  const toggleOne = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  /** Adds the typed address(es) as chips; returns the new list, or null if one is not an email. */
  const commitGuests = (): string[] | null => {
    const typed = guestDraft
      .split(/[\s,;]+/)
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean);
    if (typed.length === 0) return guests;
    if (typed.some((email) => !EMAIL_PATTERN.test(email))) {
      toast.error("Enter a valid email address.");
      return null;
    }
    const next = [...new Set([...guests, ...typed])];
    setGuests(next);
    setGuestDraft("");
    return next;
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const startsAt = fromInputs(date, startTime);
    const endsAt = fromInputs(date, endTime);
    const trimmedLink = link.trim();
    const allGuests = commitGuests();
    if (!allGuests) return;
    const problem = !title.trim()
      ? "Give the meeting a title."
      : Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())
        ? "Choose a date and time."
        : endsAt <= startsAt
          ? "The meeting must end after it starts."
          : trimmedLink && !/^https?:\/\/\S+$/i.test(trimmedLink)
            ? "The meeting link must start with https://"
            : isAdmin && selected.size === 0 && allGuests.length === 0
              ? "Choose at least one agent or add a guest email."
              : null;
    if (problem) {
      toast.error(problem);
      return;
    }

    const input = {
      title: title.trim(),
      description: description.trim(),
      meetingUrl: trimmedLink,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      guestEmails: allGuests,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      ...(isAdmin ? { agentIds: [...selected] } : {}),
    };
    setSaving(true);
    try {
      if (editing) {
        await actions.update(editing.id, input);
        toast.success("Meeting updated.");
      } else {
        const { emails } = await actions.create(input);
        if (emails.failed > 0) {
          toast.warning(
            emails.sent > 0
              ? `Meeting scheduled. ${emails.sent} invitation emails sent, ${emails.failed} could not be sent.`
              : "Meeting scheduled, but the invitation emails could not be sent.",
          );
        } else {
          toast.success(
            `Meeting scheduled. Invitation emailed to ${emails.sent} ${emails.sent === 1 ? "person" : "people"}.`,
          );
        }
      }
      onClose();
    } catch {
      // The action already showed the error.
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !saving && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit meeting" : "Schedule a meeting"}</DialogTitle>
          <DialogDescription>
            {isAdmin
              ? "Invited agents see it on their calendar and can join from the link."
              : "Your agency admin will see it on their calendar."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="meeting-title">Title</Label>
            <Input
              id="meeting-title"
              value={title}
              maxLength={200}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Weekly pipeline review"
              required
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="meeting-date">Date</Label>
              <Input
                id="meeting-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="meeting-start">Starts</Label>
              <Input
                id="meeting-start"
                type="time"
                value={startTime}
                onChange={(e) => {
                  setStartTime(e.target.value);
                  if (!endEdited) setEndTime(thirtyMinutesAfter(date, e.target.value) ?? endTime);
                }}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="meeting-end">Ends</Label>
              <Input
                id="meeting-end"
                type="time"
                value={endTime}
                onChange={(e) => {
                  setEndTime(e.target.value);
                  setEndEdited(true);
                }}
                required
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="meeting-link">Meeting link (Google Meet / Zoom)</Label>
            <Input
              id="meeting-link"
              type="url"
              inputMode="url"
              value={link}
              maxLength={500}
              onChange={(event) => setLink(event.target.value)}
              placeholder="https://meet.google.com/abc-defg-hij"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="meeting-description">Description</Label>
            <Textarea
              id="meeting-description"
              value={description}
              maxLength={5000}
              rows={3}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="What will be discussed?"
            />
          </div>

          {isAdmin ? (
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Invite agents</legend>
              {agents.isPending ? (
                <p className="text-sm text-muted-foreground">Loading agents…</p>
              ) : agentList.length === 0 ? (
                <p className="text-sm text-muted-foreground">There are no active agents yet.</p>
              ) : (
                <div className="rounded-xl border border-border">
                  <div className="relative border-b border-border">
                    <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <input
                      type="search"
                      value={agentQuery}
                      onChange={(event) => setAgentQuery(event.target.value)}
                      placeholder="Search agent by name or code"
                      aria-label="Search agents"
                      className="h-10 w-full bg-transparent pl-9 pr-3 text-sm outline-none placeholder:text-muted-foreground"
                    />
                  </div>
                  <label className="flex cursor-pointer items-center gap-3 border-b border-border bg-muted/40 px-3 py-2.5 text-sm font-semibold">
                    <input
                      type="checkbox"
                      className="size-4 accent-primary"
                      checked={allSelected}
                      onChange={toggleAll}
                    />
                    {query
                      ? `Select all ${visibleAgents.length} matching`
                      : `All agents (${agentList.length})`}
                    {selected.size > 0 && (
                      <span className="ml-auto text-xs font-medium text-muted-foreground">
                        {selected.size} selected
                      </span>
                    )}
                  </label>
                  <ul className="max-h-48 divide-y divide-border/60 overflow-y-auto">
                    {visibleAgents.map((agent) => (
                      <li key={agent.id}>
                        <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-muted/40">
                          <input
                            type="checkbox"
                            className="size-4 accent-primary"
                            checked={selected.has(agent.id)}
                            onChange={() => toggleOne(agent.id)}
                          />
                          <span className="min-w-0 flex-1 truncate">{agent.fullName}</span>
                          <span className="font-mono text-xs text-muted-foreground">
                            {agent.agentCode}
                          </span>
                        </label>
                      </li>
                    ))}
                    {visibleAgents.length === 0 && (
                      <li className="px-3 py-4 text-center text-sm text-muted-foreground">
                        No agent matches "{agentQuery.trim()}".
                      </li>
                    )}
                  </ul>
                </div>
              )}
            </fieldset>
          ) : (
            <p className="flex items-center gap-2 rounded-xl bg-muted/50 px-3 py-2.5 text-sm text-muted-foreground">
              <Users className="size-4 shrink-0" /> This meeting is with your agency admin.
            </p>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="meeting-guests">Other guests (email)</Label>
            {guests.length > 0 && (
              <ul className="flex flex-wrap gap-1.5">
                {guests.map((email) => (
                  <li
                    key={email}
                    className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2.5 py-1 text-xs"
                  >
                    {email}
                    <button
                      type="button"
                      aria-label={`Remove ${email}`}
                      onClick={() => setGuests((prev) => prev.filter((item) => item !== email))}
                      className="cursor-pointer text-muted-foreground hover:text-foreground"
                    >
                      <X className="size-3" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <Input
              id="meeting-guests"
              type="email"
              inputMode="email"
              value={guestDraft}
              onChange={(event) => setGuestDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === ",") {
                  event.preventDefault();
                  commitGuests();
                }
              }}
              onBlur={() => guestDraft.trim() && commitGuests()}
              placeholder="client@example.com — press Enter to add"
            />
            <p className="text-xs text-muted-foreground">
              Everyone invited, including these guests, is emailed the date, time and join link.
            </p>
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="mr-2 size-4 animate-spin" />}
              {editing ? "Save changes" : "Schedule"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface EventDetailDialogProps {
  scope: CalendarScope;
  event: CalendarEvent | null;
  onClose: () => void;
  onEdit: (meeting: ApiMeeting) => void;
}

export function EventDetailDialog({ scope, event, onClose, onEdit }: EventDetailDialogProps) {
  const actions = useMeetingActions(scope);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const meeting = event?.meeting;

  useEffect(() => setConfirming(false), [event]);

  const cancelMeeting = async () => {
    if (!meeting) return;
    setDeleting(true);
    try {
      await actions.remove(meeting.id);
      toast.success("Meeting cancelled.");
      onClose();
    } catch {
      // Already reported.
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Dialog open={event !== null} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-md">
        {event && (
          <>
            <DialogHeader>
              <p className="text-[11px] font-bold uppercase tracking-wider text-primary">
                {event.kind === "note" ? "Field note follow-up" : "Meeting"}
              </p>
              <DialogTitle>{event.title}</DialogTitle>
              <DialogDescription>{event.subtitle}</DialogDescription>
            </DialogHeader>

            <div className="space-y-3 text-sm">
              <p className="flex items-center gap-2.5">
                <CalendarClock className="size-4 shrink-0 text-primary" />
                <span className="font-medium">
                  {formatDay(event.start, { weekday: "long", day: "numeric", month: "short" })} ·{" "}
                  {event.kind === "note"
                    ? formatTimeRange(event.start, event.start).split(" – ")[0]
                    : formatTimeRange(event.start, event.end)}
                </span>
              </p>

              {meeting && (
                <>
                  <p className="flex items-start gap-2.5">
                    <Users className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    <span>
                      <span className="text-muted-foreground">Scheduled by </span>
                      <span className="font-medium">{meeting.organizer.name}</span>
                      <br />
                      <span className="text-muted-foreground">With </span>
                      {[
                        ...meeting.attendees.map((attendee) => attendee.name),
                        ...meeting.guestEmails,
                      ].join(", ")}
                    </span>
                  </p>
                  {meeting.description && (
                    <p className="whitespace-pre-wrap rounded-xl bg-muted/50 p-3 text-muted-foreground">
                      {meeting.description}
                    </p>
                  )}
                  {meeting.meetingUrl ? (
                    <a
                      href={meeting.meetingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/10 p-3 transition-colors hover:bg-primary/15"
                    >
                      <span className="flex min-w-0 items-center gap-2.5">
                        <Video className="size-5 shrink-0 text-primary" />
                        <span className="min-w-0">
                          <span className="block text-sm font-bold">
                            {meetingLinkLabel(meeting.meetingUrl)}
                          </span>
                          <span className="block truncate font-mono text-xs text-muted-foreground">
                            {meeting.meetingUrl.replace(/^https?:\/\//, "")}
                          </span>
                        </span>
                      </span>
                      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground">
                        Join <ExternalLink className="size-3" />
                      </span>
                    </a>
                  ) : (
                    <p className="text-muted-foreground">No meeting link was added.</p>
                  )}
                </>
              )}

              {event.kind === "note" && <p className="text-muted-foreground">{event.subtitle}</p>}
            </div>

            <DialogFooter className="gap-2 sm:gap-2">
              {event.kind === "note" ? (
                <Button asChild>
                  <Link to="/agent/notes" onClick={onClose}>
                    <StickyNote className="mr-2 size-4" /> Open field notes
                  </Link>
                </Button>
              ) : meeting?.canEdit ? (
                confirming ? (
                  <>
                    <Button
                      variant="outline"
                      onClick={() => setConfirming(false)}
                      disabled={deleting}
                    >
                      Keep meeting
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={() => void cancelMeeting()}
                      disabled={deleting}
                    >
                      {deleting && <Loader2 className="mr-2 size-4 animate-spin" />}
                      Cancel meeting
                    </Button>
                  </>
                ) : (
                  <>
                    <Button variant="outline" onClick={() => setConfirming(true)}>
                      <Trash2 className="mr-2 size-4" /> Cancel meeting
                    </Button>
                    <Button onClick={() => onEdit(meeting)}>
                      <Pencil className="mr-2 size-4" /> Edit
                    </Button>
                  </>
                )
              ) : null}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

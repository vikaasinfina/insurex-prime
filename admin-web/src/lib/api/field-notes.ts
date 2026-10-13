import { apiRequest } from "./client";

export type ApiFieldNoteStatus = "IN_PROGRESS" | "COMPLETED" | "POSTPONED";

export interface ApiFieldNote {
  id: string;
  clientName: string;
  contactName: string;
  phone: string;
  coverage: string;
  category: "LIFE" | "HEALTH" | "MOTOR" | "COMMERCIAL";
  note: string;
  tag: string;
  status: ApiFieldNoteStatus;
  followUpAt: string | null;
  followUpLabel: string;
  recurring: string | null;
  loggedAt: string;
}

export type FieldNoteInput = Partial<
  Omit<ApiFieldNote, "id" | "tag" | "loggedAt"> & { tag: string; loggedAt: string }
>;

export interface ParsedMemo {
  /** Empty when no client could be identified. */
  clientName: string;
  phone: string;
  coverage: string;
  category: ApiFieldNote["category"];
  note: string;
  status: "IN_PROGRESS" | "COMPLETED";
  followUpAt: string | null;
  followUpLabel: string;
  /** "basic" means AI was unavailable and only the text was kept. */
  source: "ai" | "basic";
}

export interface MemoState {
  clientName: string;
  phone: string;
  coverage: string;
  category: ApiFieldNote["category"];
  note: string;
  status: ApiFieldNoteStatus;
  followUpAt: string | null;
  followUpLabel: string;
}

export interface RevisedMemo extends MemoState {
  /** "basic" means AI was unavailable: the instruction was only added to the note. */
  source: "ai" | "basic";
}

export const fieldNotesApi = {
  revise: (memo: MemoState, instruction: string) =>
    apiRequest<RevisedMemo>("/agent/field-notes/revise", {
      method: "POST",
      body: {
        memo,
        instruction,
        now: new Date().toISOString(),
        utcOffsetMinutes: new Date().getTimezoneOffset(),
      },
    }),
  parse: (text: string) =>
    apiRequest<ParsedMemo>("/agent/field-notes/parse", {
      method: "POST",
      body: {
        text,
        now: new Date().toISOString(),
        utcOffsetMinutes: new Date().getTimezoneOffset(),
      },
    }),
  list: () => apiRequest<ApiFieldNote[]>("/agent/field-notes"),
  create: (input: FieldNoteInput & Pick<ApiFieldNote, "clientName" | "category" | "note">) =>
    apiRequest<ApiFieldNote>("/agent/field-notes", { method: "POST", body: input }),
  update: (id: string, patch: FieldNoteInput) =>
    apiRequest<ApiFieldNote>(`/agent/field-notes/${id}`, { method: "PATCH", body: patch }),
  bulkUpdate: (ids: string[], patch: FieldNoteInput) =>
    apiRequest<ApiFieldNote[]>("/agent/field-notes/bulk", {
      method: "PATCH",
      body: { ids, patch },
    }),
  remove: (id: string) =>
    apiRequest<{ id: string }>(`/agent/field-notes/${id}`, { method: "DELETE" }),
};

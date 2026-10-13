export {
  ApiError,
  API_BASE_URL,
  isApiConfigured,
  isSessionEndedError,
  retryUnlessClientError,
} from "./client";
export type { ListParams, Paginated, PaginationMeta } from "./client";
export { agentApi, type AgentProfileInput } from "./agent";
export {
  agentGoalsApi,
  type ApiGoalCategory,
  type ApiGoalPeriod,
  type ApiSalesGoals,
  type GoalTargets,
} from "./agent-goals";
export {
  fieldNotesApi,
  type ApiFieldNote,
  type FieldNoteInput,
  type ParsedMemo,
} from "./field-notes";
export { meetingsApi, type ApiMeeting, type MeetingAgent, type MeetingInput } from "./meetings";
export { agentsApi, type AgentInput } from "./agents";
export {
  adminAuthApi,
  agentAuthApi,
  authApi,
  passwordResetApi,
  type AgentLoginResult,
} from "./auth";
export {
  catalogApi,
  catalogKeys,
  type ApiCategory,
  type CatalogCategory,
  type CatalogInsurer,
  type CatalogLine,
  type CatalogPolicy,
  type CatalogTree,
} from "./catalog";
export {
  platformApi,
  platformKeys,
  type ApiInsurer,
  type ApiTenant,
  type ApiTenantInsurer,
} from "./platform";
export { tenantProfileApi, tenantProfileKey, type TenantProfile } from "./tenant-profile";
export { customersApi, type CustomerInput, type CustomerListParams } from "./customers";
export { dashboardApi, reportsApi } from "./dashboard";
export { policiesApi, type PolicyListParams } from "./policies";
export { settingsApi } from "./settings";
export { soldPoliciesApi, type SalePolicyInput, type SoldPolicyListParams } from "./sold-policies";
export type * from "./settings";
export type * from "./types";

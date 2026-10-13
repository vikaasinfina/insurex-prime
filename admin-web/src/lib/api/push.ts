import { apiRequest } from "./client";

export const pushApi = {
  key: () => apiRequest<{ enabled: boolean; publicKey: string | null }>("/push/key"),
  subscribe: (subscription: PushSubscriptionJSON) =>
    apiRequest<{ subscribed: true }>("/push/subscribe", { method: "POST", body: subscription }),
  unsubscribe: (endpoint: string) =>
    apiRequest<{ subscribed: false }>("/push/unsubscribe", { method: "POST", body: { endpoint } }),
};

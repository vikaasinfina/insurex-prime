import { daysUntil } from "@/lib/format";

/** How close a policy is to its expiry, as a label and a colour (red = lapsed or about to). */
export function expiryStatus(expiryDate: string, renewed = false) {
  // A later sale already renews this one: nothing left to chase.
  if (renewed) {
    return {
      label: "Renewal done",
      badge: "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/25",
      row: "",
    };
  }
  const days = daysUntil(expiryDate);
  if (days < 0) {
    const ago = -days;
    return {
      label: ago === 1 ? "Expired yesterday" : `Expired ${ago} days ago`,
      badge: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/30",
      row: "bg-red-500/[0.06]",
    };
  }
  if (days === 0) {
    return {
      label: "Expires today",
      badge: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/30",
      row: "bg-red-500/[0.06]",
    };
  }
  if (days <= 10) {
    return {
      label: days === 1 ? "Expires tomorrow" : `Expires in ${days} days`,
      badge: "bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/30",
      row: "bg-orange-500/[0.06]",
    };
  }
  if (days <= 30) {
    return {
      label: `Expires in ${days} days`,
      badge: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30",
      row: "",
    };
  }
  return {
    label: "Active",
    badge: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20",
    row: "",
  };
}

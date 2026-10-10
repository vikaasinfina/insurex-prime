/** "New" for a first-time sale, "Renewed" for a sale that renews an earlier one. */
export function SaleTypeBadge({ renewal }: { renewal: boolean }) {
  return (
    <span
      className={`inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-bold ${
        renewal
          ? "border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-400"
          : "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-400"
      }`}
    >
      {renewal ? "Renewed" : "New"}
    </span>
  );
}

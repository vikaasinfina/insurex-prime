/** How long a customer has held a policy, counted from its inception (first-issue) date. */
export type PolicyAge = { label: string; tone: "new" | "one" | "three" | "ten" };

export function policyAge(inceptionDate: string, today = new Date()): PolicyAge {
  const start = new Date(`${inceptionDate}T00:00:00`);
  let years = today.getFullYear() - start.getFullYear();
  const anniversaryPassed =
    today.getMonth() > start.getMonth() ||
    (today.getMonth() === start.getMonth() && today.getDate() >= start.getDate());
  if (!anniversaryPassed) years -= 1;

  if (years >= 10) return { label: "10+ yrs", tone: "ten" };
  if (years >= 3) return { label: "3+ yrs", tone: "three" };
  if (years >= 1) return { label: "1+ yr", tone: "one" };
  return { label: "< 1 yr", tone: "new" };
}

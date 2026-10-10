import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Pencil, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import { adminKeys } from "@/lib/admin-queries";
import { agentKeys } from "@/lib/agent-queries";
import { soldPoliciesApi, type ApiSoldPolicy } from "@/lib/api";
import { errorText } from "./agent-ui";

/** Refreshes every list that shows sold policies, for agents and (same browser) admins. */
function useRefreshSales() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all(
      [
        agentKeys.dashboardAll,
        agentKeys.soldPoliciesAll,
        agentKeys.customersAll,
        adminKeys.all,
      ].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
    );
}

export function EditSoldPolicyDialog({
  sale,
  onClose,
}: {
  sale: ApiSoldPolicy | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={Boolean(sale)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto rounded-2xl sm:max-w-lg">
        {sale && <EditForm key={sale.id} sale={sale} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

function EditForm({ sale, onClose }: { sale: ApiSoldPolicy; onClose: () => void }) {
  const refresh = useRefreshSales();
  const [form, setForm] = useState({
    issueDate: sale.issueDate,
    inceptionDate: sale.inceptionDate,
    expiryDate: sale.expiryDate,
    premium: String(sale.premium),
    insurerPolicyNumber: sale.insurerPolicyNumber ?? "",
  });
  const [errors, setErrors] = useState<Partial<Record<keyof typeof form, string | undefined>>>({});
  // A new policy has no separate inception date: it simply follows the issue date.
  const inceptionFollowsIssue = sale.inceptionDate === sale.issueDate;
  const set = (key: keyof typeof form, value: string) => {
    setForm((prev) => ({
      ...prev,
      [key]: value,
      ...(key === "issueDate" && inceptionFollowsIssue ? { inceptionDate: value } : {}),
    }));
    setErrors((prev) => ({ ...prev, [key]: undefined, inceptionDate: undefined }));
  };

  const save = useMutation({
    mutationFn: () =>
      soldPoliciesApi.update(sale.id, {
        issueDate: form.issueDate,
        // An inception date equal to the issue date means "new": store it as blank.
        inceptionDate:
          form.inceptionDate && form.inceptionDate !== form.issueDate ? form.inceptionDate : null,
        expiryDate: form.expiryDate,
        premium: Number(form.premium),
        insurerPolicyNumber: form.insurerPolicyNumber.trim(),
      }),
    onSuccess: async () => {
      toast.success(`Policy ${sale.policyNumber} updated.`);
      await refresh();
      onClose();
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const problems: typeof errors = {};
    if (!form.issueDate) problems.issueDate = "Required.";
    if (!form.expiryDate) problems.expiryDate = "Required.";
    else if (form.issueDate && form.expiryDate <= form.issueDate)
      problems.expiryDate = "Must be after the issue date.";
    if (form.inceptionDate && form.issueDate && form.inceptionDate > form.issueDate)
      problems.inceptionDate = "Cannot be after the issue date.";
    if (!(Number(form.premium) > 0)) problems.premium = "Enter the premium amount.";
    setErrors(problems);
    if (Object.keys(problems).length === 0) save.mutate();
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2 font-display">
          <Pencil className="size-5 text-primary" /> Edit policy sale
        </DialogTitle>
        <DialogDescription>
          {sale.policy.policyName} · {sale.customer.fullName} · {sale.policyNumber}
        </DialogDescription>
      </DialogHeader>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {(
          [
            ["issueDate", "Issue date", "date"],
            ["expiryDate", "Expiry date", "date"],
            ["inceptionDate", "Policy inception date", "date"],
            ["premium", "Premium (₹)", "number"],
          ] as const
        ).map(([key, label, type]) => (
          <div key={key}>
            <Label htmlFor={`edit-${key}`} className="text-xs font-bold uppercase tracking-wider">
              {label}
            </Label>
            <Input
              id={`edit-${key}`}
              type={type}
              {...(type === "number" ? { min: "0", step: "any", inputMode: "decimal" } : {})}
              value={form[key]}
              onChange={(event) => set(key, event.target.value)}
              aria-invalid={Boolean(errors[key])}
              className={`mt-1 h-10 rounded-xl ${errors[key] ? "border-destructive" : ""}`}
            />
            {errors[key] && (
              <p className="mt-1 text-xs font-medium text-destructive">{errors[key]}</p>
            )}
          </div>
        ))}
        <div className="sm:col-span-2">
          <Label htmlFor="edit-insurer" className="text-xs font-bold uppercase tracking-wider">
            Insurer policy number
          </Label>
          <Input
            id="edit-insurer"
            maxLength={60}
            value={form.insurerPolicyNumber}
            onChange={(event) => set("insurerPolicyNumber", event.target.value)}
            className="mt-1 h-10 rounded-xl"
          />
        </div>
      </div>

      {save.error != null && (
        <p role="alert" className="text-xs font-medium text-destructive">
          {errorText(save.error, "The sale could not be updated.")}
        </p>
      )}

      <DialogFooter>
        <Button type="button" variant="outline" className="rounded-xl" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={save.isPending} className="rounded-xl">
          {save.isPending && <Loader2 className="animate-spin" />} Save changes
        </Button>
      </DialogFooter>
    </form>
  );
}

export function DeleteSoldPolicyDialog({
  sale,
  onClose,
}: {
  sale: ApiSoldPolicy | null;
  onClose: () => void;
}) {
  const refresh = useRefreshSales();
  const remove = useMutation({
    mutationFn: (id: string) => soldPoliciesApi.remove(id),
    onSuccess: async () => {
      toast.success(`Policy ${sale?.policyNumber ?? ""} deleted.`);
      await refresh();
      onClose();
    },
  });

  return (
    <AlertDialog open={Boolean(sale)} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent className="rounded-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Trash2 className="size-5 text-destructive" /> Delete this policy sale?
          </AlertDialogTitle>
          <AlertDialogDescription>
            {sale
              ? `${sale.policy.policyName} for ${sale.customer.fullName} (${sale.policyNumber}) and its payment receipts will be permanently removed. This cannot be undone.`
              : ""}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {remove.error != null && (
          <p role="alert" className="text-xs font-medium text-destructive">
            {errorText(remove.error, "The sale could not be deleted.")}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel className="rounded-xl" disabled={remove.isPending}>
            Cancel
          </AlertDialogCancel>
          <Button
            variant="destructive"
            className="rounded-xl"
            disabled={remove.isPending}
            onClick={() => sale && remove.mutate(sale.id)}
          >
            {remove.isPending && <Loader2 className="animate-spin" />} Delete
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

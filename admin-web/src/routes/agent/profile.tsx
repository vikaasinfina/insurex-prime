import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { KeyRound, Loader2, Lock, Pencil, ShieldAlert, UserRound } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { ChangePasswordForm } from "@/components/agent/ChangePasswordForm";
import {
  DetailRow,
  ErrorState,
  errorText,
  SectionCard,
  StatusPill,
} from "@/components/agent/agent-ui";
import { PushToggle } from "@/components/pwa/pwa";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { agentApi, retryUnlessClientError, type AgentProfile } from "@/lib/api";
import { agentKeys } from "@/lib/agent-queries";
import { formatDate, formatDateTime, formatNumber, initialsOf } from "@/lib/format";

export const Route = createFileRoute("/agent/profile")({
  head: () => ({ meta: [{ title: "My Profile — InsuroX Prime" }] }),
  component: AgentProfilePage,
});

const statusTone = { ACTIVE: "success", INACTIVE: "neutral", SUSPENDED: "danger" } as const;

function EditProfileForm({ profile, onDone }: { profile: AgentProfile; onDone: () => void }) {
  const queryClient = useQueryClient();
  const [fullName, setFullName] = useState(profile.fullName);
  const [phone, setPhone] = useState(profile.phone);
  const [address, setAddress] = useState(profile.address ?? "");
  const [errors, setErrors] = useState<{ fullName?: string; phone?: string }>({});

  const mutation = useMutation({
    mutationFn: () =>
      agentApi.updateProfile({
        fullName: fullName.trim(),
        phone: phone.trim(),
        address: address.trim() || null,
      }),
    onSuccess: async (updated) => {
      queryClient.setQueryData(agentKeys.profile, updated);
      // The sidebar and header read the agent from the session query.
      await queryClient.invalidateQueries({ queryKey: agentKeys.me });
      toast.success("Profile updated.");
      onDone();
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const problems: typeof errors = {};
    if (fullName.trim().length < 2) problems.fullName = "Enter your full name.";
    const trimmedPhone = phone.trim();
    if (
      !/^[+\d][\d\s-]*$/.test(trimmedPhone) ||
      trimmedPhone.length < 7 ||
      trimmedPhone.length > 20
    ) {
      problems.phone = "Enter a valid phone number.";
    }
    setErrors(problems);
    if (Object.keys(problems).length === 0) mutation.mutate();
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="pf-name" className="text-xs font-bold uppercase tracking-wider">
            Full name
          </Label>
          <Input
            id="pf-name"
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            maxLength={120}
            aria-invalid={Boolean(errors.fullName)}
            className={`mt-1 h-10 rounded-xl ${errors.fullName ? "border-destructive" : ""}`}
          />
          {errors.fullName && <p className="mt-1 text-xs text-destructive">{errors.fullName}</p>}
        </div>
        <div>
          <Label htmlFor="pf-phone" className="text-xs font-bold uppercase tracking-wider">
            Phone
          </Label>
          <Input
            id="pf-phone"
            type="tel"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            maxLength={20}
            aria-invalid={Boolean(errors.phone)}
            className={`mt-1 h-10 rounded-xl ${errors.phone ? "border-destructive" : ""}`}
          />
          {errors.phone && <p className="mt-1 text-xs text-destructive">{errors.phone}</p>}
        </div>
      </div>
      <div>
        <Label htmlFor="pf-address" className="text-xs font-bold uppercase tracking-wider">
          Address
        </Label>
        <Textarea
          id="pf-address"
          value={address}
          onChange={(event) => setAddress(event.target.value)}
          maxLength={500}
          rows={2}
          className="mt-1 rounded-xl"
        />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {[
          ["Email", profile.email],
          ["Agent code", profile.agentCode],
        ].map(([label, value]) => (
          <div key={label}>
            <Label className="flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              <Lock className="size-3" /> {label}
            </Label>
            <Input value={value} readOnly disabled className="mt-1 h-10 rounded-xl bg-muted/50" />
          </div>
        ))}
      </div>
      <p className="text-[11px] text-muted-foreground">
        Email and agent code are managed by your Super Admin.
      </p>
      {mutation.error != null && (
        <p role="alert" className="flex items-center gap-1.5 text-xs font-medium text-destructive">
          <ShieldAlert className="size-3.5 shrink-0" />
          {errorText(mutation.error, "Your profile could not be saved.")}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={onDone}
          disabled={mutation.isPending}
          className="rounded-xl"
        >
          Cancel
        </Button>
        <Button type="submit" disabled={mutation.isPending} className="rounded-xl">
          {mutation.isPending && <Loader2 className="animate-spin" />}
          Save changes
        </Button>
      </div>
    </form>
  );
}

function AgentProfilePage() {
  const [editing, setEditing] = useState(false);
  const profile = useQuery({
    queryKey: agentKeys.profile,
    queryFn: agentApi.profile,
    retry: retryUnlessClientError,
  });
  const data = profile.data;

  if (profile.isLoading) {
    return (
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Skeleton className="h-96 rounded-2xl lg:col-span-2" />
        <Skeleton className="h-96 rounded-2xl" />
      </div>
    );
  }
  if (!data) {
    return (
      <ErrorState
        error={profile.error}
        title="We couldn't load your profile"
        onRetry={() => void profile.refetch()}
      />
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <SectionCard
        title="Agent Information"
        icon={UserRound}
        className="lg:col-span-2"
        actions={
          !editing && (
            <Button
              variant="outline"
              size="sm"
              className="rounded-lg"
              onClick={() => setEditing(true)}
            >
              <Pencil /> Edit profile
            </Button>
          )
        }
      >
        <div className="mb-5 flex flex-wrap items-center gap-4">
          <div className="grid size-16 shrink-0 place-items-center rounded-full bg-primary text-xl font-bold text-primary-foreground">
            {initialsOf(data.fullName)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-xl font-extrabold text-foreground">
              {data.fullName}
            </p>
            <p className="font-mono text-xs text-muted-foreground">{data.agentCode}</p>
            <div className="mt-1.5">
              <StatusPill
                tone={statusTone[data.status]}
                label={data.status.charAt(0) + data.status.slice(1).toLowerCase()}
              />
            </div>
          </div>
          <div className="sm:ml-auto">
            <PushToggle />
          </div>
        </div>

        {editing ? (
          <EditProfileForm profile={data} onDone={() => setEditing(false)} />
        ) : (
          <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <DetailRow label="Full name" value={data.fullName} />
            <DetailRow
              label="Agent code"
              value={<span className="font-mono">{data.agentCode}</span>}
            />
            <DetailRow label="Email" value={data.email} />
            <DetailRow label="Phone" value={data.phone} />
            <DetailRow label="Address" value={data.address || "—"} />
            <DetailRow label="Joined" value={formatDate(data.joinedAt)} />
            <DetailRow
              label="Account status"
              value={data.status.charAt(0) + data.status.slice(1).toLowerCase()}
            />
            <DetailRow label="Last login" value={formatDateTime(data.lastLoginAt)} />
            <DetailRow label="Customers" value={formatNumber(data.stats.customers)} />
            <DetailRow label="Policies sold" value={formatNumber(data.stats.policiesSold)} />
          </dl>
        )}
      </SectionCard>

      <SectionCard
        title="Change Password"
        icon={KeyRound}
        description={
          data.passwordChangedAt
            ? `Last changed ${formatDateTime(data.passwordChangedAt)}`
            : "Keep your account secure"
        }
      >
        <ChangePasswordForm />
      </SectionCard>
    </div>
  );
}

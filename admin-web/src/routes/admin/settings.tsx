import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Bell, ImagePlus, KeyRound, Loader2, Trash2, UserCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { ChangePasswordForm } from "@/components/agent/ChangePasswordForm";
import { SettingsSection } from "@/components/admin/settings/SettingsComponents";
import { PushToggle } from "@/components/pwa/pwa";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Toaster } from "@/components/ui/sonner";
import { currentUserKey } from "@/hooks/use-current-user";
import { requireAdminSession } from "@/lib/admin-route-guard";
import {
  ApiError,
  isApiConfigured,
  retryUnlessClientError,
  tenantProfileApi,
  tenantProfileKey,
  type TenantProfile,
} from "@/lib/api";
import { readLogo } from "@/lib/read-logo";
import { cn } from "@/lib/utils";
import { AdminFooter } from "@/components/admin/AdminFooter";

export const Route = createFileRoute("/admin/settings")({
  ssr: false,
  beforeLoad: requireAdminSession,
  head: () => ({ meta: [{ title: "Settings — InsuroX Prime" }] }),
  component: AgencySettingsPage,
});

const SECTIONS = [
  { id: "profile", label: "Profile", icon: UserCircle },
  { id: "alerts", label: "Phone alerts", icon: Bell },
  { id: "password", label: "Change password", icon: KeyRound },
] as const;
type SectionId = (typeof SECTIONS)[number]["id"];

const PHONE_PATTERN = /^\+?[\d\s-]{7,20}$/;

const errorMessage = (error: unknown) =>
  error instanceof ApiError ? error.message : "Something went wrong. Please try again.";

function AgencySettingsPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [section, setSection] = useState<SectionId>("profile");

  return (
    <div className="min-h-screen bg-surface/30 text-foreground">
      <AdminSidebar
        currentPath="/admin/settings"
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />
      <div className="app-shell-pad flex min-h-screen flex-col">
        <AdminHeader onToggleSidebar={() => setSidebarOpen(true)} />
        <main className="mx-auto w-full max-w-4xl flex-1 space-y-6 p-4 sm:p-6 lg:p-8">
          <div>
            <h1 className="font-display text-2xl font-extrabold tracking-tight sm:text-3xl">
              Settings
            </h1>
            <p className="text-xs text-muted-foreground sm:text-sm">
              Manage your agency profile and your sign-in password.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-[13rem_minmax(0,1fr)]">
            <nav aria-label="Settings sections">
              <ul className="flex gap-1 md:sticky md:top-28 md:flex-col">
                {SECTIONS.map((item) => {
                  const Icon = item.icon;
                  const active = item.id === section;
                  return (
                    <li key={item.id} className="flex-1 md:flex-none">
                      <button
                        type="button"
                        onClick={() => setSection(item.id)}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "flex w-full cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-colors",
                          active
                            ? "bg-primary/10 text-primary"
                            : "text-muted-foreground hover:bg-muted hover:text-foreground",
                        )}
                      >
                        <Icon className="size-4 shrink-0" />
                        {item.label}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </nav>
            <div className="min-w-0">
              {section === "profile" && <ProfileSection />}
              {section === "alerts" && <AlertsSection />}
              {section === "password" && <PasswordSection />}
            </div>
          </div>
        </main>
        <AdminFooter />
      </div>
      <Toaster position="top-right" richColors />
    </div>
  );
}

function ProfileSection() {
  const queryClient = useQueryClient();
  const profile = useQuery({
    queryKey: tenantProfileKey,
    queryFn: tenantProfileApi.get,
    enabled: isApiConfigured && typeof window !== "undefined",
    retry: retryUnlessClientError,
    refetchOnWindowFocus: false,
  });

  if (profile.isError) {
    return (
      <p role="alert" className="rounded-2xl border border-border/80 p-6 text-sm text-destructive">
        Could not load your profile. {errorMessage(profile.error)}
      </p>
    );
  }
  if (!profile.data) {
    return (
      <div className="flex items-center gap-2 py-16 text-sm text-muted-foreground" role="status">
        <Loader2 className="size-4 animate-spin" /> Loading profile…
      </div>
    );
  }
  return (
    <ProfileForm
      key={JSON.stringify(profile.data)}
      saved={profile.data}
      onSaved={(next) => {
        queryClient.setQueryData(tenantProfileKey, next);
        // The sidebar logo comes from the current user.
        void queryClient.invalidateQueries({ queryKey: currentUserKey });
      }}
    />
  );
}

function ProfileForm({
  saved,
  onSaved,
}: {
  saved: TenantProfile;
  onSaved: (next: TenantProfile) => void;
}) {
  const [logoUrl, setLogoUrl] = useState(saved.logoUrl);
  const [phone, setPhone] = useState(saved.contactPhone ?? "");
  const [address, setAddress] = useState(saved.address ?? "");

  const phoneOk = phone.trim() === "" || PHONE_PATTERN.test(phone.trim());
  const addressOk = address.trim() === "" || address.trim().length >= 5;
  const dirty =
    logoUrl !== saved.logoUrl ||
    (phone.trim() || null) !== saved.contactPhone ||
    (address.trim() || null) !== saved.address;

  const save = useMutation({
    mutationFn: () =>
      tenantProfileApi.update({
        logoUrl,
        contactPhone: phone.trim() || null,
        address: address.trim() || null,
      }),
    onSuccess: (next) => {
      toast.success("Profile saved");
      onSaved(next);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const pickLogo = async (file: File | undefined) => {
    if (!file) return;
    try {
      setLogoUrl(await readLogo(file));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "That image could not be read.");
    }
  };

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (dirty && phoneOk && addressOk) save.mutate();
      }}
    >
      <SettingsSection
        title="Agency profile"
        description="Your logo is shown to you and your agents after sign-in."
        footer={
          <>
            <span className="text-xs text-muted-foreground">
              Agency name, legal name and licence codes are managed by the platform team.
            </span>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!dirty || save.isPending}
                onClick={() => {
                  setLogoUrl(saved.logoUrl);
                  setPhone(saved.contactPhone ?? "");
                  setAddress(saved.address ?? "");
                }}
              >
                Reset
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={!dirty || !phoneOk || !addressOk || save.isPending}
              >
                {save.isPending && <Loader2 className="size-3.5 animate-spin" />} Save changes
              </Button>
            </div>
          </>
        }
      >
        <div className="flex items-center gap-4 px-5 py-4 sm:px-6">
          <div className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-2xl border border-border/80 bg-surface/60">
            {logoUrl ? (
              <img src={logoUrl} alt="Logo preview" className="size-full object-contain" />
            ) : (
              <ImagePlus className="size-6 text-muted-foreground" />
            )}
          </div>
          <div className="space-y-2">
            <Label
              htmlFor="s-logo"
              className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-xl border border-border px-3 text-xs font-bold"
            >
              <ImagePlus className="size-4" /> {logoUrl ? "Change logo" : "Upload logo"}
            </Label>
            <input
              id="s-logo"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="sr-only"
              onChange={(event) => {
                void pickLogo(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
            {logoUrl && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 rounded-lg text-xs text-destructive"
                onClick={() => setLogoUrl(null)}
              >
                <Trash2 /> Remove
              </Button>
            )}
            <p className="text-[11px] text-muted-foreground">
              PNG, JPEG or WebP, resized to 256px.
            </p>
          </div>
        </div>
        <div className="space-y-1.5 px-5 py-4 sm:px-6">
          <Label htmlFor="s-phone" className="text-sm font-semibold">
            Phone number
          </Label>
          <Input
            id="s-phone"
            type="tel"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            aria-invalid={!phoneOk}
            className="h-10 max-w-sm rounded-xl"
          />
          {!phoneOk && (
            <p className="text-xs font-medium text-destructive">Enter a valid phone number.</p>
          )}
        </div>
        <div className="space-y-1.5 px-5 py-4 sm:px-6">
          <Label htmlFor="s-address" className="text-sm font-semibold">
            Address
          </Label>
          <Textarea
            id="s-address"
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            maxLength={500}
            rows={3}
            aria-invalid={!addressOk}
            className="rounded-xl"
          />
          {!addressOk && (
            <p className="text-xs font-medium text-destructive">Enter at least 5 characters.</p>
          )}
        </div>
      </SettingsSection>
    </form>
  );
}

function AlertsSection() {
  return (
    <SettingsSection
      title="Phone alerts"
      description="Get a notification on this device when you're invited to a meeting, and 2 hours and 15 minutes before one starts, even when the app is closed."
    >
      <div className="flex flex-col gap-2 px-5 py-5 sm:px-6">
        <PushToggle />
      </div>
    </SettingsSection>
  );
}

function PasswordSection() {
  return (
    <SettingsSection
      title="Change password"
      description="Changing your password signs you out on other devices."
    >
      <div className="max-w-md px-5 py-5 sm:px-6">
        <ChangePasswordForm />
      </div>
    </SettingsSection>
  );
}

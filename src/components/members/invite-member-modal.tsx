"use client";

import { Check, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import {
  inviteMember,
  type MemberRole,
} from "@/app/city/[slug]/members/actions";
import {
  CrewChecklist,
  type CrewOption,
  FormError,
  humanizeMemberError,
  MemberModalShell,
  RoleSelect,
  roleRequiresTeam,
  TeamSelect,
  TextField,
} from "@/components/members/member-modal";
import { Button } from "@/components/ui/button";

/* ==================================================================
   Invite member — trigger + dialog. Self-manages its own open state
   so the page (a server component) drops it into the header behind a
   canManage gate without wiring any client state of its own.
   ================================================================== */

export function InviteMemberModal({
  slug,
  crews,
}: {
  slug: string;
  crews: CrewOption[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="accent" size="sm" onClick={() => setOpen(true)}>
        <UserPlus className="h-4 w-4" strokeWidth={2} />
        Invite member
      </Button>
      {open && (
        <InviteDialog
          slug={slug}
          crews={crews}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function InviteDialog({
  slug,
  crews,
  onClose,
}: {
  slug: string;
  crews: CrewOption[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<MemberRole>("staff_dispatcher");
  const [teamKey, setTeamKey] = useState<string | null>(null);
  const [crewIds, setCrewIds] = useState<string[]>([]);
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  // Email the last invite went to — drives the inline success panel.
  const [sentTo, setSentTo] = useState<string | null>(null);

  const emailId = useId();
  const nameId = useId();
  const roleId = useId();
  const teamId = useId();
  const phoneId = useId();

  const needsTeam = roleRequiresTeam(role);
  const canSubmit =
    email.trim().length > 0 &&
    name.trim().length > 0 &&
    (!needsTeam || teamKey !== null);

  function resetForm() {
    setEmail("");
    setName("");
    setRole("staff_dispatcher");
    setTeamKey(null);
    setCrewIds([]);
    setPhone("");
    setError(null);
    setSentTo(null);
  }

  // Crew membership is division-scoped — changing the team clears any picks
  // that belonged to the previous one.
  function handleTeamChange(next: string | null) {
    setTeamKey(next);
    setCrewIds([]);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!canSubmit) {
      setError(
        needsTeam
          ? "Add an email, a name, and a team for this staff role."
          : "Add an email and a name.",
      );
      return;
    }
    const trimmedEmail = email.trim();
    startTransition(async () => {
      const res = await inviteMember({
        slug,
        email: trimmedEmail,
        displayName: name.trim(),
        role,
        teamKey,
        phone: phone.trim() ? phone.trim() : null,
        crewIds,
      });
      if (res.ok) {
        setSentTo(trimmedEmail);
        // Roster gains the pending-invite row on the server; pull it in.
        router.refresh();
      } else {
        setError(humanizeMemberError(res.error));
      }
    });
  }

  return (
    <MemberModalShell
      title="Invite member"
      subtitle="Grant console access to this city"
      icon={<UserPlus className="h-4 w-4" strokeWidth={1.75} />}
      onClose={onClose}
    >
      {sentTo ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full border border-hairline bg-overlay text-foreground">
            <Check className="h-5 w-5" strokeWidth={2.25} />
          </span>
          <div>
            <h3 className="text-[15px] font-semibold text-foreground">
              Invite sent
            </h3>
            <p className="mt-1 text-[13px] text-subtle">
              Invite sent to{" "}
              <span className="font-medium text-foreground">{sentTo}</span>
            </p>
          </div>
          <div className="mt-1 flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>
              Done
            </Button>
            <Button variant="accent" size="sm" onClick={resetForm}>
              Invite another
            </Button>
          </div>
        </div>
      ) : (
        <form
          onSubmit={handleSubmit}
          className="flex flex-1 flex-col overflow-hidden"
        >
          <div className="flex-1 space-y-4 overflow-y-auto custom-scrollbar p-5">
            {error && <FormError message={error} />}

            <TextField
              id={emailId}
              label="Email"
              type="email"
              value={email}
              onChange={setEmail}
              required
              placeholder="name@city.gov"
              autoComplete="off"
              inputMode="email"
            />
            <TextField
              id={nameId}
              label="Name"
              value={name}
              onChange={setName}
              required
              placeholder="Full name"
              autoComplete="off"
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <RoleSelect id={roleId} value={role} onChange={setRole} />
              <TeamSelect
                id={teamId}
                value={teamKey}
                onChange={handleTeamChange}
                required={needsTeam}
              />
            </div>
            <CrewChecklist
              crews={crews}
              teamKey={teamKey}
              selected={crewIds}
              onChange={setCrewIds}
            />
            <TextField
              id={phoneId}
              label="Phone"
              type="tel"
              value={phone}
              onChange={setPhone}
              placeholder="Optional"
              autoComplete="off"
              inputMode="tel"
            />
          </div>

          <div className="flex flex-shrink-0 items-center justify-end gap-3 border-t border-hairline px-5 py-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="accent"
              isPending={pending}
              disabled={!canSubmit || pending}
            >
              Send invite
            </Button>
          </div>
        </form>
      )}
    </MemberModalShell>
  );
}

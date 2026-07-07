"use client";

import { Pencil } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import {
  type MemberRole,
  updateMember,
} from "@/app/city/[slug]/members/actions";
import {
  FormError,
  humanizeMemberError,
  MemberModalShell,
  RoleSelect,
  roleRequiresTeam,
  TeamSelect,
  TextField,
} from "@/components/members/member-modal";
import { Button } from "@/components/ui/button";
import type { MemberRow } from "@/lib/db/members";

/* ==================================================================
   Edit member — controlled by the members table row edit buttons.
   `member === null` closes it; a fresh `member` remounts the inner
   dialog (via key) so its prefilled fields reset per selection.
   ================================================================== */

export function EditMemberModal({
  member,
  slug,
  onClose,
}: {
  member: MemberRow | null;
  slug: string;
  onClose: () => void;
}) {
  if (!member) return null;
  return (
    <EditDialog key={member.id} member={member} slug={slug} onClose={onClose} />
  );
}

function EditDialog({
  member,
  slug,
  onClose,
}: {
  member: MemberRow;
  slug: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [name, setName] = useState(member.displayName ?? "");
  const [role, setRole] = useState<MemberRole>(member.role);
  const [teamKey, setTeamKey] = useState<string | null>(member.teamKey);
  const [phone, setPhone] = useState(member.phone ?? "");
  const [error, setError] = useState<string | null>(null);

  const nameId = useId();
  const roleId = useId();
  const teamId = useId();
  const phoneId = useId();

  const needsTeam = roleRequiresTeam(role);
  const canSubmit = name.trim().length > 0 && (!needsTeam || teamKey !== null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!canSubmit) {
      setError(
        needsTeam
          ? "Add a name and a team for this staff role."
          : "Add a name.",
      );
      return;
    }
    startTransition(async () => {
      const res = await updateMember({
        slug,
        userId: member.id,
        displayName: name.trim(),
        role,
        teamKey,
        phone: phone.trim() ? phone.trim() : null,
      });
      if (res.ok) {
        router.refresh();
        onClose();
      } else {
        setError(humanizeMemberError(res.error));
      }
    });
  }

  return (
    <MemberModalShell
      title={member.displayName ?? "Member"}
      subtitle={member.email ?? "No email on file"}
      icon={<Pencil className="h-4 w-4" strokeWidth={1.75} />}
      onClose={onClose}
    >
      <form
        onSubmit={handleSubmit}
        className="flex flex-1 flex-col overflow-hidden"
      >
        <div className="flex-1 space-y-4 overflow-y-auto custom-scrollbar p-5">
          {error && <FormError message={error} />}

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
              onChange={setTeamKey}
              required={needsTeam}
            />
          </div>
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
            Save changes
          </Button>
        </div>
      </form>
    </MemberModalShell>
  );
}

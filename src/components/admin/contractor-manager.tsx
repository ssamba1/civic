"use client";

import { useState } from "react";
import {
  createContractor,
  deactivateContractor,
  reactivateContractor,
  type ContractorRow,
} from "@/app/admin/contractors/actions";

interface Props {
  contractors: ContractorRow[];
}

export function ContractorManager({ contractors: initial }: Props) {
  const [contractors, setContractors] = useState(initial);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreateError(null);
    setCreating(true);
    const result = await createContractor({ name: name.trim(), email: email.trim() });
    setCreating(false);

    if (!result.ok) {
      setCreateError(result.error.replace(/_/g, " "));
      return;
    }

    // Optimistically add — server will revalidate
    const newRow: ContractorRow = {
      id: result.data.id,
      city_id: "",
      name: name.trim(),
      email: email.trim().toLowerCase(),
      active: true,
      created_at: new Date().toISOString(),
    };
    setContractors((prev) => [...prev, newRow].sort((a, b) => a.name.localeCompare(b.name)));
    setName("");
    setEmail("");
  }

  async function handleToggleActive(contractor: ContractorRow) {
    setBusy(contractor.id);
    const result = contractor.active
      ? await deactivateContractor(contractor.id)
      : await reactivateContractor(contractor.id);
    setBusy(null);

    if (result.ok) {
      setContractors((prev) =>
        prev.map((c) =>
          c.id === contractor.id ? { ...c, active: !contractor.active } : c,
        ),
      );
    }
  }

  return (
    <div className="space-y-8">
      {/* Add contractor form */}
      <form
        onSubmit={handleCreate}
        className="rounded-xl border border-zinc-200 bg-zinc-50 p-5 dark:border-zinc-700 dark:bg-zinc-800/50"
      >
        <h2 className="mb-4 text-base font-medium text-zinc-900 dark:text-zinc-100">
          Add contractor
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label
              htmlFor="contractor-name"
              className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300"
            >
              Name
            </label>
            <input
              id="contractor-name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Acme Paving Co."
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-blue-500 focus:outline-none dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
            />
          </div>
          <div>
            <label
              htmlFor="contractor-email"
              className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300"
            >
              Email (login address)
            </label>
            <input
              id="contractor-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="crew@acme.com"
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-blue-500 focus:outline-none dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
            />
          </div>
        </div>
        {createError && (
          <p className="mt-2 text-xs text-red-600 dark:text-red-400">
            {createError}
          </p>
        )}
        <div className="mt-3 flex justify-end">
          <button
            type="submit"
            disabled={creating}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 dark:bg-blue-700 dark:hover:bg-blue-600"
          >
            {creating ? "Adding…" : "Add contractor"}
          </button>
        </div>
      </form>

      {/* Contractor list */}
      {contractors.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          No contractors yet. Add one above.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-700">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50 text-left dark:border-zinc-700 dark:bg-zinc-800">
                <th className="px-4 py-3 font-medium text-zinc-600 dark:text-zinc-400">
                  Name
                </th>
                <th className="px-4 py-3 font-medium text-zinc-600 dark:text-zinc-400">
                  Email
                </th>
                <th className="px-4 py-3 font-medium text-zinc-600 dark:text-zinc-400">
                  Status
                </th>
                <th className="px-4 py-3 font-medium text-zinc-600 dark:text-zinc-400" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {contractors.map((c) => (
                <tr
                  key={c.id}
                  className="bg-white dark:bg-zinc-900"
                >
                  <td className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100">
                    {c.name}
                  </td>
                  <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                    {c.email}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                        c.active
                          ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300"
                          : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
                      }`}
                    >
                      {c.active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      disabled={busy === c.id}
                      onClick={() => handleToggleActive(c)}
                      className={`text-xs font-medium disabled:opacity-50 ${
                        c.active
                          ? "text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
                          : "text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                      }`}
                    >
                      {busy === c.id
                        ? "…"
                        : c.active
                          ? "Deactivate"
                          : "Reactivate"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

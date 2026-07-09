"use client";

import { useState } from "react";
import {
  confirmImportAction,
  previewImportAction,
} from "@/app/admin/import/actions";
import type { NormalizedReport } from "@/lib/onboarding/ingest/types";

type Source = "csv" | "seeclickfix_json";

interface City {
  id: string;
  label: string;
}

interface Props {
  cities: City[];
}

type Step = "upload" | "preview" | "done";

export function ImportWizard({ cities }: Props) {
  const [step, setStep] = useState<Step>("upload");
  const [source, setSource] = useState<Source>("csv");
  const [text, setText] = useState("");
  const [cityId, setCityId] = useState(cities[0]?.id ?? "");
  const [preview, setPreview] = useState<NormalizedReport[]>([]);
  const [total, setTotal] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inserted, setInserted] = useState<number | null>(null);

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setText((ev.target?.result as string) ?? "");
    reader.readAsText(file);
  }

  async function handlePreview() {
    if (!text.trim()) {
      setError("Paste or upload data first.");
      return;
    }
    setBusy(true);
    setError(null);
    const result = await previewImportAction({ text, source });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setPreview(result.data.preview);
    setTotal(result.data.total);
    setStep("preview");
  }

  async function handleConfirm() {
    if (!cityId) {
      setError("Select a city first.");
      return;
    }
    setBusy(true);
    setError(null);
    const result = await confirmImportAction({ text, source, cityId });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setInserted(result.data.inserted);
    setStep("done");
  }

  function reset() {
    setStep("upload");
    setText("");
    setPreview([]);
    setTotal(0);
    setInserted(null);
    setError(null);
  }

  if (step === "done") {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 p-6 dark:border-green-800 dark:bg-green-950">
        <p className="text-base font-medium text-green-800 dark:text-green-200">
          Import complete — {inserted} report{inserted !== 1 ? "s" : ""}{" "}
          inserted.
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-3 text-sm text-green-700 underline dark:text-green-400"
        >
          Import another file
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-400">
          {error}
        </div>
      )}

      {step === "upload" && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Source format
            </label>
            <select
              value={source}
              onChange={(e) => setSource(e.target.value as Source)}
              className="mt-1 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            >
              <option value="csv">CSV (generic 311 export)</option>
              <option value="seeclickfix_json">SeeClickFix JSON</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Upload file
            </label>
            <input
              type="file"
              accept={source === "csv" ? ".csv,text/csv" : ".json,application/json"}
              onChange={handleFileUpload}
              className="mt-1 block text-sm text-zinc-600 dark:text-zinc-400"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Or paste data
            </label>
            <textarea
              rows={8}
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="mt-1 w-full rounded-md border border-zinc-300 bg-white p-3 font-mono text-xs dark:border-zinc-700 dark:bg-zinc-900"
              placeholder={
                source === "csv"
                  ? "id,latitude,longitude,category,status,created_at,address..."
                  : '[{"id":1,"lat":34.27,"lng":-84.07,...}]'
              }
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Target city
            </label>
            <select
              value={cityId}
              onChange={(e) => setCityId(e.target.value)}
              className="mt-1 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            >
              {cities.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={handlePreview}
            disabled={busy || !text.trim()}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {busy ? "Parsing…" : "Preview import"}
          </button>
        </div>
      )}

      {step === "preview" && (
        <div className="space-y-4">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Parsed <strong>{total}</strong> records. Showing up to 50 below.
            Review before confirming the bulk insert.
          </p>

          <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-700">
            <table className="w-full text-xs">
              <thead className="bg-zinc-50 dark:bg-zinc-800">
                <tr>
                  {["Source ID", "Category", "Status", "Severity", "Lat", "Lng", "Date"].map(
                    (h) => (
                      <th
                        key={h}
                        className="px-3 py-2 text-left font-medium text-zinc-600 dark:text-zinc-400"
                      >
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {preview.map((r, i) => (
                  <tr
                    key={r.sourceExternalId ?? i}
                    className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                  >
                    <td className="px-3 py-1.5 text-zinc-500">
                      {r.sourceExternalId ?? "—"}
                    </td>
                    <td className="px-3 py-1.5">{r.category}</td>
                    <td className="px-3 py-1.5">{r.status}</td>
                    <td className="px-3 py-1.5">{r.severity}</td>
                    <td className="px-3 py-1.5">{r.location.lat.toFixed(4)}</td>
                    <td className="px-3 py-1.5">{r.location.lng.toFixed(4)}</td>
                    <td className="px-3 py-1.5">
                      {r.createdAt ? new Date(r.createdAt).toLocaleDateString() : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setStep("upload")}
              className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300"
            >
              Back
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={busy}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {busy ? "Importing…" : `Import all ${total} records`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

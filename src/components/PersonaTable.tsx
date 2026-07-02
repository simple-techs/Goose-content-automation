"use client";

import { useState } from "react";
import StatusBadge from "./StatusBadge";
import ApprovalModal from "./ApprovalModal";
import type { Persona } from "@/lib/types";

interface PersonaTableProps {
  personas: Persona[];
  onRefresh: () => void;
}

export default function PersonaTable({ personas, onRefresh }: PersonaTableProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState<string | null>(null);
  const [reviewPersona, setReviewPersona] = useState<Persona | null>(null);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === personas.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(personas.map((p) => p.id)));
    }
  };

  const handleOnboard = async () => {
    const onboardable = personas
      .filter((p) => selected.has(p.id) && (p.status === "pending" || p.status === "error"))
      .map((p) => p.id);

    if (onboardable.length === 0) return;

    setLoading("onboarding");
    try {
      await fetch("/api/onboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personaIds: onboardable }),
      });
      onRefresh();
    } finally {
      setLoading(null);
    }
  };

  const handleGenerate = async () => {
    const activeSelected = personas
      .filter((p) => selected.has(p.id) && p.status === "active")
      .map((p) => p.id);

    if (activeSelected.length === 0) return;

    setLoading("generating");
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personaIds: activeSelected }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        alert(data.error || "Generation failed. Check Settings.");
      } else if (data.failed > 0) {
        const errors = data.results
          .filter((r: { success: boolean }) => !r.success)
          .map((r: { error?: string }) => r.error)
          .join("\n");
        alert(`${data.succeeded} succeeded, ${data.failed} failed:\n${errors}`);
      }
      onRefresh();
    } finally {
      setLoading(null);
    }
  };

  const onboardableCount = personas.filter(
    (p) => selected.has(p.id) && (p.status === "pending" || p.status === "error")
  ).length;
  const activeCount = personas.filter(
    (p) => selected.has(p.id) && p.status === "active"
  ).length;
  const pendingApprovalCount = personas.filter(
    (p) => p.status === "pending_approval"
  ).length;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <button
          onClick={handleOnboard}
          disabled={onboardableCount === 0 || loading !== null}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading === "onboarding"
            ? "Creating Soul IDs..."
            : `Onboard Selected (${onboardableCount})`}
        </button>
        <button
          onClick={handleGenerate}
          disabled={activeCount === 0 || loading !== null}
          className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading === "generating"
            ? "Generating..."
            : `Generate Content (${activeCount})`}
        </button>
        {selected.size > 0 && (
          <span className="text-sm text-gray-500">
            {selected.size} selected
          </span>
        )}
        {pendingApprovalCount > 0 && (
          <span className="ml-auto text-sm font-medium text-purple-600">
            {pendingApprovalCount} awaiting approval
          </span>
        )}
      </div>

      <div className="overflow-hidden rounded-lg border border-gray-200 shadow-sm">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="w-12 px-4 py-3">
                <input
                  type="checkbox"
                  checked={selected.size === personas.length && personas.length > 0}
                  onChange={toggleAll}
                  className="rounded border-gray-300"
                />
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Persona
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Status
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Images
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Soul ID
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {personas.map((persona) => (
              <tr
                key={persona.id}
                className={`hover:bg-gray-50 ${selected.has(persona.id) ? "bg-blue-50" : ""}`}
              >
                <td className="px-4 py-3">
                  <input
                    type="checkbox"
                    checked={selected.has(persona.id)}
                    onChange={() => toggleSelect(persona.id)}
                    className="rounded border-gray-300"
                  />
                </td>
                <td className="px-4 py-3">
                  <div className="font-medium text-gray-900">{persona.name}</div>
                  {persona.error_message && (
                    <div className="mt-1 text-xs text-red-500 truncate max-w-xs">
                      {persona.error_message}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={persona.status} />
                </td>
                <td className="px-4 py-3 text-sm text-gray-600">
                  {persona.image_count}
                </td>
                <td className="px-4 py-3 text-sm text-gray-600">
                  {persona.higgsfield_soul_id ? (
                    <span className="font-mono text-xs truncate max-w-[120px] inline-block">
                      {persona.higgsfield_soul_id.slice(0, 12)}...
                    </span>
                  ) : (
                    <span className="text-gray-400">--</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    {persona.status === "pending_approval" && (
                      <button
                        onClick={() => setReviewPersona(persona)}
                        className="rounded-md bg-purple-600 px-3 py-1 text-xs font-medium text-white hover:bg-purple-700"
                      >
                        Review
                      </button>
                    )}
                    {persona.drive_folder_url && (
                      <a
                        href={persona.drive_folder_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-blue-600 hover:underline"
                      >
                        Drive
                      </a>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {personas.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-8 text-center text-sm text-gray-500"
                >
                  No personas found. Sync from Google Drive to get started.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {reviewPersona && (
        <ApprovalModal
          personaId={reviewPersona.id}
          personaName={reviewPersona.name}
          onClose={() => setReviewPersona(null)}
          onApproved={() => {
            setReviewPersona(null);
            onRefresh();
          }}
        />
      )}
    </div>
  );
}

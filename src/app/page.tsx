"use client";

import { useState, useEffect, useCallback } from "react";
import PersonaTable from "@/components/PersonaTable";
import StatsBar from "@/components/StatsBar";
import SettingsPanel from "@/components/SettingsPanel";
import type { Persona } from "@/lib/types";

type Tab = "personas" | "settings";

export default function Dashboard() {
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [tab, setTab] = useState<Tab>("personas");
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState("");
  const [generatingAll, setGeneratingAll] = useState(false);
  const [onboardingAll, setOnboardingAll] = useState(false);

  const fetchPersonas = useCallback(async () => {
    try {
      const res = await fetch("/api/personas");
      const data = await res.json();
      setPersonas(data.personas || []);
    } catch {
      console.error("Failed to fetch personas");
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/personas")
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setPersonas(d.personas || []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSync = async () => {
    setSyncing(true);
    setSyncMessage("");
    try {
      const res = await fetch("/api/personas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (res.ok) {
        setSyncMessage(data.message);
        fetchPersonas();
      } else {
        setSyncMessage(data.error || "Sync failed");
      }
    } catch {
      setSyncMessage("Sync failed — check your settings");
    } finally {
      setSyncing(false);
    }
  };

  const handleOnboardAll = async () => {
    setOnboardingAll(true);
    try {
      await fetch("/api/onboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
      fetchPersonas();
    } finally {
      setOnboardingAll(false);
    }
  };

  const handleGenerateAll = async () => {
    setGeneratingAll(true);
    try {
      await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
      fetchPersonas();
    } finally {
      setGeneratingAll(false);
    }
  };

  const pendingCount = personas.filter((p) => p.status === "pending" || p.status === "error").length;
  const activeCount = personas.filter((p) => p.status === "active").length;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div>
            <h1 className="text-xl font-bold text-gray-900">
              Goose Content Automation
            </h1>
            <p className="text-sm text-gray-500">
              AI persona content generation pipeline
            </p>
          </div>
          <nav className="flex gap-1">
            <button
              onClick={() => setTab("personas")}
              className={`rounded-lg px-4 py-2 text-sm font-medium ${
                tab === "personas"
                  ? "bg-gray-900 text-white"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              Personas
            </button>
            <button
              onClick={() => setTab("settings")}
              className={`rounded-lg px-4 py-2 text-sm font-medium ${
                tab === "settings"
                  ? "bg-gray-900 text-white"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              Settings
            </button>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8">
        {tab === "personas" && (
          <div className="space-y-6">
            <StatsBar personas={personas} />

            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={handleSync}
                disabled={syncing}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50"
              >
                {syncing ? "Syncing..." : "Sync from Drive"}
              </button>
              <button
                onClick={handleOnboardAll}
                disabled={onboardingAll || pendingCount === 0}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {onboardingAll
                  ? "Onboarding..."
                  : `Onboard All (${pendingCount})`}
              </button>
              <button
                onClick={handleGenerateAll}
                disabled={generatingAll || activeCount === 0}
                className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {generatingAll
                  ? "Generating..."
                  : `Generate All Active (${activeCount})`}
              </button>
              {syncMessage && (
                <span
                  className={`text-sm ${
                    syncMessage.includes("failed") || syncMessage.includes("error")
                      ? "text-red-600"
                      : "text-green-600"
                  }`}
                >
                  {syncMessage}
                </span>
              )}
            </div>

            <PersonaTable personas={personas} onRefresh={fetchPersonas} />
          </div>
        )}

        {tab === "settings" && <SettingsPanel />}
      </main>
    </div>
  );
}

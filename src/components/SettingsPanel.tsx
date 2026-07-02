"use client";

import { useState, useEffect } from "react";
import type { AppSettings } from "@/lib/types";

export default function SettingsPanel() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => {
        if (!r.ok) throw new Error("API returned " + r.status);
        return r.json();
      })
      .then((d) => {
        if (d.settings) setSettings(d.settings);
        else setMessage("No settings found — configure and save below");
      })
      .catch(() => setMessage("Failed to load settings"))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    if (!settings) return;
    setSaving(true);
    setMessage("");
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parent_drive_folder_id: settings.parent_drive_folder_id,
          slack_webhook_url: settings.slack_webhook_url,
          slack_channel: settings.slack_channel,
          default_prompt: settings.default_prompt,
          approval_prompt: settings.approval_prompt,
          generation_count: settings.generation_count,
          cron_enabled: settings.cron_enabled,
          cron_day: settings.cron_day,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setSettings(data.settings);
        setMessage("Settings saved");
      } else {
        setMessage(data.error || "Failed to save");
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="text-sm text-gray-500">Loading settings...</div>;
  }

  if (!settings && message) {
    return (
      <div className="space-y-4 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900">Settings</h2>
        <p className="text-sm text-red-600">{message}</p>
        <p className="text-xs text-gray-500">
          Make sure your Supabase environment variables are configured and the migration has been run.
        </p>
      </div>
    );
  }

  if (!settings) {
    return <div className="text-sm text-gray-500">Loading settings...</div>;
  }

  return (
    <div className="space-y-4 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-gray-900">Settings</h2>

      <div className="border-b border-gray-200 pb-4">
        <h3 className="text-sm font-medium text-gray-700">Google Drive Connection</h3>
        {settings.google_email ? (
          <div className="mt-2 flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700">
              <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
              Connected
            </span>
            <span className="text-sm text-gray-600">{settings.google_email}</span>
            <button
              onClick={() => window.location.href = "/api/auth/google"}
              className="ml-auto text-xs text-blue-600 hover:underline"
            >
              Reconnect
            </button>
          </div>
        ) : (
          <div className="mt-2">
            <button
              onClick={() => window.location.href = "/api/auth/google"}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Connect Google Drive
            </button>
            <p className="mt-1 text-xs text-gray-500">
              Sign in with your Google account to access your Drive folders
            </p>
          </div>
        )}
      </div>

      <div className="border-b border-gray-200 pb-4">
        <h3 className="text-sm font-medium text-gray-700">Higgsfield Connection</h3>
        <div className="mt-2 space-y-3">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700">
              <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
              API Key Connected
            </span>
            {settings.higgsfield_email && (
              <span className="text-sm text-gray-600">{settings.higgsfield_email}</span>
            )}
          </div>

          <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-gray-700">Image Generation Auth</span>
              {settings.higgsfield_refresh_token ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                  <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                  Connected
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                  <span className="h-1.5 w-1.5 rounded-full bg-gray-400" />
                  Not connected
                </span>
              )}
            </div>
            <p className="mt-1 text-xs text-gray-500">
              {settings.higgsfield_refresh_token
                ? "Higgsfield OAuth connected. Tokens refresh automatically for image generation."
                : "Connect your Higgsfield account to enable image generation. One-time sign-in — tokens refresh automatically."}
            </p>
            <div className="mt-2">
              <button
                onClick={() => window.location.href = "/api/auth/higgsfield"}
                className="rounded-md bg-gray-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-900"
              >
                {settings.higgsfield_refresh_token ? "Reconnect Higgsfield" : "Connect Higgsfield"}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">
          Google Drive Parent Folder ID
        </label>
        <input
          type="text"
          value={settings.parent_drive_folder_id}
          onChange={(e) =>
            setSettings({ ...settings, parent_drive_folder_id: e.target.value })
          }
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          placeholder="e.g. 1a2b3c4d5e6f..."
        />
        <p className="mt-1 text-xs text-gray-500">
          The ID from your Google Drive folder URL
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">
          Soul ID Approval Preview Prompt
        </label>
        <p className="text-xs text-gray-500 mb-1">
          Used when generating preview images for Soul ID approval (3 images: collage of angles, full body, waist up)
        </p>
        <textarea
          value={settings.approval_prompt}
          onChange={(e) =>
            setSettings({ ...settings, approval_prompt: e.target.value })
          }
          rows={4}
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">
          Content Generation Prompt
        </label>
        <p className="text-xs text-gray-500 mb-1">
          Used for all content generation after Soul ID is approved (iPhone-realistic style, identity consistency, etc.)
        </p>
        <textarea
          value={settings.default_prompt}
          onChange={(e) =>
            setSettings({ ...settings, default_prompt: e.target.value })
          }
          rows={6}
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">
          Batch Structure
        </label>
        <div className="mt-1 rounded-md border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">
          <p className="font-medium">10 images per batch:</p>
          <ul className="mt-1 list-disc pl-5 text-xs text-gray-600 space-y-0.5">
            <li>3 selfies (taken in a row, slightly different expressions/angles)</li>
            <li>2 shirtless photos (natural physique, casual setting)</li>
            <li>5 lifestyle photos (everyday settings, candid moments)</li>
          </ul>
          <p className="mt-2 text-xs text-gray-500">
            Each type uses the Content Generation Prompt above as the base, with type-specific instructions appended automatically.
          </p>
        </div>
      </div>

      <div className="border-t border-gray-200 pt-4">
        <h3 className="text-sm font-medium text-gray-700">Slack Notifications</h3>
        <div className="mt-2 space-y-2">
          <input
            type="text"
            value={settings.slack_webhook_url || ""}
            onChange={(e) =>
              setSettings({ ...settings, slack_webhook_url: e.target.value || null })
            }
            className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder="Slack Webhook URL"
          />
          <input
            type="text"
            value={settings.slack_channel || ""}
            onChange={(e) =>
              setSettings({ ...settings, slack_channel: e.target.value || null })
            }
            className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder="Slack Channel (optional, e.g. #content)"
          />
        </div>
      </div>

      <div className="border-t border-gray-200 pt-4">
        <h3 className="text-sm font-medium text-gray-700">Weekly Auto-Generation</h3>
        <div className="mt-2 flex items-center gap-4">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={settings.cron_enabled}
              onChange={(e) =>
                setSettings({ ...settings, cron_enabled: e.target.checked })
              }
              className="rounded border-gray-300"
            />
            <span className="text-sm text-gray-700">Enabled</span>
          </label>
          <select
            value={settings.cron_day}
            onChange={(e) =>
              setSettings({ ...settings, cron_day: e.target.value })
            }
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="monday">Monday</option>
            <option value="tuesday">Tuesday</option>
            <option value="wednesday">Wednesday</option>
            <option value="thursday">Thursday</option>
            <option value="friday">Friday</option>
            <option value="saturday">Saturday</option>
            <option value="sunday">Sunday</option>
          </select>
        </div>
      </div>

      <div className="flex items-center gap-3 pt-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save Settings"}
        </button>
        {message && (
          <span
            className={`text-sm ${message.includes("Failed") ? "text-red-600" : "text-green-600"}`}
          >
            {message}
          </span>
        )}
      </div>
    </div>
  );
}

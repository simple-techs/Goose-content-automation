"use client";

import { useState, useEffect } from "react";
import type { AppSettings } from "@/lib/types";

export default function SettingsPanel() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => setSettings(d.settings))
      .catch(() => setMessage("Failed to load settings"));
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

  if (!settings) {
    return <div className="text-sm text-gray-500">Loading settings...</div>;
  }

  return (
    <div className="space-y-4 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-gray-900">Settings</h2>

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
          Default Generation Prompt
        </label>
        <textarea
          value={settings.default_prompt}
          onChange={(e) =>
            setSettings({ ...settings, default_prompt: e.target.value })
          }
          rows={3}
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">
          Images per Batch
        </label>
        <input
          type="number"
          min={1}
          max={20}
          value={settings.generation_count}
          onChange={(e) =>
            setSettings({
              ...settings,
              generation_count: parseInt(e.target.value) || 4,
            })
          }
          className="mt-1 block w-24 rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
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

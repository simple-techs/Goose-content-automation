"use client";

import type { Persona } from "@/lib/types";

interface StatsBarProps {
  personas: Persona[];
}

export default function StatsBar({ personas }: StatsBarProps) {
  const total = personas.length;
  const pending = personas.filter((p) => p.status === "pending").length;
  const active = personas.filter((p) => p.status === "active").length;
  const onboarding = personas.filter((p) => p.status === "onboarding").length;
  const errored = personas.filter((p) => p.status === "error").length;

  const stats = [
    { label: "Total Personas", value: total, color: "text-gray-900" },
    { label: "Active", value: active, color: "text-green-600" },
    { label: "Pending", value: pending, color: "text-yellow-600" },
    { label: "Onboarding", value: onboarding, color: "text-blue-600" },
    { label: "Errors", value: errored, color: "text-red-600" },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
      {stats.map((stat) => (
        <div
          key={stat.label}
          className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
        >
          <div className="text-sm text-gray-500">{stat.label}</div>
          <div className={`mt-1 text-2xl font-bold ${stat.color}`}>
            {stat.value}
          </div>
        </div>
      ))}
    </div>
  );
}

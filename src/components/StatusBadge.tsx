"use client";

const statusStyles: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  onboarding: "bg-blue-100 text-blue-800",
  pending_approval: "bg-purple-100 text-purple-800",
  active: "bg-green-100 text-green-800",
  error: "bg-red-100 text-red-800",
  generating: "bg-blue-100 text-blue-800",
  uploading: "bg-purple-100 text-purple-800",
  completed: "bg-green-100 text-green-800",
  failed: "bg-red-100 text-red-800",
  queued: "bg-gray-100 text-gray-800",
  processing: "bg-blue-100 text-blue-800",
};

export default function StatusBadge({ status }: { status: string }) {
  const style = statusStyles[status] || "bg-gray-100 text-gray-800";

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${style}`}
    >
      {status}
    </span>
  );
}

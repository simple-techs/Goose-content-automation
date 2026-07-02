"use client";

import { useState, useEffect } from "react";
import type { ApprovalImage } from "@/lib/types";

interface ApprovalModalProps {
  personaId: string;
  personaName: string;
  onClose: () => void;
  onApproved: () => void;
}

export default function ApprovalModal({
  personaId,
  personaName,
  onClose,
  onApproved,
}: ApprovalModalProps) {
  const [images, setImages] = useState<ApprovalImage[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch(`/api/approval?personaId=${personaId}`)
      .then((r) => r.json())
      .then((d) => {
        setImages(d.images || []);
        setSelected(new Set((d.images || []).map((img: ApprovalImage) => img.id)));
      })
      .finally(() => setLoading(false));
  }, [personaId]);

  const toggleImage = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleApprove = async () => {
    if (selected.size === 0) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/approval", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          personaId,
          approvedIds: Array.from(selected),
        }),
      });
      if (res.ok) {
        onApproved();
      } else {
        const data = await res.json();
        alert(data.error || "Approval failed");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleReject = async () => {
    if (!confirm(`Reject Soul ID for ${personaName}? This will reset them to pending for re-training.`)) {
      return;
    }
    setSubmitting(true);
    try {
      await fetch("/api/approval", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personaId, action: "reject" }),
      });
      onApproved();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-200 pb-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              Review Soul ID: {personaName}
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              Select the images that best represent this persona, then approve.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {loading ? (
          <div className="py-12 text-center text-sm text-gray-500">
            Loading preview images...
          </div>
        ) : images.length === 0 ? (
          <div className="py-12 text-center text-sm text-gray-500">
            No preview images available.
          </div>
        ) : (
          <>
            <div className="mt-4 grid grid-cols-2 gap-4">
              {images.map((img) => (
                <div
                  key={img.id}
                  onClick={() => toggleImage(img.id)}
                  className={`relative cursor-pointer overflow-hidden rounded-lg border-2 transition-all ${
                    selected.has(img.id)
                      ? "border-blue-500 ring-2 ring-blue-200"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <img
                    src={img.image_url}
                    alt={`Preview ${img.id}`}
                    className="aspect-[3/4] w-full object-cover"
                  />
                  {selected.has(img.id) && (
                    <div className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-blue-500 text-white">
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="mt-6 flex items-center justify-between border-t border-gray-200 pt-4">
              <button
                onClick={handleReject}
                disabled={submitting}
                className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
              >
                Reject &amp; Re-train
              </button>
              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-500">
                  {selected.size} of {images.length} selected
                </span>
                <button
                  onClick={handleApprove}
                  disabled={selected.size === 0 || submitting}
                  className="rounded-lg bg-green-600 px-6 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
                >
                  {submitting ? "Approving..." : "Approve Soul ID"}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

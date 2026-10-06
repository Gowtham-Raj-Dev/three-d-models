"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

export function CopyButton({ text, label = "Copy", className = "" }: { text: string; label?: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1600);
        } catch {
          /* clipboard unavailable (insecure context) — nothing to do */
        }
      }}
      className={`inline-flex items-center gap-1.5 rounded-lg border border-line bg-white/[0.04] px-2.5 py-1 text-xs text-muted transition-colors hover:border-line-strong hover:text-fg ${className}`}
    >
      {copied ? <Check className="size-3.5 text-emerald-300" /> : <Copy className="size-3.5" />}
      {copied ? "Copied" : label}
    </button>
  );
}

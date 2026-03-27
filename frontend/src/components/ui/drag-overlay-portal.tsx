"use client";

import { createPortal } from "react-dom";
import type { ReactNode } from "react";

/** Renders children into document.body so position:fixed overlays track the viewport (not a transformed ancestor). */
export function BodyPortal({ children }: { children: ReactNode }) {
  if (typeof document === "undefined") return null;
  return createPortal(children, document.body);
}

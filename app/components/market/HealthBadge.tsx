import { FC } from "react";
import type { HealthLevel } from "@/lib/health";

const STYLES: Record<HealthLevel, string> = {
  healthy: "bg-green-100 text-green-700",
  caution: "bg-yellow-100 text-yellow-700",
  warning: "bg-red-100 text-red-700",
  empty: "bg-gray-100 text-gray-500",
};

const LABELS: Record<HealthLevel, string> = {
  healthy: "Healthy",
  caution: "Caution",
  warning: "Low Liquidity",
  empty: "Empty",
};

export const HealthBadge: FC<{ level: HealthLevel }> = ({ level }) => (
  <span
    className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STYLES[level]}`}
  >
    {LABELS[level]}
  </span>
);

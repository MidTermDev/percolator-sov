"use client";

import { useMemo } from "react";
import { useSlabState } from "@/components/providers/SlabProvider";

export { useSlabState } from "@/components/providers/SlabProvider";

export function useSlabRaw() {
  const { raw, loading, error } = useSlabState();
  return { raw, loading, error };
}

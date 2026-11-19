"use client";

import { useMe } from "@/lib/api/hooks";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** The current listener; redirects to /start when there is no session. */
export function useRequiredSession() {
  const query = useMe();
  const router = useRouter();
  const missing = query.isSuccess && query.data === null;
  useEffect(() => {
    if (missing) router.replace("/start");
  }, [missing, router]);
  return { ...query, me: query.data ?? null, ready: query.isSuccess && query.data !== null };
}

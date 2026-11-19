"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MotionConfig } from "motion/react";
import { useState, type ReactNode } from "react";
import { isApiError } from "@/lib/api/client";
import { SpectralTransitionProvider } from "@/components/transition/spectral-transition";
import { ListeningProvider } from "@/components/listen/listening";

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            refetchOnWindowFocus: false,
            retry: (count, error) => !isApiError(error) || (error.status >= 500 && count < 2),
          },
        },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <MotionConfig reducedMotion="user" transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}>
        <SpectralTransitionProvider>
          <ListeningProvider>{children}</ListeningProvider>
        </SpectralTransitionProvider>
      </MotionConfig>
    </QueryClientProvider>
  );
}

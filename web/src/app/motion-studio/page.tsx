import { MotionStudio } from "@/components/studio/studio";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Motion Studio",
  description: "Five directions for the playlist-entry sequence. An internal exploration.",
  robots: { index: false, follow: false },
};

/**
 * A temporary room for looking at motion.
 *
 * Nothing here is wired to the product: it imports no API client, touches no
 * session and shares no component with the live playlist sequence, so the thing
 * being replaced keeps running untouched while its replacement is chosen.
 */
export default function MotionStudioPage() {
  return <MotionStudio />;
}

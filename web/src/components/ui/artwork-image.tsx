"use client";

import { cn } from "@/lib/cn";
import { thumbnailUrl } from "@/lib/youtube";
import { Music2 } from "lucide-react";
import Image, { type ImageProps } from "next/image";
import { useState, type ReactNode } from "react";

type ArtworkImageProps = Omit<ImageProps, "src"> & {
  videoId: string | null | undefined;
  /** Artwork published by the source platform, preferred over the video still. */
  artworkUrl?: string | null;
  fallback?: ReactNode;
};

/** Real artwork with an explicit loading and terminal failure state. */
export function ArtworkImage({
  videoId,
  artworkUrl,
  fallback,
  className,
  onError,
  onLoad,
  alt = "",
  ...props
}: ArtworkImageProps) {
  const src = artworkUrl ?? (videoId ? thumbnailUrl(videoId) : null);
  const [state, setState] = useState<"loading" | "ready" | "failed">(src ? "loading" : "failed");

  if (state === "failed" || !src) {
    return (
      <span
        className="absolute inset-0 grid place-items-center bg-elevated text-ink-faint"
        aria-hidden="true"
      >
        {fallback ?? <Music2 className="size-4" />}
      </span>
    );
  }

  return (
    <>
      {state === "loading" && <span className="skeleton absolute inset-0" aria-hidden="true" />}
      <Image
        {...props}
        alt={alt}
        src={src}
        // YouTube stills are already optimized CDN assets, and keeping them out
        // of Next's server optimizer avoids a 500 when the dev server cannot
        // proxy i.ytimg.com. Source artwork does go through the optimizer, so a
        // playlist cover is fetched by this server rather than by the browser.
        unoptimized={!artworkUrl}
        className={cn(className, state === "loading" && "opacity-0")}
        onLoad={(event) => {
          setState("ready");
          onLoad?.(event);
        }}
        onError={(event) => {
          setState("failed");
          onError?.(event);
        }}
      />
    </>
  );
}

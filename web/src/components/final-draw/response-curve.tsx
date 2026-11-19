"use client";

/**
 * A measured frequency response, drawn.
 *
 * This is the honest portrait of an earphone. There is no product photography
 * in this catalogue — the measurements it was built from carry brand, model,
 * form and rig and nothing else — and an invented picture of real hardware is
 * the one thing this project will not do. What it does have is the curve the
 * recommendation was actually computed from, which is a truer likeness of how
 * something sounds than a photograph of its shell would be.
 *
 * The path is real data, downsampled for drawing and nothing else. Whoever
 * measured it is credited wherever it appears, because they did the work.
 */
export function ResponseCurve({
  path,
  credit,
  className,
}: {
  /** An SVG path in a 180 x 72 box, log frequency against level. */
  path: string;
  /** Who measured it. Always shown. */
  credit?: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <svg
        viewBox="0 0 180 72"
        preserveAspectRatio="none"
        className="absolute inset-0 size-full"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="fd-response" x1="0" y1="0" x2="180" y2="0" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#FF815E" />
            <stop offset="0.42" stopColor="#E5BB82" />
            <stop offset="0.76" stopColor="#8BD5E7" />
            <stop offset="1" stopColor="#987CFF" />
          </linearGradient>
          <linearGradient id="fd-response-fill" x1="0" y1="0" x2="0" y2="72" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#FF815E" stopOpacity="0.16" />
            <stop offset="1" stopColor="#FF815E" stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* The decade rules, so the curve is read as a measurement and not as
            decoration. Unlabelled at this size: the shape is the point. */}
        {[0.25, 0.5, 0.75].map((at) => (
          <line
            key={at}
            x1={6 + at * 168}
            y1="4"
            x2={6 + at * 168}
            y2="68"
            stroke="rgb(255 255 255 / 0.05)"
            strokeWidth="0.5"
          />
        ))}
        <path d={`${path} L174,72 L6,72 Z`} fill="url(#fd-response-fill)" />
        <path
          d={path}
          fill="none"
          stroke="url(#fd-response)"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {credit && (
        <span className="absolute right-[6%] bottom-[5%] font-mono text-[5.5px] tracking-[0.1em] text-ink-faint/70 uppercase">
          {credit}
        </span>
      )}
    </div>
  );
}

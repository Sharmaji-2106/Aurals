"use client";

import type { MusicProfileData } from "@/lib/api/client";
import { BANDS, BAND_COLOR, type BandKey } from "@/lib/bands";
import { formatHz, formatSigned } from "@/lib/format";
import { motion } from "motion/react";

/** Nine vertical meters: how much each band's content departs from typical music. */
export function BandEmphasis({ bands }: { bands: MusicProfileData["bands"] }) {
  return (
    <div className="grid h-full grid-cols-9 gap-1.5 sm:gap-3">
      {bands.map((b, i) => {
        const color = BAND_COLOR[b.key as BandKey];
        const { median, p25, p75 } = b.emphasis;
        return (
          <div
            key={b.key}
            className="group flex flex-col items-center gap-2"
            title={`${b.label}: ${formatSigned(b.level_db.median)} dB vs midrange`}
          >
            <div className="relative h-44 w-full max-w-9 overflow-hidden rounded-full bg-white/[0.03]">
              <div className="absolute inset-x-0 top-1/2 h-px bg-white/15" />
              <div
                className="absolute inset-x-1 rounded-full opacity-25"
                style={{ bottom: `${p25 * 100}%`, top: `${(1 - p75) * 100}%`, background: color }}
              />
              <motion.div
                className="absolute inset-x-0 h-0.5"
                initial={{ bottom: "50%", opacity: 0 }}
                whileInView={{ bottom: `${median * 100}%`, opacity: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 1.1, delay: i * 0.05, ease: [0.16, 1, 0.3, 1] }}
                style={{ background: color, boxShadow: `0 0 12px 2px ${color}` }}
              />
            </div>
            <span className="text-center text-[10px] leading-tight whitespace-nowrap text-ink-muted">
              {BANDS.find((band) => band.key === b.key)?.short ?? b.label}
            </span>
            <span className="numeric text-[9px] whitespace-nowrap text-ink-faint">{formatHz(b.low_hz)}</span>
          </div>
        );
      })}
    </div>
  );
}

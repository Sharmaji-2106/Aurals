"use client";

import { EvidenceTag } from "@/components/profile/evidence-tag";
import type { Dimension } from "@/lib/api/client";
import { keyTraits } from "@/lib/evidence";
import { motion } from "motion/react";

/** The three or four characteristics that most define this sound, with what each rests on. */
export function KeyTraits({ dimensions }: { dimensions: Dimension[] }) {
  const traits = keyTraits(dimensions);
  if (!traits.length) {
    return (
      <p className="max-w-xl text-[15px] leading-relaxed text-ink-muted">
        Nothing stands out yet: your sound sits close to neutral across the board.
      </p>
    );
  }
  return (
    <ul className="grid grid-cols-1 border-t border-hairline sm:grid-cols-2 lg:grid-cols-4">
      {traits.map((t, i) => (
        <motion.li
          key={t.key}
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7, delay: i * 0.08, ease: [0.16, 1, 0.3, 1] }}
          className="border-b border-hairline py-6 sm:odd:pr-8 lg:border-b-0 lg:border-l lg:px-7 lg:first:border-l-0 lg:first:pl-0"
        >
          <p className="display text-[1.75rem] leading-[1.1] text-ink">{t.title}</p>
          <EvidenceTag basis={t.basis} className="mt-4" />
        </motion.li>
      ))}
    </ul>
  );
}

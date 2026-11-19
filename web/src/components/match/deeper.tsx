"use client";

import { DimensionMeter, MeterLegend } from "@/components/profile/dimension-meter";
import { KeyTraits } from "@/components/profile/key-traits";
import { MusicSection } from "@/components/profile/music-section";
import { ShapedBy } from "@/components/profile/shaped-by";
import { SoundPortrait } from "@/components/profile/sound-portrait";
import type { MusicProfile, SoundProfile } from "@/lib/api/client";
import { cn } from "@/lib/cn";
import { Plus } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState, type ReactNode } from "react";

/**
 * Everything the results screen knows but does not need to say first.
 *
 * These were four full-width sections stacked down `/profile`. They are the same
 * components, unchanged — only their placement moved. One opens at a time, so
 * the page never grows by more than the thing you asked to see.
 */

const GROUPS = [
  { key: "tonal", title: "Tonal balance" },
  { key: "character", title: "Character" },
  { key: "tolerance", title: "Sensitivity" },
  { key: "priority", title: "What matters to you" },
] as const;

export function Deeper({ sound, music }: { sound: SoundProfile; music: MusicProfile | null }) {
  const [open, setOpen] = useState<string | null>(null);
  const toggle = (key: string) => setOpen((current) => (current === key ? null : key));

  return (
    <div className="border-t border-hairline">
      <Panel
        id="line"
        index={1}
        open={open}
        onToggle={toggle}
        title="Your line, band by band"
        hint="The same curve the ranking is run against, and where each band came from."
      >
        <SoundPortrait sound={sound} music={music} />
      </Panel>

      <Panel
        id="dimensions"
        index={2}
        open={open}
        onToggle={toggle}
        title="Every dimension, and what it rests on"
        hint="Where your music and your answers pointed, and where each of the eleven landed."
      >
        <KeyTraits dimensions={sound.data.dimensions} />
        <div className="mt-8">
          <MeterLegend />
        </div>
        <div className="mt-6 grid grid-cols-1 gap-x-16 gap-y-8 md:grid-cols-2">
          {GROUPS.map((group) => {
            const dims = sound.data.dimensions.filter((d) => d.group === group.key);
            if (!dims.length) return null;
            return (
              <div key={group.key} className={group.key === "tonal" ? "md:row-span-3" : undefined}>
                <h4 className="eyebrow mb-1">{group.title}</h4>
                {dims.map((d, i) => (
                  <DimensionMeter key={d.key} dimension={d} index={i} />
                ))}
              </div>
            );
          })}
        </div>
      </Panel>

      <Panel
        id="shaped"
        index={3}
        open={open}
        onToggle={toggle}
        title="What shaped it"
        hint={
          music && sound.data.sources.questionnaire
            ? "Your music drew it; your answers refined it."
            : music
              ? "Drawn from what you play."
              : "Drawn from what you told us."
        }
      >
        <ShapedBy sound={sound} music={music} />
      </Panel>

      {music && (
        <Panel
          id="music"
          index={4}
          open={open}
          onToggle={toggle}
          title="Your music"
          hint="The songs this was measured from, and where they sit."
        >
          <MusicSection music={music} />
        </Panel>
      )}
    </div>
  );
}

function Panel({
  id,
  index,
  open,
  onToggle,
  title,
  hint,
  children,
}: {
  id: string;
  index: number;
  open: string | null;
  onToggle: (id: string) => void;
  title: string;
  hint: string;
  children: ReactNode;
}) {
  const on = open === id;
  return (
    <div className="border-b border-hairline">
      <button
        type="button"
        onClick={() => onToggle(id)}
        aria-expanded={on}
        className="group grid w-full grid-cols-[2.5rem_minmax(0,1fr)_auto] items-baseline gap-x-4 py-7 text-left sm:grid-cols-[4rem_minmax(0,1fr)_auto]"
      >
        <span
          className={cn("folio transition-colors duration-500 group-hover:text-ember", on && "text-ember")}
        >
          0{index}
        </span>
        <span className="min-w-0">
          <span className="display block text-[clamp(1.5rem,2.6vw,2.25rem)] leading-[1.05] text-ink">
            {title}
          </span>
          <span className="mt-2 block text-[13px] text-ink-faint">{hint}</span>
        </span>
        <Plus
          className={cn(
            "size-5 shrink-0 self-center text-ink-muted transition-transform duration-700 ease-(--ease-out-expo) group-hover:text-ink",
            on && "rotate-45",
          )}
        />
      </button>
      <AnimatePresence initial={false}>
        {on && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="pb-12 sm:pl-[5rem]">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

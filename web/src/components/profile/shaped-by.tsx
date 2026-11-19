"use client";

import { SAID_COLOR } from "@/components/signature/stage";
import { ButtonLink } from "@/components/ui/button";
import type { MusicProfile, SoundProfile } from "@/lib/api/client";
import { useLatestAnswers } from "@/lib/api/hooks";
import { BAND_COLOR } from "@/lib/bands";
import { refinements, type Refinement } from "@/lib/evidence";
import { plural } from "@/lib/format";
import { musicCharacter } from "@/lib/portrait";
import { motion } from "motion/react";
import Link from "next/link";

const GROUP_COLOR: Record<string, string> = {
  bass: BAND_COLOR.mid_bass,
  body: BAND_COLOR.lower_mids,
  vocals: BAND_COLOR.upper_mids,
  treble: BAND_COLOR.lower_treble,
  air: BAND_COLOR.air,
};

const VALUES: Record<string, string> = { detail: "detail", soundstage: "space", naturalness: "realism" };

const list = (items: string[]) =>
  items.length > 1 ? `${items.slice(0, -1).join(", ")} and ${items.at(-1)}` : (items[0] ?? "");

/**
 * The two sources side by side: the music as the foundation, the answers as the
 * refinement, region by region. No shares or percentages: the relation is shown.
 */
export function ShapedBy({ sound, music }: { sound: SoundProfile; music: MusicProfile | null }) {
  const latest = useLatestAnswers();
  const answers = latest.data?.answers ?? {};
  const skipped = Object.values(answers).filter((v) => v === null).length;
  const data = sound.data;
  const rows = refinements(data.preference_curve, data.layers.music, data.layers.answers);
  const musicBands = (data.layers.music ?? []).filter((c) => !c.reference);
  const strong = musicBands.filter((c) => c.basis.music === "strong");
  const weak = musicBands.filter((c) => c.basis.music === "limited" || c.basis.music === "none");
  const onlyYou = data.dimensions.filter((d) => !d.measurable_from_music && d.basis.answers !== "none");
  const answered = data.sources.questionnaire;

  const suggestions: { label: string; href: string }[] = [];
  if (!music || music.track_count < 20) suggestions.push({ label: "Add more music", href: "/music" });
  if (music && (!answered || skipped > 0)) {
    suggestions.push({
      label: skipped && answered ? `Answer the ${plural(skipped, "skipped question")}` : "Refine it",
      href: "/tune",
    });
  }
  if (music && weak.some((c) => c.band === "air" || c.band === "upper_treble")) {
    suggestions.push({ label: "Add well-recorded, full-range music", href: "/music" });
  }

  const evidence = !musicBands.length
    ? ""
    : strong.length === musicBands.length
      ? "The evidence is strong across the whole spectrum."
      : `The evidence is strong in ${strong.length} of ${musicBands.length} bands${
          weak.length
            ? `; ${list(weak.map((c) => c.label.toLowerCase()))} ${weak.length > 1 ? "are" : "is"} still limited`
            : ""
        }.`;

  return (
    <div className="grid grid-cols-1 gap-16 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-24">
      <div>
        <p className="eyebrow">Your music · the foundation</p>
        {music ? (
          <>
            <p className="display mt-5 text-6xl">{music.track_count}</p>
            <p className="mt-1 text-[13px] text-ink-faint">
              songs measured
              {music.data.clusters.length > 1 ? ` · ${music.data.clusters.length} sonic groups` : ""}
            </p>
            <p className="mt-5 max-w-md text-[15px] leading-relaxed text-ink-muted">
              {musicCharacter(music.data.descriptors)} It sets the shape of your sound. {evidence}
            </p>
            <Link
              href="#music"
              className="mt-4 inline-block text-[13px] text-ink underline decoration-white/20 underline-offset-4 hover:decoration-white/60"
            >
              See the evidence
            </Link>
          </>
        ) : (
          <>
            <p className="display mt-5 text-6xl text-ink-faint">0</p>
            <p className="mt-5 max-w-md text-[15px] leading-relaxed text-ink-muted">
              No music yet, so your sound rests on your answers alone. What you actually play is the strongest
              evidence AURALS has.
            </p>
          </>
        )}
      </div>

      <div>
        <p className="eyebrow">Your answers · the refinement</p>
        {rows.length > 0 ? (
          <RefineTable rows={rows} />
        ) : answered ? (
          <p className="mt-5 max-w-lg text-[15px] leading-relaxed text-ink-muted">
            With no music to refine, your answers draw the curve directly. Add music and they&rsquo;ll refine
            what it shows instead.
          </p>
        ) : (
          <p className="mt-5 max-w-lg text-[15px] leading-relaxed text-ink-muted">
            Not refined yet: this is your music alone. A few questions can confirm or adjust it, and tell
            AURALS what music can&rsquo;t show, like how bright highs feel to you and what you value most.
          </p>
        )}
        {onlyYou.length > 0 && (
          <p className="mt-6 max-w-lg text-[13px] leading-relaxed text-ink-faint">
            Only you could tell us{" "}
            {list(
              [
                onlyYou.some((d) => d.key === "treble_tolerance") ? "how bright highs feel to you" : "",
                onlyYou.some((d) => VALUES[d.key])
                  ? `what you value (${list(onlyYou.filter((d) => VALUES[d.key]).map((d) => VALUES[d.key]))})`
                  : "",
              ].filter(Boolean),
            )}
            .{music ? " Music can’t show these." : ""}
          </p>
        )}
        {suggestions.length > 0 && (
          <div className="mt-6 flex flex-wrap gap-2">
            {suggestions.slice(0, 2).map((s) => (
              <ButtonLink key={s.label} href={s.href} size="sm" variant="secondary">
                {s.label}
              </ButtonLink>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function RefineTable({ rows }: { rows: Refinement[] }) {
  const limit = Math.max(3, ...rows.flatMap((r) => [r.music, r.said, r.final].map(Math.abs))) * 1.15;
  const at = (v: number) => `${50 + (v / limit) * 50}%`;
  const ease = [0.16, 1, 0.3, 1] as const;
  return (
    <div className="mt-5">
      <div className="grid grid-cols-[4.5rem_minmax(0,1fr)_minmax(0,9rem)] gap-4 pb-2 text-[11px] text-ink-faint">
        <span />
        <span className="flex justify-between">
          <span>less</span>
          <span>neutral</span>
          <span>more</span>
        </span>
        <span />
      </div>
      <ul className="border-t border-hairline">
        {rows.map((r, i) => {
          const low = Math.min(r.music, r.final);
          const high = Math.max(r.music, r.final);
          return (
            <li
              key={r.key}
              className="grid grid-cols-[4.5rem_minmax(0,1fr)_minmax(0,9rem)] items-center gap-4 border-b border-hairline py-3.5"
            >
              <span className="text-[14px] text-ink">{r.label}</span>
              <div className="relative h-5">
                <div className="absolute inset-x-0 top-1/2 h-px bg-white/10" />
                <div className="absolute top-1 left-1/2 h-3 w-px bg-white/20" />
                <motion.div
                  className="absolute top-1/2 h-[3px] -translate-y-1/2 rounded-full"
                  style={{ background: GROUP_COLOR[r.key], opacity: 0.45 }}
                  initial={{ left: "50%", width: 0 }}
                  whileInView={{ left: at(low), width: `${((high - low) / limit) * 50}%` }}
                  viewport={{ once: true }}
                  transition={{ duration: 1, delay: 0.2 + i * 0.06, ease }}
                />
                <motion.div
                  className="absolute top-0.5 h-4 w-[2px] -translate-x-1/2 bg-ink/70"
                  initial={{ left: "50%" }}
                  whileInView={{ left: at(r.music) }}
                  viewport={{ once: true }}
                  transition={{ duration: 1, delay: i * 0.06, ease }}
                />
                <motion.div
                  className="absolute top-0.5 h-4 w-[2px] -translate-x-1/2"
                  style={{ background: SAID_COLOR }}
                  initial={{ left: "50%", opacity: 0 }}
                  whileInView={{ left: at(r.said), opacity: 0.85 }}
                  viewport={{ once: true }}
                  transition={{ duration: 1, delay: 0.1 + i * 0.06, ease }}
                />
                <motion.div
                  className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-canvas"
                  style={{ background: GROUP_COLOR[r.key] }}
                  initial={{ left: "50%" }}
                  whileInView={{ left: at(r.final) }}
                  viewport={{ once: true }}
                  transition={{ duration: 1.1, delay: 0.25 + i * 0.06, ease }}
                />
              </div>
              <span className="text-right text-[12px] text-ink-muted">{r.verdict}</span>
            </li>
          );
        })}
      </ul>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-[11px] text-ink-faint">
        <span className="flex items-center gap-2">
          <span className="h-3 w-[2px] bg-ink/70" /> your music suggests
        </span>
        <span className="flex items-center gap-2">
          <span className="h-3 w-[2px]" style={{ background: SAID_COLOR }} /> you said
        </span>
        <span className="flex items-center gap-2">
          <span className="size-2.5 rounded-full bg-band-mids" /> where it landed
        </span>
      </div>
    </div>
  );
}

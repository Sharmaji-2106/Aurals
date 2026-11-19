"use client";

import {
  SignatureStage,
  StageAxis,
  StageBand,
  StageLine,
  StageReference,
  StageScale,
} from "@/components/signature/stage";
import { ListenButton } from "@/components/listen/listening";
import { ProductArt, ProductArtCredit } from "@/components/results/product-art";
import { ButtonLink } from "@/components/ui/button";
import type { Recommendation, SoundProfile } from "@/lib/api/client";
import { cn } from "@/lib/cn";
import { formatSigned } from "@/lib/format";
import { DRIVER_LABEL } from "@/lib/use-cases";
import { ArrowRight } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

/**
 * One match, in full: the measured response against the listener's own target, the
 * numbers behind each region, and what the engine could not see.
 *
 * Two lines, kept apart on purpose. The spectral one is the listener's *inferred*
 * target — what the model thinks they want. The dotted one is the earphone's
 * *measured* deviation from the same reference, by someone else, on a named rig.
 * The gap between them is the whole argument, so the chart never merges them.
 */
const FIT_WORD: Record<string, string> = {
  within: "inside your range",
  above: "above your range",
  below: "below your range",
  unreliable: "not measured reliably here",
};

export function MatchDetail({
  recommendation: rec,
  sound,
  contexts,
  driverPreference,
  hasEvidence,
}: {
  recommendation: Recommendation;
  sound: SoundProfile;
  contexts: string[];
  driverPreference: string | null;
  hasEvidence: boolean;
}) {
  const curve = sound.data.preference_curve;
  const freqs = curve.map((c) => c.center_hz);
  const drivers = describeDrivers(rec.driver_config);
  const prediction = rec.predicted_preference;

  return (
    <div className="grid min-w-0 grid-cols-1 gap-x-14 gap-y-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="min-w-0">
        {rec.image && (
          <div className="mb-8">
            <div className="plinth relative aspect-[4/3] max-h-[22rem] overflow-hidden rounded-3xl">
              <ProductArt rec={rec} animate={false} />
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <ProductArtCredit rec={rec} />
              <ListenButton
                slug={rec.slug}
                label={`${rec.brand} ${rec.model}`}
                className="bg-white/[0.04] text-ink-muted shadow-[inset_0_0_0_1px_rgb(255_255_255/0.12)] hover:bg-white/[0.08] hover:text-ink"
              />
            </div>
          </div>
        )}
        <div className="relative h-80">
          <SignatureStage
            height="100%"
            domain={[-12, 12]}
            label={`Your target and the measured response of the ${rec.brand} ${rec.model}`}
          >
            <StageScale values={[8, -8]} />
            <StageReference value={0} label="reference" />
            <StageBand
              freqs={freqs}
              lower={curve.map((c) => c.low_db)}
              upper={curve.map((c) => c.high_db)}
              opacity={0.12}
              tension={0.7}
            />
            <StageLine series={{ freqs, values: curve.map((c) => c.offset_db) }} tension={0.7} width={2.5} />
            <StageLine
              key={rec.iem_id}
              series={{
                freqs: rec.bands.map((b) => b.center_hz),
                values: rec.bands.map((b) => b.measured_db),
              }}
              variant="measured"
              glow={false}
              tension={0.7}
            />
            <StageAxis />
          </SignatureStage>
        </div>
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-[11px] text-ink-faint">
          <span className="flex items-center gap-2">
            <span className="h-[3px] w-5 rounded-full bg-linear-to-r from-ember to-band-air" /> your target
            (inferred)
          </span>
          <span className="flex items-center gap-2">
            <span className="w-5 border-t-2 border-dotted border-ink/80" /> measured, by{" "}
            {rec.measurement.source}
          </span>
          <span className="ml-auto">dB relative to the reference target</span>
        </div>

        <table className="mt-8 w-full border-t border-hairline text-left">
          <caption className="sr-only">
            How the measured response compares with your target in each region
          </caption>
          <thead>
            <tr className="text-[11px] text-ink-faint">
              <th className="py-2 font-normal">Region</th>
              <th className="py-2 text-right font-normal">Your target</th>
              <th className="py-2 text-right font-normal">Measured vs you</th>
              <th className="py-2 pl-4 font-normal">Fit</th>
            </tr>
          </thead>
          <tbody>
            {rec.regions.map((region) => (
              <tr key={region.region} className="border-t border-hairline align-baseline">
                <td className="py-2.5 text-[13px] text-ink">
                  {region.label}
                  <span className="numeric ml-2 text-[11px] text-ink-faint">
                    {Math.round(region.low_hz)}–{Math.round(region.high_hz)} Hz
                  </span>
                </td>
                <td className="numeric py-2.5 text-right text-[13px] text-ink-muted">
                  {formatSigned(region.target_db)} dB
                </td>
                <td className="numeric py-2.5 text-right text-[13px] text-ink-muted">
                  {region.error_db == null ? "—" : `${formatSigned(region.error_db)} dB`}
                </td>
                <td
                  className={cn(
                    "py-2.5 pl-4 text-[12px]",
                    region.fit === "within"
                      ? "text-ok"
                      : region.fit === "unreliable"
                        ? "text-ink-faint"
                        : "text-warn",
                  )}
                >
                  {FIT_WORD[region.fit] ?? region.fit}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-[11px] text-ink-faint">
          &ldquo;Your target&rdquo; is what the model infers you want in that region; a region is inside your
          range when the measured deviation falls within the span your evidence allows.
        </p>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={rec.iem_id}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="min-w-0"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <p className="display text-[clamp(1.6rem,3vw,2.3rem)] text-ink">
              {rec.brand} {rec.model}
            </p>
            <p className="numeric text-[12px] text-ink-faint">
              rated {prediction.mean.toFixed(1)}{" "}
              <span className="text-ink-faint">
                (10–90%: {prediction.low.toFixed(1)}–{prediction.high.toFixed(1)})
              </span>
            </p>
          </div>
          <p className="mt-2 text-[12px] leading-relaxed text-ink-faint">
            The rating is the preference model&rsquo;s score against <em>your</em> target, averaged over how
            uncertain that target still is; the range is where it lands 8 times out of 10. Against the
            published reference target instead, the same model gives it{" "}
            <span className="numeric">{rec.population_preference.toFixed(1)}</span>.
          </p>

          {/* Why, region by region, from numbers the engine computed. */}

          <ul className="mt-7 flex flex-col gap-2.5">
            {rec.reasons.map((reason, i) => (
              <li key={i} className="flex gap-3 text-[13px] leading-relaxed">
                <span
                  className={cn(
                    "mt-2 size-1.5 shrink-0 rounded-full",
                    reason.kind === "match"
                      ? "bg-band-presence"
                      : reason.kind === "mismatch"
                        ? "bg-ember"
                        : "bg-white/25",
                  )}
                />
                <span className={reason.kind === "note" ? "text-ink-faint" : "text-ink-muted"}>
                  {reason.message}
                </span>
              </li>
            ))}
          </ul>

          {/* Everything that is beside the ranking rather than in it. */}
          <dl className="mt-8 grid grid-cols-1 gap-x-8 gap-y-3 border-t border-hairline pt-5 text-[12px] sm:grid-cols-2">
            <div>
              <dt className="text-ink-muted">Measured by</dt>
              <dd className="mt-0.5 leading-relaxed text-ink-faint">
                {rec.measurement.source}
                {rec.measurement.rig ? ` on a ${rec.measurement.rig}` : ""}
                {rec.measurement.variant ? `, ${rec.measurement.variant}` : ""}.
                {rec.measurement.converted_to &&
                  ` Converted to the reference rig from ${rec.measurement.conversion_pairs} earphones measured on both, so its range is wider.`}
              </dd>
            </div>
            <div>
              <dt className="text-ink-muted">Driver</dt>
              <dd className="mt-0.5 leading-relaxed text-ink-faint">
                {drivers}
                {driverPreference && driverPreference !== "none" ? (
                  <> You said you lean towards {DRIVER_LABEL[driverPreference]?.toLowerCase()}.</>
                ) : null}{" "}
                Driver type is metadata here, never a reason to rank one earphone above another.
              </dd>
            </div>
            <div>
              <dt className="text-ink-muted">Price</dt>
              <dd className="mt-0.5 leading-relaxed text-ink-faint">
                {rec.price
                  ? `${rec.price.amount} ${rec.price.currency}${rec.price.source ? ` (${rec.price.source})` : ""}`
                  : "No verified price is stored, so your budget was not applied."}
              </dd>
            </div>
            <div>
              <dt className="text-ink-muted">Where you listen</dt>
              <dd className="mt-0.5 leading-relaxed text-ink-faint">
                {contexts.length ? `${contexts.join(", ")}. ` : "Not set. "}
                Shown as context; it does not change this ranking.
              </dd>
            </div>
          </dl>

          {hasEvidence && (
            <div className="mt-8 flex flex-col gap-3 border-l border-ember/50 pl-5 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-[14px] text-ink-muted">
                People have written about this one, and they don&rsquo;t all agree.
              </p>
              <ButtonLink href={`/research/${rec.slug}`} size="sm" variant="secondary">
                Read the evidence <ArrowRight className="size-3.5" />
              </ButtonLink>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

/** Driver configuration in words, and plainly "unknown" when it is. */
function describeDrivers(config: Record<string, unknown> | null | undefined) {
  if (!config) return "Not recorded for this earphone.";
  const parts = Object.entries(config)
    .filter(([key, value]) => key !== "notes" && typeof value === "number" && value > 0)
    .map(([key, value]) => `${value} ${key.replaceAll("_", " ")}`);
  const kinds = Array.isArray(config.kinds)
    ? (config.kinds as string[]).map((k) => k.replaceAll("_", " "))
    : [];
  const source =
    config.source === "retailer-listing" && typeof config.source_url === "string"
      ? ` Read from the retailer's listing (${new URL(config.source_url).hostname.replace(/^www\./, "")}${
          typeof config.quote === "string" ? `: “${config.quote}”` : ""
        }).`
      : "";
  if (parts.length) return `${parts.join(", ")}.${source}`;
  if (kinds.length) return `${kinds.join(" + ")} (counts not stated).${source}`;
  return typeof config.notes === "string" ? config.notes : "Not recorded.";
}

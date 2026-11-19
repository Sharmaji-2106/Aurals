"use client";

import { IMAGES, INK, type BookFeature, type ImageId } from "@/components/book/edition";
import { SAMPLE_LISTENER } from "@/components/book/sample-listener";
import { motion } from "motion/react";

const EASE = [0.22, 1, 0.36, 1] as const;

/** Where every photograph and every printed fact came from. */
export function Sources({
  feature,
  missing,
  onClose,
}: {
  feature: BookFeature;
  missing: readonly ImageId[];
  onClose: () => void;
}) {
  return (
    <motion.div
      className="fixed inset-0 z-40 flex items-end justify-center bg-[#05060c]/60 p-3 backdrop-blur-sm sm:items-center sm:p-8"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label="Photographs and sources"
        className="max-h-[86vh] w-full max-w-2xl overflow-y-auto rounded-2xl p-6 text-[#1A2049] shadow-2xl sm:p-8"
        style={{ background: INK.ivory }}
        initial={{ y: 18 }}
        animate={{ y: 0 }}
        exit={{ y: 18 }}
        transition={{ duration: 0.4, ease: EASE }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-6">
          <div>
            <p className="font-sans text-[11px] tracking-[0.4em] text-[#9E7838] uppercase">Sources</p>
            <h3 className="font-book-serif mt-2 text-[34px] leading-none">Photographs and facts</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="font-sans text-[13px] underline underline-offset-4"
          >
            Close
          </button>
        </div>
        <p className="mt-4 font-sans text-[13px] leading-relaxed text-[#5D6079]">
          Every photograph is of the named earphone, from its manufacturer&apos;s product page where one
          exists, otherwise from a retailer&apos;s listing. They are used in a development prototype;
          permission for reuse has not been obtained. The facts under each photograph come from the page it
          was taken from. The cutout of {feature.brand} {feature.model} is a matte of the manufacturer&apos;s
          photograph, not a rendering, and it is the same image the catalogue shows on its product card.
        </p>
        <ul className="mt-5 divide-y divide-[#1A2049]/10 border-y border-[#1A2049]/10">
          {Object.values(IMAGES).map((image) => (
            <li key={image.id} className="grid gap-1 py-3 sm:grid-cols-[1fr_auto] sm:gap-4">
              <div>
                <p className="font-book-serif text-[19px] leading-tight">
                  {image.brand} {image.model}
                  {missing.includes(image.id) && (
                    <span className="ml-2 font-sans text-[11px] text-[#b04a3a]">
                      failed to load: shown as a placeholder
                    </span>
                  )}
                </p>
                <p className="mt-0.5 font-sans text-[11.5px] text-[#5D6079]">
                  {image.source.kind === "manufacturer" ? "Manufacturer" : "Retailer"}: {image.source.name}{" "}
                  &middot; retrieved {image.source.retrievedOn} &middot; {image.processing}
                </p>
              </div>
              <a
                href={image.source.pageUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="self-center font-sans text-[12px] underline underline-offset-4"
              >
                Source page
              </a>
            </li>
          ))}
        </ul>
        <p className="mt-4 font-sans text-[12px] leading-relaxed text-[#5D6079]">
          {feature.brand} {feature.model} specifications: {feature.factsSource.name},{" "}
          <a
            className="underline underline-offset-4"
            href={feature.factsSource.url}
            target="_blank"
            rel="noreferrer noopener"
          >
            {feature.factsSource.url.replace(/^https:\/\//, "")}
          </a>{" "}
          (retrieved {feature.factsSource.retrievedOn}).
          {feature.measurement &&
            ` Frequency response measured by ${feature.measurement.by} on a ${feature.measurement.rig}, via AutoEq.`}
          {feature.provenance === "demo" &&
            ` The rating, range and region-by-region fit are the engine's real output for a sample listener (the "Neon Odyssey" playlist, ${SAMPLE_LISTENER.tracksAnalysed} tracks, analysed ${SAMPLE_LISTENER.capturedOn}), not for you.`}
        </p>
      </motion.div>
    </motion.div>
  );
}

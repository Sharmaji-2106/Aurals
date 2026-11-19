"use client";

import type { Question } from "@/lib/api/client";
import { cn } from "@/lib/cn";
import { Check } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useId, useRef, type KeyboardEvent } from "react";

type Props = { question: Question; value: string | null | undefined; onChange: (v: string) => void };

/** Roving-focus radio group behaviour shared by both inputs. */
function useRovingKeys(
  options: Question["options"],
  value: string | null | undefined,
  onChange: (v: string) => void,
) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKeyDown = (event: KeyboardEvent) => {
    const index = Math.max(
      0,
      options.findIndex((o) => o.value === value),
    );
    const delta = ["ArrowRight", "ArrowDown"].includes(event.key)
      ? 1
      : ["ArrowLeft", "ArrowUp"].includes(event.key)
        ? -1
        : 0;
    if (!delta) return;
    event.preventDefault();
    const next = (index + delta + options.length) % options.length;
    onChange(options[next].value);
    refs.current[next]?.focus();
  };
  return { refs, onKeyDown };
}

/**
 * A five-position selector, built like a control on a piece of equipment: a
 * recessed track, a thumb that travels between detents, and a ramp above it
 * that fills as far as the stop you chose.
 */
export function ScaleInput({ question, value, onChange }: Props) {
  const { refs, onKeyDown } = useRovingKeys(question.options, value, onChange);
  const selected = question.options.find((o) => o.value === value);
  const count = question.options.length;
  const index = question.options.findIndex((o) => o.value === value);
  // How far along the control the chosen stop sits, at the centre of its detent.
  const reach = index < 0 ? 0 : ((index + 0.5) / count) * 100;
  return (
    <div>
      {/* The ramp over the control: less on the left, more on the right, lit
          as far as the chosen stop. */}
      <div className="relative mx-6 mb-3 h-3.5" aria-hidden="true">
        <div
          className="absolute inset-0 bg-white/[0.09]"
          style={{ clipPath: "polygon(0 100%, 100% 0, 100% 100%)" }}
        />
        <div
          className="absolute inset-0 bg-linear-to-r from-ember to-band-mids transition-[clip-path] duration-700 ease-(--ease-out-expo)"
          style={{
            clipPath: `polygon(0 100%, ${reach}% ${100 - reach}%, ${reach}% 100%)`,
          }}
        />
      </div>
      <div
        role="radiogroup"
        aria-label={question.prompt}
        onKeyDown={onKeyDown}
        className="well grid gap-1.5 rounded-full p-1.5"
        style={{ gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` }}
      >
        {question.options.map((option, i) => {
          const checked = option.value === value;
          return (
            <button
              key={option.value}
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              role="radio"
              aria-checked={checked}
              aria-label={option.label}
              tabIndex={checked || (!value && i === Math.floor(count / 2)) ? 0 : -1}
              onClick={() => onChange(option.value)}
              className="group relative flex h-14 items-center justify-center gap-2.5 rounded-full outline-offset-2 sm:h-16"
            >
              {checked && (
                <motion.span
                  layoutId={`scale-${question.id}`}
                  className="absolute inset-0 rounded-full bg-linear-to-b from-bone to-ink shadow-[inset_0_1px_0_rgb(255_255_255/0.9),0_8px_24px_-8px_rgb(255_190_150/0.5)]"
                  transition={{ type: "spring", stiffness: 420, damping: 34 }}
                />
              )}
              <span
                className={cn(
                  "numeric relative text-[13px] transition-colors duration-300",
                  checked ? "text-canvas" : "text-ink-faint group-hover:text-ink",
                )}
              >
                {i + 1}
              </span>
            </button>
          );
        })}
      </div>
      <div className="mt-3.5 flex items-start justify-between gap-4 px-3 text-[12px] text-ink-faint">
        <span>{question.low_label}</span>
        <span className="text-right">{question.high_label}</span>
      </div>
      <p className="mt-6 grid h-10 place-items-center text-center" aria-live="polite">
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={selected?.value ?? "none"}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.3 }}
            className={cn(
              selected ? "font-display text-[1.875rem] leading-none text-ink" : "text-[15px] text-ink-faint",
            )}
          >
            {selected?.label ?? "Choose a point on the scale"}
          </motion.span>
        </AnimatePresence>
      </p>
    </div>
  );
}

export function ChoiceInput({ question, value, onChange }: Props) {
  const { refs, onKeyDown } = useRovingKeys(question.options, value, onChange);
  const uid = useId();
  return (
    <div
      role="radiogroup"
      aria-label={question.prompt}
      onKeyDown={onKeyDown}
      className="grid grid-cols-1 gap-2.5 sm:grid-cols-2"
    >
      {question.options.map((option, i) => {
        const checked = option.value === value;
        return (
          <button
            key={option.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-labelledby={`${uid}-${i}-label`}
            aria-describedby={option.hint ? `${uid}-${i}-hint` : undefined}
            tabIndex={checked || (!value && i === 0) ? 0 : -1}
            onClick={() => onChange(option.value)}
            className={cn(
              "group relative flex items-start justify-between gap-4 overflow-hidden rounded-[1.25rem] p-5 text-left transition-[background-color,box-shadow,transform] duration-500 ease-(--ease-out-expo)",
              checked
                ? "bg-ember/[0.09] shadow-[inset_0_0_0_1px_rgb(255_107_61/0.6),0_18px_40px_-24px_rgb(255_107_61/0.7)]"
                : "bg-white/[0.025] shadow-[inset_0_1px_0_rgb(255_255_255/0.06),inset_0_0_0_1px_rgb(255_255_255/0.05)] hover:-translate-y-0.5 hover:bg-white/[0.05]",
            )}
          >
            <span className="flex gap-4">
              <span
                className={cn(
                  "numeric pt-1 text-[10px] tracking-[0.14em] transition-colors",
                  checked ? "text-ember" : "text-ink-faint",
                )}
              >
                0{i + 1}
              </span>
              <span>
                <span id={`${uid}-${i}-label`} className="block text-[16px] text-ink">
                  {option.label}
                </span>
                {option.hint && (
                  <span
                    id={`${uid}-${i}-hint`}
                    className="mt-1 block text-[13px] leading-relaxed text-ink-faint"
                  >
                    {option.hint}
                  </span>
                )}
              </span>
            </span>
            <span
              className={cn(
                "mt-0.5 grid size-5 shrink-0 place-items-center rounded-full transition-[background-color,box-shadow] duration-300",
                checked ? "bg-ember text-canvas" : "shadow-[inset_0_0_0_1px_rgb(255_255_255/0.2)]",
              )}
            >
              {checked && <Check className="size-3" strokeWidth={3} />}
            </span>
          </button>
        );
      })}
    </div>
  );
}

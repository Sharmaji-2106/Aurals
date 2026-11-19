import { NeonSign } from "@/components/site/neon-sign";
import Link from "next/link";

const COLUMNS = [
  {
    title: "The product",
    links: [
      { href: "/start", label: "Build a sound profile" },
      { href: "/#journey", label: "How it works" },
      { href: "/#bands", label: "The nine bands" },
    ],
  },
  {
    title: "The method",
    links: [
      { href: "/method", label: "What is measured" },
      { href: "/method", label: "Privacy and your data" },
    ],
  },
];

/**
 * The colophon, after dark. The name is the last thing on every page: the
 * drawn wordmark as a neon sign, lit as it comes into view.
 */
export function SiteFooter() {
  return (
    <footer className="relative mt-auto overflow-hidden">
      <div className="rule-horizon opacity-60" aria-hidden="true" />
      <div className="shell pt-16 sm:pt-20">
        <div className="grid grid-cols-2 gap-x-8 gap-y-12 md:grid-cols-[minmax(0,1.6fr)_repeat(2,minmax(0,1fr))]">
          <div className="col-span-2 max-w-sm md:col-span-1">
            <p className="marquee text-[2.2rem] text-ink">
              Beyond what <span className="text-sunset">you hear.</span>
            </p>
            <p className="mt-4 font-display text-[1.35rem] leading-[1.2] text-ink-muted">
              Personal audio intelligence, <em className="text-ember-soft">measured</em> rather than guessed.
            </p>
          </div>
          {COLUMNS.map((column) => (
            <nav key={column.title} aria-label={column.title}>
              <p className="eyebrow">{column.title}</p>
              <ul className="mt-5 flex flex-col gap-3">
                {column.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="link-draw pb-0.5 text-[14px] text-ink-muted transition-colors hover:text-ink"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
        <p className="mt-16 text-[12px] text-ink-faint">
          No email, no password. Audio is discarded after analysis.
        </p>
      </div>
      {/* The sign. Decorative: the page has already said its name. */}
      <div aria-hidden="true" className="shell pointer-events-none relative pt-6 pb-10 select-none">
        <div
          className="absolute inset-x-0 bottom-0 h-2/3"
          style={{
            background: "radial-gradient(60% 70% at 50% 100%, rgb(255 92 138 / 0.14), transparent 70%)",
          }}
        />
        <NeonSign className="mx-auto w-[min(100%,58rem)]" />
      </div>
    </footer>
  );
}

import { cn } from "@/lib/utils";

/**
 * TEXT wordmark, a stand-in until the company's real logo file (logo.jpeg on the
 * original site) is supplied. It is deliberately NOT a redrawn logo. Swap this one
 * component for the real asset and the whole site updates.
 */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("font-display text-[1.75rem] leading-none tracking-tight", className)}>
      Plants <em className="not-italic text-accent-ink">&amp;</em> Pure
    </span>
  );
}

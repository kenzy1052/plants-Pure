import { cn } from "@/lib/utils";
import logo from "@/assets/company/logo.jpg";

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center", className)}>
      <img
        src={logo}
        alt="Plants & Pure"
        className="h-10 w-20 rounded-full object-cover sm:h-11 sm:w-[5.5rem]"
      />
      <span className="sr-only">Plants &amp; Pure</span>
    </span>
  );
}

export function LeafMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" fill="none" className={className} aria-hidden>
      <path d="M24 42V20" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path
        d="M24 28c-8 0-14-5.6-14-13.6 8 0 14 5.6 14 13.6Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M24 34c7.2 0 12.4-4.8 12.4-12-7.2 0-12.4 4.8-12.4 12Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

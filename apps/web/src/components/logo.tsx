export function Logo({ className }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-2 font-semibold tracking-tight ${className ?? ""}`}
    >
      <svg viewBox="0 0 32 32" className="size-6" aria-hidden>
        <rect width="32" height="32" rx="8" fill="#3778FF" />
        <path
          d="M22.5 7.5c-6 .3-10.6 4.6-11.6 11l-1.4 6.6 1.6.4 1.1-3.6c4.9-.2 8.7-3.3 10.3-8.1-1.4.6-2.8.9-4.2 1 2.2-1.5 3.6-4 4.2-7.3Z"
          fill="#fff"
        />
      </svg>
      <span>Featherlog</span>
    </span>
  );
}

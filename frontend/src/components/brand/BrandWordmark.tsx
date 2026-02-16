import Link from "next/link";

interface BrandWordmarkProps {
  href?: string;
  subtitle?: string;
  compact?: boolean;
}

function Mark({ subtitle, compact }: { subtitle?: string; compact?: boolean }) {
  return (
    <div className="inline-flex items-center gap-3">
      <div
        className={`flex items-center justify-center border-2 border-black bg-[var(--secondary)] ${
          compact ? "h-8 w-8" : "h-10 w-10"
        } pixel-border-sm`}
      >
        <span
          className={`font-retro-display text-black ${
            compact ? "text-[8px]" : "text-[10px]"
          }`}
        >
          P
        </span>
      </div>
      <div className="leading-none">
        <div
          className={`font-retro-display text-white pixel-text-shadow ${
            compact ? "text-[9px]" : "text-[11px]"
          }`}
        >
          POKERSTARKS
        </div>
        {subtitle && (
          <div className="mt-1 font-retro-display text-[8px] text-[var(--secondary)]">
            {subtitle}
          </div>
        )}
      </div>
    </div>
  );
}

export default function BrandWordmark({
  href,
  subtitle,
  compact,
}: BrandWordmarkProps) {
  if (href) {
    return (
      <Link href={href} className="inline-flex">
        <Mark subtitle={subtitle} compact={compact} />
      </Link>
    );
  }

  return <Mark subtitle={subtitle} compact={compact} />;
}

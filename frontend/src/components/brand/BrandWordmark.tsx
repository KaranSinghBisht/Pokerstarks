import Link from "next/link";
import Image from "next/image";

interface BrandWordmarkProps {
  href?: string;
  subtitle?: string;
  compact?: boolean;
}

function Mark({ subtitle, compact }: { subtitle?: string; compact?: boolean }) {
  return (
    <div className="inline-flex items-center gap-2.5">
      <Image
        src="/logo.png"
        alt="Pokerstarks"
        width={compact ? 28 : 36}
        height={compact ? 28 : 36}
        className="drop-shadow-[0_0_6px_rgba(0,243,255,0.4)]"
        priority
      />
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

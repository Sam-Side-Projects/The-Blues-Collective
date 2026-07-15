/**
 * Placeholder crest — a plain royal-blue shield with "BC" initials.
 * Deliberately generic: this project must NOT use any official Chelsea
 * crest, badge, or kit design.
 */
export default function BrandMark({ size = 32 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label="The Blues Collective placeholder crest"
    >
      <path
        d="M32 4 L58 12 V32 C58 48 46 57 32 62 C18 57 6 48 6 32 V12 Z"
        fill="var(--brand)"
        stroke="var(--brand-dark)"
        strokeWidth="3"
      />
      <text
        x="32"
        y="40"
        textAnchor="middle"
        fontSize="22"
        fontWeight="700"
        fill="#ffffff"
        fontFamily="Arial, Helvetica, sans-serif"
      >
        BC
      </text>
    </svg>
  );
}

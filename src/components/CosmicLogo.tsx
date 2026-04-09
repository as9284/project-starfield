interface CosmicLogoProps {
  size?: number;
  className?: string;
}

export function CosmicLogo({ size = 48, className }: CosmicLogoProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 256 256"
      width={size}
      height={size}
      fill="none"
      className={className}
    >
      <circle
        cx="128"
        cy="128"
        r="70"
        fill="url(#logo-nebula)"
        opacity="0.35"
      />
      <circle cx="128" cy="128" r="50" fill="url(#logo-inner)" opacity="0.5" />

      <ellipse
        cx="128"
        cy="128"
        rx="88"
        ry="34"
        stroke="url(#logo-ring-a)"
        strokeWidth="1.2"
        fill="none"
        opacity="0.5"
        transform="rotate(-25 128 128)"
      />
      <ellipse
        cx="128"
        cy="128"
        rx="70"
        ry="70"
        stroke="url(#logo-ring-b)"
        strokeWidth="0.8"
        fill="none"
        opacity="0.3"
      />
      <ellipse
        cx="128"
        cy="128"
        rx="78"
        ry="28"
        stroke="url(#logo-ring-c)"
        strokeWidth="1"
        fill="none"
        opacity="0.45"
        transform="rotate(35 128 128)"
      />

      <circle cx="128" cy="128" r="22" fill="url(#logo-portal)" opacity="0.9" />
      <circle
        cx="128"
        cy="128"
        r="14"
        fill="url(#logo-portal-inner)"
        opacity="0.95"
      />
      <circle cx="128" cy="128" r="5" fill="white" opacity="0.97" />

      <circle cx="62" cy="107" r="3" fill="#c4b5fd" opacity="0.85" />
      <circle cx="194" cy="149" r="2.5" fill="#9b78f8" opacity="0.75" />
      <circle cx="155" cy="60" r="2" fill="#d946ef" opacity="0.6" />

      <defs>
        <radialGradient id="logo-nebula" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#7c4ff0" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#08081a" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="logo-inner" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#d946ef" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#5028c8" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="logo-portal" cx="50%" cy="45%" r="55%">
          <stop offset="0%" stopColor="#bba9fb" />
          <stop offset="100%" stopColor="#3d1ca3" />
        </radialGradient>
        <radialGradient id="logo-portal-inner" cx="50%" cy="45%" r="50%">
          <stop offset="0%" stopColor="#ece9fe" />
          <stop offset="100%" stopColor="#5028c8" />
        </radialGradient>
        <linearGradient id="logo-ring-a" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#7c4ff0" />
          <stop offset="50%" stopColor="#d946ef" />
          <stop offset="100%" stopColor="#6366f1" />
        </linearGradient>
        <linearGradient id="logo-ring-b" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#5028c8" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#d946ef" stopOpacity="0.2" />
        </linearGradient>
        <linearGradient id="logo-ring-c" x1="100%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#d946ef" />
          <stop offset="100%" stopColor="#6366f1" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export function CosmicLogoMini({ size = 16, className }: CosmicLogoProps) {
  return <CosmicLogo size={size} className={className} />;
}

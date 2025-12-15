export function GraphRAGIcon() {
  return (
    <svg
      width="100%"
      height="100%"
      viewBox="0 0 200 200"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <radialGradient
          id="glow"
          cx="0"
          cy="0"
          r="1"
          gradientUnits="userSpaceOnUse"
          gradientTransform="translate(100 100) rotate(90) scale(60)"
        >
          <stop stop-color="#FFB86F" stop-opacity="0.3" />
          <stop offset="1" stop-color="#FFB86F" stop-opacity="0" />
        </radialGradient>
        <filter id="blur" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="2" />
        </filter>
      </defs>

      {/* Background Glow */}
      <circle cx="100" cy="100" r="60" fill="url(#glow)" />

      {/* Connections */}
      <g stroke="#FFB86F" stroke-width="1.5" stroke-opacity="0.4">
        <line x1="100" y1="100" x2="60" y2="60" />
        <line x1="100" y1="100" x2="140" y2="60" />
        <line x1="100" y1="100" x2="60" y2="140" />
        <line x1="100" y1="100" x2="140" y2="140" />
        <line x1="100" y1="100" x2="100" y2="40" />
        <line x1="100" y1="100" x2="160" y2="100" />
        <line x1="60" y1="60" x2="100" y2="40" />
        <line x1="140" y1="60" x2="160" y2="100" />
      </g>

      {/* Nodes */}
      <g fill="#0a0908" stroke="#FFB86F" stroke-width="2">
        <circle cx="100" cy="100" r="12" stroke-width="3" />
        <circle cx="60" cy="60" r="6" />
        <circle cx="140" cy="60" r="6" />
        <circle cx="60" cy="140" r="6" />
        <circle cx="140" cy="140" r="6" />
        <circle cx="100" cy="40" r="6" />
        <circle cx="160" cy="100" r="6" />
      </g>

      {/* Inner dots */}
      <circle cx="100" cy="100" r="4" fill="#FFB86F" />
    </svg>
  );
}

export function DAGIcon() {
  return (
    <svg
      width="100%"
      height="100%"
      viewBox="0 0 200 200"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="flow" x1="0" y1="100" x2="200" y2="100" gradientUnits="userSpaceOnUse">
          <stop stop-color="#FFB86F" stop-opacity="0.1" />
          <stop offset="0.5" stop-color="#FFB86F" stop-opacity="0.8" />
          <stop offset="1" stop-color="#FFB86F" stop-opacity="0.1" />
        </linearGradient>
      </defs>

      {/* Flow Lines */}
      <path
        d="M40 100 C 70 100, 70 60, 100 60 C 130 60, 130 100, 160 100"
        stroke="url(#flow)"
        stroke-width="2"
        fill="none"
      />
      <path
        d="M40 100 C 70 100, 70 140, 100 140 C 130 140, 130 100, 160 100"
        stroke="url(#flow)"
        stroke-width="2"
        fill="none"
      />
      <path
        d="M40 100 L 160 100"
        stroke="url(#flow)"
        stroke-width="2"
        stroke-dasharray="4 4"
        fill="none"
        opacity="0.5"
      />

      {/* Nodes */}
      <g fill="#0a0908" stroke="#FFB86F" stroke-width="2">
        <rect x="30" y="90" width="20" height="20" rx="4" />
        <rect x="90" y="50" width="20" height="20" rx="4" />
        <rect x="90" y="130" width="20" height="20" rx="4" />
        <rect x="150" y="90" width="20" height="20" rx="4" />
      </g>

      {/* Active Indicators */}
      <circle cx="100" cy="60" r="3" fill="#FFB86F" />
      <circle cx="100" cy="140" r="3" fill="#FFB86F" />
    </svg>
  );
}

export function SandboxIcon() {
  return (
    <svg
      width="100%"
      height="100%"
      viewBox="0 0 200 200"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Hexagon Container */}
      <path
        d="M100 30 L 160.6 65 V 135 L 100 170 L 39.4 135 V 65 L 100 30 Z"
        stroke="#FFB86F"
        stroke-width="2"
        fill="#FFB86F"
        fill-opacity="0.05"
      />

      {/* Inner Shield/Lock Shape */}
      <path
        d="M100 60 L 140 80 V 110 C 140 135 125 150 100 160 C 75 150 60 135 60 110 V 80 L 100 60 Z"
        stroke="#FFB86F"
        stroke-width="2"
        fill="#0a0908"
      />

      {/* Code Symbol */}
      <path
        d="M85 100 L 75 110 L 85 120 M 115 100 L 125 110 L 115 120 M 95 125 L 105 95"
        stroke="#FFB86F"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      />

      {/* Corner Accents */}
      <circle cx="100" cy="30" r="2" fill="#FFB86F" />
      <circle cx="160.6" cy="65" r="2" fill="#FFB86F" />
      <circle cx="160.6" cy="135" r="2" fill="#FFB86F" />
      <circle cx="100" cy="170" r="2" fill="#FFB86F" />
      <circle cx="39.4" cy="135" r="2" fill="#FFB86F" />
      <circle cx="39.4" cy="65" r="2" fill="#FFB86F" />
    </svg>
  );
}

export function PatternIcon() {
  return (
    <svg
      width="100%"
      height="100%"
      viewBox="0 0 200 200"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Grid Background */}
      <g fill="#FFB86F" fill-opacity="0.2">
        {Array.from({ length: 5 }).map((_, i) => (
          Array.from({ length: 5 }).map((_, j) => (
            <circle cx={60 + i * 20} cy={60 + j * 20} r="1.5" />
          ))
        ))}
      </g>

      {/* Highlighted Pattern (L shape) */}
      <path d="M80 80 L 80 120 L 120 120" stroke="#FFB86F" stroke-width="2" fill="none" />

      {/* Connecting Lines for Pattern */}
      <g stroke="#FFB86F" stroke-width="1" stroke-opacity="0.5">
        <line x1="80" y1="80" x2="100" y2="100" />
        <line x1="100" y1="100" x2="120" y2="120" />
      </g>

      {/* Active Nodes */}
      <circle cx="80" cy="80" r="4" fill="#FFB86F" />
      <circle cx="80" cy="100" r="4" fill="#FFB86F" />
      <circle cx="80" cy="120" r="4" fill="#FFB86F" />
      <circle cx="100" cy="120" r="4" fill="#FFB86F" />
      <circle cx="120" cy="120" r="4" fill="#FFB86F" />

      {/* Scan Line */}
      <rect x="50" y="50" width="100" height="2" fill="#FFB86F" fill-opacity="0.5">
        <animate attributeName="y" from="50" to="150" dur="3s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0;1;0" dur="3s" repeatCount="indefinite" />
      </rect>
    </svg>
  );
}

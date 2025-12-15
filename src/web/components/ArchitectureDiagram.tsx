// @ts-nocheck
export default function ArchitectureDiagram() {
  return (
    <svg
      width="100%"
      height="100%"
      viewBox="0 0 800 400"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="flow-gradient" x1="0" y1="0" x2="1" y2="0">
          <stop stop-color="#FFB86F" stop-opacity="0.1" />
          <stop offset="0.5" stop-color="#FFB86F" stop-opacity="0.8" />
          <stop offset="1" stop-color="#FFB86F" stop-opacity="0.1" />
        </linearGradient>
        <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="3" />
        </filter>
      </defs>

      {/* --- LEFT: LLM / User --- */}
      <g transform="translate(50, 150)">
        <rect
          x="0"
          y="0"
          width="120"
          height="100"
          rx="12"
          fill="#1a1918"
          stroke="#FFB86F"
          stroke-width="2"
        />
        <text
          x="60"
          y="55"
          text-anchor="middle"
          fill="#f5f0ea"
          font-family="sans-serif"
          font-weight="bold"
          font-size="16"
        >
          LLM / User
        </text>

        {/* Output Connection */}
        <circle cx="120" cy="50" r="4" fill="#FFB86F" />
      </g>

      {/* --- CENTER: Gateway --- */}
      <g transform="translate(300, 100)">
        {/* Main Box */}
        <rect
          x="0"
          y="0"
          width="200"
          height="200"
          rx="16"
          fill="#12110f"
          stroke="#FFB86F"
          stroke-width="2"
          stroke-dasharray="8 8"
        />
        <text
          x="100"
          y="30"
          text-anchor="middle"
          fill="#FFB86F"
          font-family="sans-serif"
          font-weight="bold"
          font-size="14"
          letter-spacing="1"
        >
          CASYS INTELLIGENCE GATEWAY
        </text>

        {/* Internal Modules */}
        <rect
          x="30"
          y="60"
          width="140"
          height="30"
          rx="6"
          fill="#FFB86F"
          fill-opacity="0.1"
          stroke="#FFB86F"
          stroke-width="1"
        />
        <text
          x="100"
          y="80"
          text-anchor="middle"
          fill="#d5c3b5"
          font-family="sans-serif"
          font-size="12"
        >
          Security Sandbox
        </text>

        <rect
          x="30"
          y="100"
          width="140"
          height="30"
          rx="6"
          fill="#FFB86F"
          fill-opacity="0.1"
          stroke="#FFB86F"
          stroke-width="1"
        />
        <text
          x="100"
          y="120"
          text-anchor="middle"
          fill="#d5c3b5"
          font-family="sans-serif"
          font-size="12"
        >
          Memory (GraphRAG)
        </text>

        <rect
          x="30"
          y="140"
          width="140"
          height="30"
          rx="6"
          fill="#FFB86F"
          fill-opacity="0.1"
          stroke="#FFB86F"
          stroke-width="1"
        />
        <text
          x="100"
          y="160"
          text-anchor="middle"
          fill="#d5c3b5"
          font-family="sans-serif"
          font-size="12"
        >
          Router
        </text>

        {/* Input/Output Points */}
        <circle cx="0" cy="100" r="4" fill="#FFB86F" />
        <circle cx="200" cy="60" r="4" fill="#FFB86F" />
        <circle cx="200" cy="100" r="4" fill="#FFB86F" />
        <circle cx="200" cy="140" r="4" fill="#FFB86F" />
      </g>

      {/* --- RIGHT: MCP Servers --- */}
      <g transform="translate(630, 80)">
        {/* Server 1 */}
        <rect
          x="0"
          y="0"
          width="120"
          height="60"
          rx="8"
          fill="#1a1918"
          stroke="#FFB86F"
          stroke-width="1"
          stroke-opacity="0.5"
        />
        <text
          x="60"
          y="35"
          text-anchor="middle"
          fill="#d5c3b5"
          font-family="sans-serif"
          font-size="14"
        >
          Filesystem
        </text>
        <circle cx="0" cy="30" r="4" fill="#FFB86F" fill-opacity="0.5" />

        {/* Server 2 */}
        <rect
          x="0"
          y="90"
          width="120"
          height="60"
          rx="8"
          fill="#1a1918"
          stroke="#FFB86F"
          stroke-width="1"
          stroke-opacity="0.5"
        />
        <text
          x="60"
          y="125"
          text-anchor="middle"
          fill="#d5c3b5"
          font-family="sans-serif"
          font-size="14"
        >
          Postgres
        </text>
        <circle cx="0" cy="120" r="4" fill="#FFB86F" fill-opacity="0.5" />

        {/* Server 3 */}
        <rect
          x="0"
          y="180"
          width="120"
          height="60"
          rx="8"
          fill="#1a1918"
          stroke="#FFB86F"
          stroke-width="1"
          stroke-opacity="0.5"
        />
        <text
          x="60"
          y="215"
          text-anchor="middle"
          fill="#d5c3b5"
          font-family="sans-serif"
          font-size="14"
        >
          GitHub
        </text>
        <circle cx="0" cy="210" r="4" fill="#FFB86F" fill-opacity="0.5" />
      </g>

      {/* --- CONNECTIONS --- */}
      <g fill="none" stroke="#FFB86F" stroke-width="2">
        {/* User -> Gateway */}
        <path d="M170 200 L 300 200" stroke-opacity="0.3" />

        {/* Gateway -> Servers */}
        <path d="M500 160 C 565 160, 565 110, 630 110" stroke-opacity="0.3" />
        <path d="M500 200 L 630 200" stroke-opacity="0.3" />
        <path d="M500 240 C 565 240, 565 290, 630 290" stroke-opacity="0.3" />
      </g>

      {/* --- ANIMATED DATA FLOW --- */}
      {/* User -> Gateway */}
      <circle r="4" fill="#FFB86F">
        <animateMotion dur="2s" repeatCount="indefinite" path="M170 200 L 300 200" />
      </circle>

      {/* Gateway -> Servers */}
      <circle r="3" fill="#FFB86F">
        <animateMotion
          dur="2s"
          begin="0.5s"
          repeatCount="indefinite"
          path="M500 160 C 565 160, 565 110, 630 110"
        />
      </circle>
      <circle r="3" fill="#FFB86F">
        <animateMotion dur="2s" begin="0.7s" repeatCount="indefinite" path="M500 200 L 630 200" />
      </circle>
      <circle r="3" fill="#FFB86F">
        <animateMotion
          dur="2s"
          begin="0.9s"
          repeatCount="indefinite"
          path="M500 240 C 565 240, 565 290, 630 290"
        />
      </circle>
    </svg>
  );
}

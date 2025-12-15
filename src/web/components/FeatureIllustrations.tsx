// @ts-nocheck
export function GraphRAGIllustration() {
  return (
    <svg
      width="100%"
      height="100%"
      viewBox="0 0 400 300"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <radialGradient
          id="node-glow"
          cx="0"
          cy="0"
          r="1"
          gradientUnits="userSpaceOnUse"
          gradientTransform="translate(200 150) rotate(90) scale(120)"
        >
          <stop stop-color="#FFB86F" stop-opacity="0.2" />
          <stop offset="1" stop-color="#FFB86F" stop-opacity="0" />
        </radialGradient>
        <filter id="glow-filter" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="4" />
        </filter>
      </defs>

      {/* Background Glow */}
      <circle cx="200" cy="150" r="100" fill="url(#node-glow)" />

      {/* Network Connections */}
      <g stroke="#FFB86F" stroke-width="1" stroke-opacity="0.3">
        {/* Central Hub Connections */}
        <line x1="200" y1="150" x2="100" y2="80" />
        <line x1="200" y1="150" x2="300" y2="80" />
        <line x1="200" y1="150" x2="100" y2="220" />
        <line x1="200" y1="150" x2="300" y2="220" />
        <line x1="200" y1="150" x2="50" y2="150" />
        <line x1="200" y1="150" x2="350" y2="150" />

        {/* Secondary Connections */}
        <line x1="100" y1="80" x2="150" y2="40" />
        <line x1="300" y1="80" x2="250" y2="40" />
        <line x1="100" y1="220" x2="150" y2="260" />
        <line x1="300" y1="220" x2="250" y2="260" />
        <line x1="100" y1="80" x2="50" y2="150" />
        <line x1="300" y1="80" x2="350" y2="150" />
      </g>

      {/* Active Data Packets */}
      <circle cx="150" cy="115" r="3" fill="#FFB86F">
        <animate attributeName="cx" values="200;100" dur="2s" repeatCount="indefinite" />
        <animate attributeName="cy" values="150;80" dur="2s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="1;0" dur="2s" repeatCount="indefinite" />
      </circle>
      <circle cx="250" cy="185" r="3" fill="#FFB86F">
        <animate attributeName="cx" values="200;300" dur="2.5s" repeatCount="indefinite" />
        <animate attributeName="cy" values="150;220" dur="2.5s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="1;0" dur="2.5s" repeatCount="indefinite" />
      </circle>

      {/* Nodes */}
      <g fill="#141418" stroke="#FFB86F" stroke-width="2">
        {/* Center Node */}
        <circle cx="200" cy="150" r="20" stroke-width="4" />

        {/* Surrounding Nodes */}
        <circle cx="100" cy="80" r="10" />
        <circle cx="300" cy="80" r="10" />
        <circle cx="100" cy="220" r="10" />
        <circle cx="300" cy="220" r="10" />
        <circle cx="50" cy="150" r="8" />
        <circle cx="350" cy="150" r="8" />
        <circle cx="150" cy="40" r="6" />
        <circle cx="250" cy="40" r="6" />
        <circle cx="150" cy="260" r="6" />
        <circle cx="250" cy="260" r="6" />
      </g>

      {/* Node Centers */}
      <circle cx="200" cy="150" r="8" fill="#FFB86F" />
      <circle cx="100" cy="80" r="4" fill="#FFB86F" fill-opacity="0.6" />
      <circle cx="300" cy="80" r="4" fill="#FFB86F" fill-opacity="0.6" />
      <circle cx="100" cy="220" r="4" fill="#FFB86F" fill-opacity="0.6" />
      <circle cx="300" cy="220" r="4" fill="#FFB86F" fill-opacity="0.6" />
    </svg>
  );
}

export function DAGIllustration() {
  return (
    <svg
      width="100%"
      height="100%"
      viewBox="0 0 400 300"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient
          id="dag-flow"
          x1="0"
          y1="150"
          x2="400"
          y2="150"
          gradientUnits="userSpaceOnUse"
        >
          <stop stop-color="#FFB86F" stop-opacity="0.1" />
          <stop offset="0.5" stop-color="#FFB86F" stop-opacity="0.6" />
          <stop offset="1" stop-color="#FFB86F" stop-opacity="0.1" />
        </linearGradient>
      </defs>

      {/* Pipelines */}
      <path
        d="M50 150 C 100 150, 100 80, 150 80 L 250 80 C 300 80, 300 150, 350 150"
        stroke="url(#dag-flow)"
        stroke-width="4"
        fill="none"
      />
      <path
        d="M50 150 C 100 150, 100 220, 150 220 L 250 220 C 300 220, 300 150, 350 150"
        stroke="url(#dag-flow)"
        stroke-width="4"
        fill="none"
      />
      <path
        d="M50 150 L 350 150"
        stroke="url(#dag-flow)"
        stroke-width="2"
        stroke-dasharray="8 8"
        fill="none"
        opacity="0.3"
      />

      {/* Processing Blocks */}
      <g fill="#141418" stroke="#FFB86F" stroke-width="2">
        <rect x="130" y="60" width="40" height="40" rx="8" />
        <rect x="230" y="60" width="40" height="40" rx="8" />

        <rect x="130" y="200" width="40" height="40" rx="8" />
        <rect x="230" y="200" width="40" height="40" rx="8" />

        <rect x="30" y="130" width="40" height="40" rx="8" />
        <rect x="330" y="130" width="40" height="40" rx="8" />
      </g>

      {/* Status Indicators */}
      <circle cx="150" cy="80" r="6" fill="#FFB86F" />
      <circle cx="250" cy="80" r="6" fill="#FFB86F" />
      <circle cx="150" cy="220" r="6" fill="#FFB86F" />
      <circle cx="250" cy="220" r="6" fill="#FFB86F" />

      {/* Moving Data Particles */}
      <circle r="4" fill="#FFB86F">
        {/* @ts-ignore - path is valid SVG attribute */}
        <animateMotion
          dur="3s"
          repeatCount="indefinite"
          path="M50 150 C 100 150, 100 80, 150 80 L 250 80 C 300 80, 300 150, 350 150"
        />
      </circle>
      <circle r="4" fill="#FFB86F">
        {/* @ts-ignore - path is valid SVG attribute */}
        <animateMotion
          dur="3s"
          begin="1.5s"
          repeatCount="indefinite"
          path="M50 150 C 100 150, 100 220, 150 220 L 250 220 C 300 220, 300 150, 350 150"
        />
      </circle>
    </svg>
  );
}

export function SandboxIllustration() {
  return (
    <svg
      width="100%"
      height="100%"
      viewBox="0 0 400 300"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Isometric Cube/Container */}
      <g transform="translate(200 150)">
        {/* Back Faces */}
        <path
          d="M-80 -40 L 0 -80 L 80 -40 L 80 60 L 0 100 L -80 60 Z"
          fill="#FFB86F"
          fill-opacity="0.03"
          stroke="#FFB86F"
          stroke-width="1"
          stroke-dasharray="4 4"
        />

        {/* Inner Shield */}
        <path
          d="M0 -30 L 40 -10 V 30 L 0 50 L -40 30 V -10 Z"
          fill="#141418"
          stroke="#FFB86F"
          stroke-width="3"
        />

        {/* Code Symbol inside Shield */}
        <path
          d="M-15 10 L -25 20 L -15 30 M 15 10 L 25 20 L 15 30 M -5 35 L 5 5"
          stroke="#FFB86F"
          stroke-width="2"
          stroke-linecap="round"
        />

        {/* Outer Frame (Front) */}
        <path
          d="M-90 -45 L 0 -90 L 90 -45 L 90 65 L 0 110 L -90 65 Z"
          stroke="#FFB86F"
          stroke-width="2"
          fill="none"
        />

        {/* Scanning Effect */}
        <path d="M-90 0 L 0 -45 L 90 0 L 0 45 Z" fill="#FFB86F" fill-opacity="0.1">
          {/* @ts-ignore - valid SVG animation */}
          <animateTransform
            attributeName="transform"
            type="translate"
            values="0 -40; 0 60; 0 -40"
            dur="4s"
            repeatCount="indefinite"
          />
          {/* @ts-ignore - valid SVG animation */}
          <animate attributeName="opacity" values="0;0.5;0" dur="4s" repeatCount="indefinite" />
        </path>

        {/* Corner Accents */}
        <circle cx="-90" cy="-45" r="3" fill="#FFB86F" />
        <circle cx="0" cy="-90" r="3" fill="#FFB86F" />
        <circle cx="90" cy="-45" r="3" fill="#FFB86F" />
        <circle cx="90" cy="65" r="3" fill="#FFB86F" />
        <circle cx="0" cy="110" r="3" fill="#FFB86F" />
        <circle cx="-90" cy="65" r="3" fill="#FFB86F" />
      </g>
    </svg>
  );
}

export function SearchIllustration() {
  return (
    <svg
      width="100%"
      height="100%"
      viewBox="0 0 400 300"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="search-gradient" x1="0" y1="0" x2="1" y2="1">
          <stop stop-color="#FFB86F" stop-opacity="0.2" />
          <stop offset="1" stop-color="#FFB86F" stop-opacity="0" />
        </linearGradient>
      </defs>

      {/* Central Search Node */}
      <g transform="translate(200, 150)">
        <circle r="40" fill="url(#search-gradient)" stroke="#FFB86F" stroke-width="2" />
        <circle r="20" fill="#FFB86F" fill-opacity="0.2">
          {/* @ts-ignore */}
          <animate attributeName="r" values="20;25;20" dur="2s" repeatCount="indefinite" />
          {/* @ts-ignore */}
          <animate attributeName="opacity" values="0.2;0.5;0.2" dur="2s" repeatCount="indefinite" />
        </circle>

        {/* Search Icon / Magnifying Glass motif */}
        <path
          d="M-10 -10 L 10 10 M 5 -5 L 15 -15"
          stroke="#FFB86F"
          stroke-width="3"
          stroke-linecap="round"
        />
      </g>

      {/* Orbiting Result Nodes */}
      <g>
        <circle r="6" fill="#FFB86F">
          {/* @ts-ignore */}
          <animateMotion
            dur="4s"
            repeatCount="indefinite"
            path="M200 150 m-80 0 a 80 80 0 1 0 160 0 a 80 80 0 1 0 -160 0"
          />
        </circle>
        <circle r="4" fill="#FFB86F" fill-opacity="0.6">
          {/* @ts-ignore */}
          <animateMotion
            dur="6s"
            repeatCount="indefinite"
            path="M200 150 m-60 40 a 70 50 0 1 0 120 -80 a 70 50 0 1 0 -120 80"
          />
        </circle>
      </g>

      {/* Connecting Lines (Semantic Links) */}
      <path
        d="M120 150 L 280 150 M 200 70 L 200 230"
        stroke="#FFB86F"
        stroke-width="1"
        stroke-opacity="0.2"
        stroke-dasharray="4 4"
      />
    </svg>
  );
}

export function HILIllustration() {
  return (
    <svg
      width="100%"
      height="100%"
      viewBox="0 0 400 300"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient
          id="hil-glow"
          cx="0"
          cy="0"
          r="1"
          gradientUnits="userSpaceOnUse"
          gradientTransform="translate(200 150) scale(100)"
        >
          <stop stop-color="#FFB86F" stop-opacity="0.15" />
          <stop offset="1" stop-color="#FFB86F" stop-opacity="0" />
        </linearGradient>
      </defs>

      {/* Background glow */}
      <circle cx="200" cy="150" r="100" fill="url(#hil-glow)" />

      {/* Workflow line - paused */}
      <path d="M50 150 L 150 150" stroke="#FFB86F" stroke-width="3" stroke-opacity="0.4" />
      <path
        d="M250 150 L 350 150"
        stroke="#FFB86F"
        stroke-width="3"
        stroke-opacity="0.4"
        stroke-dasharray="8 4"
      />

      {/* Central Checkpoint Hexagon */}
      <g transform="translate(200, 150)">
        <polygon
          points="0,-50 43,-25 43,25 0,50 -43,25 -43,-25"
          fill="#141418"
          stroke="#FFB86F"
          stroke-width="3"
        />

        {/* Pulsing inner */}
        <polygon points="0,-35 30,-17 30,17 0,35 -30,17 -30,-17" fill="#FFB86F" fill-opacity="0.1">
          <animate
            attributeName="fill-opacity"
            values="0.1;0.3;0.1"
            dur="2s"
            repeatCount="indefinite"
          />
        </polygon>

        {/* Human icon */}
        <circle cx="0" cy="-8" r="8" fill="#FFB86F" />
        <path
          d="M-12 20 L 0 8 L 12 20"
          stroke="#FFB86F"
          stroke-width="3"
          fill="none"
          stroke-linecap="round"
        />
      </g>

      {/* Approve button */}
      <g transform="translate(130, 220)">
        <rect
          x="-30"
          y="-15"
          width="60"
          height="30"
          rx="6"
          fill="#141418"
          stroke="#4ade80"
          stroke-width="2"
        />
        <text
          x="0"
          y="5"
          text-anchor="middle"
          fill="#4ade80"
          font-family="sans-serif"
          font-size="12"
          font-weight="bold"
        >
          ✓ OK
        </text>
        <animate attributeName="opacity" values="1;0.6;1" dur="3s" repeatCount="indefinite" />
      </g>

      {/* Reject button */}
      <g transform="translate(270, 220)">
        <rect
          x="-30"
          y="-15"
          width="60"
          height="30"
          rx="6"
          fill="#141418"
          stroke="#f87171"
          stroke-width="2"
        />
        <text
          x="0"
          y="5"
          text-anchor="middle"
          fill="#f87171"
          font-family="sans-serif"
          font-size="12"
          font-weight="bold"
        >
          ✗ NO
        </text>
      </g>

      {/* Waiting indicator */}
      <g transform="translate(200, 80)">
        <circle r="4" fill="#FFB86F">
          <animate attributeName="r" values="3;5;3" dur="1.5s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="1;0.5;1" dur="1.5s" repeatCount="indefinite" />
        </circle>
        <text
          x="0"
          y="-15"
          text-anchor="middle"
          fill="#d5c3b5"
          font-family="sans-serif"
          font-size="10"
        >
          AWAITING
        </text>
      </g>
    </svg>
  );
}

export function ThreeLoopIllustration() {
  return (
    <svg
      width="100%"
      height="100%"
      viewBox="0 0 400 300"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="rack-grad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="#141418" />
          <stop offset="100%" stop-color="#1a1a20" />
        </linearGradient>
        <filter id="tech-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="2" />
        </filter>
        <marker id="arrow-down" markerWidth="8" markerHeight="8" refX="4" refY="7" orient="auto">
          <path d="M0,0 L4,8 L8,0 Z" fill="#FFB86F" />
        </marker>
        <marker id="arrow-up" markerWidth="8" markerHeight="8" refX="4" refY="1" orient="auto">
          <path d="M0,8 L4,0 L8,8 Z" fill="#FFB86F" />
        </marker>
        <pattern id="hex-grid" width="20" height="34.64" patternUnits="userSpaceOnUse">
          <path
            d="M10 0 L20 8.66 V25.98 L10 34.64 L0 25.98 V8.66 Z"
            fill="none"
            stroke="#FFB86F"
            stroke-width="0.5"
            opacity="0.05"
          />
        </pattern>
        <radialGradient id="core-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#FFB86F" stop-opacity="0.4" />
          <stop offset="100%" stop-color="#FFB86F" stop-opacity="0" />
        </radialGradient>
      </defs>

      {/* Background Grid */}
      <rect width="100%" height="100%" fill="url(#hex-grid)" />

      {/* Main Vertical Spine (Backbone) */}
      <rect x="198" y="40" width="4" height="220" fill="#FFB86F" fill-opacity="0.1" />

      {/* --- RACK UNITS (Vertical Stack) --- */}

      {/* 1. CAPABILITIES (Top) */}
      <g transform="translate(80 20)">
        <rect
          x="0"
          y="0"
          width="240"
          height="50"
          rx="4"
          fill="url(#rack-grad)"
          stroke="#FFB86F"
          stroke-width="1"
          stroke-opacity="0.6"
        />

        {/* Icon: Brain Core */}
        <g transform="translate(30 25)">
          <circle r="15" fill="url(#core-glow)" />
          <circle r="8" fill="#141418" stroke="#FFB86F" stroke-width="1.5" />
          <path
            d="M-6 -3 L 0 -8 L 6 -3 L 6 4 L 0 8 L -6 4 Z"
            stroke="#FFB86F"
            stroke-width="1"
            fill="none"
          />
          <circle r="1.5" fill="#fff">
            <animateMotion
              dur="3s"
              repeatCount="indefinite"
              path="M0 0 m-10 0 a 10 10 0 1 0 20 0 a 10 10 0 1 0 -20 0"
            />
          </circle>
        </g>

        <text
          x="60"
          y="30"
          fill="#FFB86F"
          font-size="10"
          font-family="monospace"
          font-weight="bold"
          letter-spacing="2"
        >
          CAPABILITIES
        </text>
        <text
          x="230"
          y="30"
          text-anchor="end"
          fill="#d5c3b5"
          font-size="8"
          font-family="monospace"
          opacity="0.7"
        >
          CONTEXT
        </text>

        {/* Status Lights */}
        <circle cx="230" cy="10" r="2" fill="#4ade80" opacity="0.8">
          <animate attributeName="opacity" values="0.4;1;0.4" dur="2s" repeatCount="indefinite" />
        </circle>
      </g>

      {/* Forward Flow Arrow 1 */}
      <line
        x1="200"
        y1="70"
        x2="200"
        y2="90"
        stroke="#FFB86F"
        stroke-width="2"
        marker-end="url(#arrow-down)"
        opacity="0.5"
      />
      <circle r="2" fill="#FFB86F">
        <animateMotion dur="1s" repeatCount="indefinite" path="M200 70 L 200 90" />
      </circle>

      {/* 2. PATTERNS */}
      <g transform="translate(80 90)">
        <rect
          x="0"
          y="0"
          width="240"
          height="50"
          rx="4"
          fill="url(#rack-grad)"
          stroke="#FFB86F"
          stroke-width="1"
          stroke-opacity="0.6"
        />

        {/* Icon: Matrix */}
        <g transform="translate(30 25)">
          <rect
            x="-10"
            y="-10"
            width="20"
            height="20"
            fill="none"
            stroke="#FFB86F"
            stroke-width="1"
            stroke-opacity="0.5"
          />
          <circle cx="-10" cy="-10" r="2" fill="#FFB86F" />
          <circle cx="10" cy="10" r="2" fill="#FFB86F" />
          <path d="M-10 -10 L 10 10" stroke="#FFB86F" stroke-width="1" />
        </g>

        <text
          x="60"
          y="30"
          fill="#FFB86F"
          font-size="10"
          font-family="monospace"
          font-weight="bold"
          letter-spacing="2"
        >
          PATTERNS
        </text>
        <text
          x="230"
          y="30"
          text-anchor="end"
          fill="#d5c3b5"
          font-size="8"
          font-family="monospace"
          opacity="0.7"
        >
          RULES
        </text>

        <circle cx="230" cy="10" r="2" fill="#FFB86F" opacity="0.8" />
      </g>

      {/* Forward Flow Arrow 2 */}
      <line
        x1="200"
        y1="140"
        x2="200"
        y2="160"
        stroke="#FFB86F"
        stroke-width="2"
        marker-end="url(#arrow-down)"
        opacity="0.5"
      />
      <circle r="2" fill="#FFB86F">
        <animateMotion dur="1s" begin="0.3s" repeatCount="indefinite" path="M200 140 L 200 160" />
      </circle>

      {/* 3. DAG */}
      <g transform="translate(80 160)">
        <rect
          x="0"
          y="0"
          width="240"
          height="50"
          rx="4"
          fill="url(#rack-grad)"
          stroke="#FFB86F"
          stroke-width="1"
          stroke-opacity="0.6"
        />

        {/* Icon: Graph */}
        <g transform="translate(30 25)">
          <circle cx="0" cy="-8" r="3" stroke="#FFB86F" stroke-width="1.5" />
          <circle cx="-8" cy="6" r="3" stroke="#FFB86F" stroke-width="1.5" />
          <circle cx="8" cy="6" r="3" stroke="#FFB86F" stroke-width="1.5" />
          <path d="M0 -5 L -8 3 M 0 -5 L 8 3" stroke="#FFB86F" stroke-width="1" />
        </g>

        <text
          x="60"
          y="30"
          fill="#FFB86F"
          font-size="10"
          font-family="monospace"
          font-weight="bold"
          letter-spacing="2"
        >
          DAG
        </text>
        <text
          x="230"
          y="30"
          text-anchor="end"
          fill="#d5c3b5"
          font-size="8"
          font-family="monospace"
          opacity="0.7"
        >
          PLAN
        </text>

        <circle cx="230" cy="10" r="2" fill="#FFB86F" opacity="0.8" />
      </g>

      {/* Forward Flow Arrow 3 */}
      <line
        x1="200"
        y1="210"
        x2="200"
        y2="230"
        stroke="#FFB86F"
        stroke-width="2"
        marker-end="url(#arrow-down)"
        opacity="0.5"
      />
      <circle r="2" fill="#FFB86F">
        <animateMotion dur="1s" begin="0.6s" repeatCount="indefinite" path="M200 210 L 200 230" />
      </circle>

      {/* 4. EXECUTION (Bottom) */}
      <g transform="translate(80 230)">
        <rect
          x="0"
          y="0"
          width="240"
          height="50"
          rx="4"
          fill="url(#rack-grad)"
          stroke="#FFB86F"
          stroke-width="1"
          stroke-opacity="0.6"
        />

        {/* Icon: Terminal */}
        <g transform="translate(30 25)">
          <rect x="-12" y="-8" width="24" height="16" rx="2" fill="#FFB86F" fill-opacity="0.2" />
          <text
            x="-8"
            y="4"
            fill="#FFB86F"
            font-size="8"
            font-family="monospace"
            font-weight="bold"
          >
            &gt;_
          </text>
        </g>

        <text
          x="60"
          y="30"
          fill="#FFB86F"
          font-size="10"
          font-family="monospace"
          font-weight="bold"
          letter-spacing="2"
        >
          EXECUTION
        </text>
        <text
          x="230"
          y="30"
          text-anchor="end"
          fill="#d5c3b5"
          font-size="8"
          font-family="monospace"
          opacity="0.7"
        >
          ACTION
        </text>

        {/* Blinking Activity */}
        <rect x="225" y="8" width="10" height="4" rx="1" fill="#FFB86F">
          <animate attributeName="opacity" values="0.2;1;0.2" dur="0.5s" repeatCount="indefinite" />
        </rect>
      </g>

      {/* --- FEEDBACK LOOPS (Right Side Returns) --- */}

      {/* Loop 1: Execution -> DAG (Feedback) */}
      <path
        d="M320 255 L 340 255 L 340 185 L 320 185"
        stroke="#FFB86F"
        stroke-width="1.5"
        stroke-dasharray="4 2"
        fill="none"
        opacity="0.6"
        marker-end="url(#arrow-up)"
      />
      <text
        x="345"
        y="225"
        fill="#FFB86F"
        font-size="7"
        font-family="monospace"
        opacity="0.6"
        transform="rotate(90 345 225)"
      >
        ADAPTATION
      </text>
      <circle r="2" fill="#FFB86F">
        <animateMotion
          dur="3s"
          repeatCount="indefinite"
          path="M320 255 L 340 255 L 340 185 L 320 185"
        />
      </circle>

      {/* Loop 2: Execution -> Patterns (Adaptation) */}
      <path
        d="M320 255 L 360 255 L 360 115 L 320 115"
        stroke="#FFB86F"
        stroke-width="1.5"
        stroke-dasharray="4 2"
        fill="none"
        opacity="0.5"
        marker-end="url(#arrow-up)"
      />
      <text
        x="365"
        y="190"
        fill="#FFB86F"
        font-size="7"
        font-family="monospace"
        opacity="0.5"
        transform="rotate(90 365 190)"
      >
        SPECULATION
      </text>
      <circle r="2" fill="#FFB86F">
        <animateMotion
          dur="5s"
          repeatCount="indefinite"
          path="M320 255 L 360 255 L 360 115 L 320 115"
        />
      </circle>

      {/* Loop 3: Execution -> Capabilities (Crystallization) */}
      <path
        d="M320 255 L 380 255 L 380 45 L 320 45"
        stroke="#FFB86F"
        stroke-width="1.5"
        stroke-dasharray="4 2"
        fill="none"
        opacity="0.4"
        marker-end="url(#arrow-up)"
      />
      <text
        x="385"
        y="160"
        fill="#FFB86F"
        font-size="7"
        font-family="monospace"
        opacity="0.4"
        transform="rotate(90 385 160)"
      >
        CRYSTALLIZATION
      </text>
      <circle r="2" fill="#FFB86F">
        <animateMotion
          dur="8s"
          repeatCount="indefinite"
          path="M320 255 L 380 255 L 380 45 L 320 45"
        />
      </circle>
    </svg>
  );
}

export function CapabilitiesIllustration() {
  return (
    <svg
      width="100%"
      height="100%"
      viewBox="0 0 400 300"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="crystal-gradient" x1="0" y1="0" x2="0" y2="1">
          <stop stop-color="#FFB86F" stop-opacity="0.4" />
          <stop offset="1" stop-color="#FFB86F" stop-opacity="0.1" />
        </linearGradient>
        <filter id="crystal-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="4" />
        </filter>
      </defs>

      {/* Code snippets floating (before crystallization) */}
      <g opacity="0.4">
        <text x="80" y="80" fill="#d5c3b5" font-family="monospace" font-size="10">
          await mcp.read()
        </text>
        <text x="250" y="60" fill="#d5c3b5" font-family="monospace" font-size="10">
          json.parse()
        </text>
        <text x="60" y="220" fill="#d5c3b5" font-family="monospace" font-size="10">
          github.issue()
        </text>
        <text x="280" y="240" fill="#d5c3b5" font-family="monospace" font-size="10">
          memory.store()
        </text>
      </g>

      {/* Animated particles moving toward center */}
      <circle r="3" fill="#FFB86F" fill-opacity="0.6">
        <animateMotion dur="3s" repeatCount="indefinite" path="M80 80 Q 140 120 200 150" />
        <animate attributeName="opacity" values="0.8;0" dur="3s" repeatCount="indefinite" />
      </circle>
      <circle r="3" fill="#FFB86F" fill-opacity="0.6">
        <animateMotion dur="3.5s" repeatCount="indefinite" path="M280 60 Q 240 100 200 150" />
        <animate attributeName="opacity" values="0.8;0" dur="3.5s" repeatCount="indefinite" />
      </circle>
      <circle r="3" fill="#FFB86F" fill-opacity="0.6">
        <animateMotion dur="4s" repeatCount="indefinite" path="M60 220 Q 130 180 200 150" />
        <animate attributeName="opacity" values="0.8;0" dur="4s" repeatCount="indefinite" />
      </circle>
      <circle r="3" fill="#FFB86F" fill-opacity="0.6">
        <animateMotion dur="3.8s" repeatCount="indefinite" path="M300 240 Q 250 190 200 150" />
        <animate attributeName="opacity" values="0.8;0" dur="3.8s" repeatCount="indefinite" />
      </circle>

      {/* Central Crystal (Capability) */}
      <g transform="translate(200, 150)">
        {/* Glow behind */}
        <polygon
          points="0,-50 30,-20 30,20 0,50 -30,20 -30,-20"
          fill="#FFB86F"
          fill-opacity="0.2"
          filter="url(#crystal-glow)"
        />

        {/* Crystal shape */}
        <polygon
          points="0,-50 30,-20 30,20 0,50 -30,20 -30,-20"
          fill="url(#crystal-gradient)"
          stroke="#FFB86F"
          stroke-width="2"
        />

        {/* Inner facets */}
        <line
          x1="0"
          y1="-50"
          x2="0"
          y2="50"
          stroke="#FFB86F"
          stroke-width="1"
          stroke-opacity="0.3"
        />
        <line
          x1="-30"
          y1="-20"
          x2="30"
          y2="20"
          stroke="#FFB86F"
          stroke-width="1"
          stroke-opacity="0.3"
        />
        <line
          x1="-30"
          y1="20"
          x2="30"
          y2="-20"
          stroke="#FFB86F"
          stroke-width="1"
          stroke-opacity="0.3"
        />

        {/* Sparkle */}
        <circle cx="10" cy="-25" r="3" fill="#fff" fill-opacity="0.8">
          <animate attributeName="opacity" values="0.8;0.2;0.8" dur="2s" repeatCount="indefinite" />
        </circle>

        {/* Pulsing core */}
        <circle cx="0" cy="0" r="8" fill="#FFB86F">
          <animate attributeName="r" values="6;10;6" dur="2s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="1;0.6;1" dur="2s" repeatCount="indefinite" />
        </circle>
      </g>
    </svg>
  );
}

export function HypergraphIllustration() {
  return (
    <svg
      width="100%"
      height="100%"
      viewBox="0 0 400 300"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="hyperedge-gradient" x1="0" y1="0" x2="1" y2="1">
          <stop stop-color="#8b5cf6" stop-opacity="0.3" />
          <stop offset="1" stop-color="#8b5cf6" stop-opacity="0.1" />
        </linearGradient>
      </defs>

      {/* Hyperedge 1 - Capability container (violet) */}
      <g transform="translate(120, 120)">
        <ellipse
          cx="0"
          cy="0"
          rx="80"
          ry="50"
          fill="url(#hyperedge-gradient)"
          stroke="#8b5cf6"
          stroke-width="2"
          stroke-dasharray="4 2"
        />

        {/* Tools inside hyperedge */}
        <circle cx="-40" cy="-10" r="15" fill="#141418" stroke="#FFB86F" stroke-width="2" />
        <text
          x="-40"
          y="-6"
          text-anchor="middle"
          fill="#FFB86F"
          font-family="monospace"
          font-size="8"
        >
          fs
        </text>

        <circle cx="10" cy="15" r="15" fill="#141418" stroke="#FFB86F" stroke-width="2" />
        <text
          x="10"
          y="19"
          text-anchor="middle"
          fill="#FFB86F"
          font-family="monospace"
          font-size="8"
        >
          json
        </text>

        <circle cx="40" cy="-15" r="15" fill="#141418" stroke="#FFB86F" stroke-width="2" />
        <text
          x="40"
          y="-11"
          text-anchor="middle"
          fill="#FFB86F"
          font-family="monospace"
          font-size="8"
        >
          gh
        </text>

        {/* Label */}
        <text
          x="0"
          y="60"
          text-anchor="middle"
          fill="#8b5cf6"
          font-family="sans-serif"
          font-size="10"
          font-weight="bold"
        >
          Cap: Create Issue
        </text>
      </g>

      {/* Hyperedge 2 */}
      <g transform="translate(280, 180)">
        <ellipse
          cx="0"
          cy="0"
          rx="60"
          ry="40"
          fill="url(#hyperedge-gradient)"
          stroke="#8b5cf6"
          stroke-width="2"
          stroke-dasharray="4 2"
        />

        <circle cx="-25" cy="0" r="12" fill="#141418" stroke="#FFB86F" stroke-width="2" />
        <text
          x="-25"
          y="4"
          text-anchor="middle"
          fill="#FFB86F"
          font-family="monospace"
          font-size="7"
        >
          fs
        </text>

        <circle cx="25" cy="0" r="12" fill="#141418" stroke="#FFB86F" stroke-width="2" />
        <text
          x="25"
          y="4"
          text-anchor="middle"
          fill="#FFB86F"
          font-family="monospace"
          font-size="7"
        >
          yaml
        </text>

        <text
          x="0"
          y="50"
          text-anchor="middle"
          fill="#8b5cf6"
          font-family="sans-serif"
          font-size="10"
          font-weight="bold"
        >
          Cap: Parse Config
        </text>
      </g>

      {/* Shared tool connection (fs is in both) */}
      <path
        d="M80 110 Q 180 140 220 180"
        stroke="#FFB86F"
        stroke-width="1"
        stroke-opacity="0.4"
        stroke-dasharray="4 4"
      />

      {/* Legend */}
      <g transform="translate(30, 250)">
        <circle cx="0" cy="0" r="6" fill="#141418" stroke="#FFB86F" stroke-width="1" />
        <text x="15" y="4" fill="#d5c3b5" font-family="sans-serif" font-size="9">= Tool</text>

        <ellipse
          cx="100"
          cy="0"
          rx="20"
          ry="10"
          fill="none"
          stroke="#8b5cf6"
          stroke-width="1"
          stroke-dasharray="2 1"
        />
        <text x="130" y="4" fill="#d5c3b5" font-family="sans-serif" font-size="9">
          = Capability (Hyperedge)
        </text>
      </g>

      {/* Title */}
      <text
        x="200"
        y="30"
        text-anchor="middle"
        fill="#8b5cf6"
        font-family="sans-serif"
        font-size="12"
        font-weight="bold"
      >
        N-ary Relationships
      </text>
    </svg>
  );
}

export function StructuralEmergenceIllustration() {
  return (
    <svg
      width="100%"
      height="100%"
      viewBox="0 0 400 300"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <radialGradient id="cas-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#FFB86F" stop-opacity="0.15" />
          <stop offset="100%" stop-color="#FFB86F" stop-opacity="0" />
        </radialGradient>
        <filter id="cas-blur" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="2" />
        </filter>
      </defs>

      {/* Ambient glow showing emergent structure zone */}
      <ellipse cx="200" cy="150" rx="140" ry="100" fill="url(#cas-glow)" />

      {/* Emergent connections - appear with delay animations */}
      <g stroke="#FFB86F" fill="none">
        {/* First wave of connections */}
        <path d="M80 100 Q 120 80 150 110" stroke-width="1.5" stroke-opacity="0">
          <animate
            attributeName="stroke-opacity"
            values="0;0.4;0.4"
            dur="4s"
            begin="0s"
            fill="freeze"
          />
        </path>
        <path d="M150 110 Q 180 130 200 100" stroke-width="1.5" stroke-opacity="0">
          <animate
            attributeName="stroke-opacity"
            values="0;0.5;0.5"
            dur="4s"
            begin="0.5s"
            fill="freeze"
          />
        </path>
        <path d="M200 100 Q 240 90 270 120" stroke-width="1.5" stroke-opacity="0">
          <animate
            attributeName="stroke-opacity"
            values="0;0.4;0.4"
            dur="4s"
            begin="1s"
            fill="freeze"
          />
        </path>

        {/* Second wave - more connections emerge */}
        <path d="M100 180 Q 140 160 150 110" stroke-width="1" stroke-opacity="0">
          <animate
            attributeName="stroke-opacity"
            values="0;0.3;0.3"
            dur="4s"
            begin="1.5s"
            fill="freeze"
          />
        </path>
        <path d="M150 110 Q 170 150 200 180" stroke-width="1.5" stroke-opacity="0">
          <animate
            attributeName="stroke-opacity"
            values="0;0.5;0.5"
            dur="4s"
            begin="2s"
            fill="freeze"
          />
        </path>
        <path d="M200 180 Q 230 160 270 120" stroke-width="1" stroke-opacity="0">
          <animate
            attributeName="stroke-opacity"
            values="0;0.3;0.3"
            dur="4s"
            begin="2.5s"
            fill="freeze"
          />
        </path>
        <path d="M270 120 Q 300 150 320 180" stroke-width="1.5" stroke-opacity="0">
          <animate
            attributeName="stroke-opacity"
            values="0;0.4;0.4"
            dur="4s"
            begin="3s"
            fill="freeze"
          />
        </path>

        {/* Third wave - structure solidifies */}
        <path
          d="M80 100 Q 90 140 100 180"
          stroke-width="1"
          stroke-opacity="0"
          stroke-dasharray="4 2"
        >
          <animate
            attributeName="stroke-opacity"
            values="0;0.25;0.25"
            dur="4s"
            begin="3.5s"
            fill="freeze"
          />
        </path>
        <path d="M200 100 Q 200 140 200 180" stroke-width="2" stroke-opacity="0">
          <animate
            attributeName="stroke-opacity"
            values="0;0.6;0.6"
            dur="4s"
            begin="4s"
            fill="freeze"
          />
        </path>
        <path
          d="M320 180 Q 290 200 250 210"
          stroke-width="1"
          stroke-opacity="0"
          stroke-dasharray="4 2"
        >
          <animate
            attributeName="stroke-opacity"
            values="0;0.25;0.25"
            dur="4s"
            begin="4.5s"
            fill="freeze"
          />
        </path>
      </g>

      {/* Autonomous agents (nodes) - each with independent pulse */}
      <g>
        {/* Agent 1 */}
        <circle cx="80" cy="100" r="12" fill="none" stroke="#FFB86F" stroke-width="1.5">
          <animate
            attributeName="stroke-opacity"
            values="0.3;0.8;0.3"
            dur="2.3s"
            repeatCount="indefinite"
          />
        </circle>
        <circle cx="80" cy="100" r="4" fill="#FFB86F" fill-opacity="0.8">
          <animate attributeName="r" values="3;5;3" dur="2.3s" repeatCount="indefinite" />
          <animate
            attributeName="fill-opacity"
            values="0.6;1;0.6"
            dur="2.3s"
            repeatCount="indefinite"
          />
        </circle>

        {/* Agent 2 */}
        <circle cx="150" cy="110" r="14" fill="none" stroke="#FFB86F" stroke-width="1.5">
          <animate
            attributeName="stroke-opacity"
            values="0.3;0.8;0.3"
            dur="1.8s"
            repeatCount="indefinite"
          />
        </circle>
        <circle cx="150" cy="110" r="5" fill="#FFB86F" fill-opacity="0.8">
          <animate attributeName="r" values="4;6;4" dur="1.8s" repeatCount="indefinite" />
          <animate
            attributeName="fill-opacity"
            values="0.6;1;0.6"
            dur="1.8s"
            repeatCount="indefinite"
          />
        </circle>

        {/* Agent 3 - Hub forming */}
        <circle cx="200" cy="100" r="16" fill="none" stroke="#FFB86F" stroke-width="2">
          <animate
            attributeName="stroke-opacity"
            values="0.5;1;0.5"
            dur="2s"
            repeatCount="indefinite"
          />
        </circle>
        <circle cx="200" cy="100" r="6" fill="#FFB86F">
          <animate attributeName="r" values="5;8;5" dur="2s" repeatCount="indefinite" />
          <animate
            attributeName="fill-opacity"
            values="0.7;1;0.7"
            dur="2s"
            repeatCount="indefinite"
          />
        </circle>

        {/* Agent 4 */}
        <circle cx="270" cy="120" r="13" fill="none" stroke="#FFB86F" stroke-width="1.5">
          <animate
            attributeName="stroke-opacity"
            values="0.3;0.8;0.3"
            dur="2.5s"
            repeatCount="indefinite"
          />
        </circle>
        <circle cx="270" cy="120" r="4" fill="#FFB86F" fill-opacity="0.8">
          <animate attributeName="r" values="3;5;3" dur="2.5s" repeatCount="indefinite" />
          <animate
            attributeName="fill-opacity"
            values="0.6;1;0.6"
            dur="2.5s"
            repeatCount="indefinite"
          />
        </circle>

        {/* Agent 5 */}
        <circle cx="100" cy="180" r="11" fill="none" stroke="#FFB86F" stroke-width="1.5">
          <animate
            attributeName="stroke-opacity"
            values="0.3;0.8;0.3"
            dur="2.1s"
            repeatCount="indefinite"
          />
        </circle>
        <circle cx="100" cy="180" r="4" fill="#FFB86F" fill-opacity="0.8">
          <animate attributeName="r" values="3;5;3" dur="2.1s" repeatCount="indefinite" />
          <animate
            attributeName="fill-opacity"
            values="0.6;1;0.6"
            dur="2.1s"
            repeatCount="indefinite"
          />
        </circle>

        {/* Agent 6 - Another hub forming */}
        <circle cx="200" cy="180" r="15" fill="none" stroke="#FFB86F" stroke-width="2">
          <animate
            attributeName="stroke-opacity"
            values="0.5;1;0.5"
            dur="1.9s"
            repeatCount="indefinite"
          />
        </circle>
        <circle cx="200" cy="180" r="5" fill="#FFB86F">
          <animate attributeName="r" values="4;7;4" dur="1.9s" repeatCount="indefinite" />
          <animate
            attributeName="fill-opacity"
            values="0.7;1;0.7"
            dur="1.9s"
            repeatCount="indefinite"
          />
        </circle>

        {/* Agent 7 */}
        <circle cx="320" cy="180" r="12" fill="none" stroke="#FFB86F" stroke-width="1.5">
          <animate
            attributeName="stroke-opacity"
            values="0.3;0.8;0.3"
            dur="2.4s"
            repeatCount="indefinite"
          />
        </circle>
        <circle cx="320" cy="180" r="4" fill="#FFB86F" fill-opacity="0.8">
          <animate attributeName="r" values="3;5;3" dur="2.4s" repeatCount="indefinite" />
          <animate
            attributeName="fill-opacity"
            values="0.6;1;0.6"
            dur="2.4s"
            repeatCount="indefinite"
          />
        </circle>

        {/* Agent 8 - peripheral */}
        <circle cx="250" cy="210" r="10" fill="none" stroke="#FFB86F" stroke-width="1">
          <animate
            attributeName="stroke-opacity"
            values="0.2;0.5;0.2"
            dur="2.7s"
            repeatCount="indefinite"
          />
        </circle>
        <circle cx="250" cy="210" r="3" fill="#FFB86F" fill-opacity="0.6">
          <animate
            attributeName="fill-opacity"
            values="0.4;0.8;0.4"
            dur="2.7s"
            repeatCount="indefinite"
          />
        </circle>
      </g>

      {/* Signals traveling through emergent connections */}
      <circle r="2.5" fill="#FFB86F" filter="url(#cas-blur)">
        <animateMotion
          dur="3s"
          begin="5s"
          repeatCount="indefinite"
          path="M80 100 Q 120 80 150 110 Q 180 130 200 100 Q 240 90 270 120"
        />
      </circle>
      <circle r="2" fill="#FFB86F" filter="url(#cas-blur)">
        <animateMotion
          dur="2.5s"
          begin="6s"
          repeatCount="indefinite"
          path="M200 100 Q 200 140 200 180"
        />
      </circle>
      <circle r="2" fill="#FFB86F" filter="url(#cas-blur)">
        <animateMotion
          dur="3.5s"
          begin="5.5s"
          repeatCount="indefinite"
          path="M100 180 Q 140 160 150 110"
        />
      </circle>
    </svg>
  );
}

export function BehavioralEmergenceIllustration() {
  return (
    <svg
      width="100%"
      height="100%"
      viewBox="0 0 400 300"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <radialGradient id="crystal-core-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#FFB86F" stop-opacity="0.4" />
          <stop offset="50%" stop-color="#FFB86F" stop-opacity="0.15" />
          <stop offset="100%" stop-color="#FFB86F" stop-opacity="0" />
        </radialGradient>
        <filter id="phase-blur" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="3" />
        </filter>
        <linearGradient id="crystallize-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#FFB86F" stop-opacity="0.6" />
          <stop offset="100%" stop-color="#FFB86F" stop-opacity="0.2" />
        </linearGradient>
      </defs>

      {/* Phase transition zone - the crystallization area */}
      <ellipse cx="200" cy="150" rx="100" ry="80" fill="url(#crystal-core-glow)" />

      {/* Floating pattern fragments - chaotic before crystallization */}
      <g>
        {/* Fragment 1 - orbiting loosely */}
        <circle r="4" fill="none" stroke="#FFB86F" stroke-width="1" stroke-opacity="0.5">
          <animateMotion
            dur="6s"
            repeatCount="indefinite"
            path="M60 80 Q 100 60 140 90 Q 160 110 130 130 Q 80 120 60 80"
          />
        </circle>
        <circle r="1.5" fill="#FFB86F" fill-opacity="0.7">
          <animateMotion
            dur="6s"
            repeatCount="indefinite"
            path="M60 80 Q 100 60 140 90 Q 160 110 130 130 Q 80 120 60 80"
          />
        </circle>

        {/* Fragment 2 */}
        <circle r="3" fill="none" stroke="#FFB86F" stroke-width="1" stroke-opacity="0.4">
          <animateMotion
            dur="5s"
            repeatCount="indefinite"
            path="M340 100 Q 300 80 280 120 Q 260 160 300 170 Q 340 150 340 100"
          />
        </circle>
        <circle r="1.5" fill="#FFB86F" fill-opacity="0.6">
          <animateMotion
            dur="5s"
            repeatCount="indefinite"
            path="M340 100 Q 300 80 280 120 Q 260 160 300 170 Q 340 150 340 100"
          />
        </circle>

        {/* Fragment 3 */}
        <circle r="3.5" fill="none" stroke="#FFB86F" stroke-width="1" stroke-opacity="0.5">
          <animateMotion
            dur="7s"
            repeatCount="indefinite"
            path="M80 200 Q 120 230 160 210 Q 180 180 140 170 Q 100 180 80 200"
          />
        </circle>
        <circle r="1.5" fill="#FFB86F" fill-opacity="0.7">
          <animateMotion
            dur="7s"
            repeatCount="indefinite"
            path="M80 200 Q 120 230 160 210 Q 180 180 140 170 Q 100 180 80 200"
          />
        </circle>

        {/* Fragment 4 */}
        <circle r="4" fill="none" stroke="#FFB86F" stroke-width="1" stroke-opacity="0.4">
          <animateMotion
            dur="5.5s"
            repeatCount="indefinite"
            path="M320 200 Q 280 220 260 190 Q 250 160 290 165 Q 330 180 320 200"
          />
        </circle>
        <circle r="1.5" fill="#FFB86F" fill-opacity="0.6">
          <animateMotion
            dur="5.5s"
            repeatCount="indefinite"
            path="M320 200 Q 280 220 260 190 Q 250 160 290 165 Q 330 180 320 200"
          />
        </circle>
      </g>

      {/* Particles being drawn into crystallization */}
      <g>
        <circle r="2" fill="#FFB86F">
          <animateMotion dur="3s" repeatCount="indefinite" path="M60 60 Q 130 100 200 150" />
          <animate attributeName="opacity" values="0.8;0.2" dur="3s" repeatCount="indefinite" />
          <animate attributeName="r" values="3;1" dur="3s" repeatCount="indefinite" />
        </circle>
        <circle r="2" fill="#FFB86F">
          <animateMotion
            dur="3.5s"
            begin="0.5s"
            repeatCount="indefinite"
            path="M350 80 Q 280 110 200 150"
          />
          <animate
            attributeName="opacity"
            values="0.8;0.2"
            dur="3.5s"
            begin="0.5s"
            repeatCount="indefinite"
          />
          <animate
            attributeName="r"
            values="3;1"
            dur="3.5s"
            begin="0.5s"
            repeatCount="indefinite"
          />
        </circle>
        <circle r="2" fill="#FFB86F">
          <animateMotion
            dur="4s"
            begin="1s"
            repeatCount="indefinite"
            path="M50 220 Q 120 190 200 150"
          />
          <animate
            attributeName="opacity"
            values="0.8;0.2"
            dur="4s"
            begin="1s"
            repeatCount="indefinite"
          />
          <animate attributeName="r" values="3;1" dur="4s" begin="1s" repeatCount="indefinite" />
        </circle>
        <circle r="2" fill="#FFB86F">
          <animateMotion
            dur="3.8s"
            begin="1.5s"
            repeatCount="indefinite"
            path="M340 240 Q 270 200 200 150"
          />
          <animate
            attributeName="opacity"
            values="0.8;0.2"
            dur="3.8s"
            begin="1.5s"
            repeatCount="indefinite"
          />
          <animate
            attributeName="r"
            values="3;1"
            dur="3.8s"
            begin="1.5s"
            repeatCount="indefinite"
          />
        </circle>
      </g>

      {/* Central crystal forming - the capability emerging */}
      <g transform="translate(200, 150)">
        {/* Glow behind crystal */}
        <polygon
          points="0,-45 27,-22 27,22 0,45 -27,22 -27,-22"
          fill="#FFB86F"
          fill-opacity="0.15"
          filter="url(#phase-blur)"
        >
          <animate
            attributeName="fill-opacity"
            values="0.1;0.25;0.1"
            dur="3s"
            repeatCount="indefinite"
          />
        </polygon>

        {/* Crystal outer form */}
        <polygon
          points="0,-40 24,-20 24,20 0,40 -24,20 -24,-20"
          fill="url(#crystallize-grad)"
          stroke="#FFB86F"
          stroke-width="1.5"
        >
          <animate
            attributeName="stroke-opacity"
            values="0.6;1;0.6"
            dur="2s"
            repeatCount="indefinite"
          />
        </polygon>

        {/* Crystal inner facets - showing structure */}
        <line
          x1="0"
          y1="-40"
          x2="0"
          y2="40"
          stroke="#FFB86F"
          stroke-width="0.5"
          stroke-opacity="0.3"
        />
        <line
          x1="-24"
          y1="-20"
          x2="24"
          y2="20"
          stroke="#FFB86F"
          stroke-width="0.5"
          stroke-opacity="0.3"
        />
        <line
          x1="-24"
          y1="20"
          x2="24"
          y2="-20"
          stroke="#FFB86F"
          stroke-width="0.5"
          stroke-opacity="0.3"
        />

        {/* Growing core - capability solidifying */}
        <circle r="8" fill="#FFB86F" fill-opacity="0.9">
          <animate attributeName="r" values="6;10;6" dur="2.5s" repeatCount="indefinite" />
          <animate
            attributeName="fill-opacity"
            values="0.7;1;0.7"
            dur="2.5s"
            repeatCount="indefinite"
          />
        </circle>

        {/* Sparkle points showing crystallization */}
        <circle cx="8" cy="-18" r="2" fill="#fff" fill-opacity="0">
          <animate
            attributeName="fill-opacity"
            values="0;0.9;0"
            dur="2s"
            begin="0s"
            repeatCount="indefinite"
          />
        </circle>
        <circle cx="-12" cy="8" r="1.5" fill="#fff" fill-opacity="0">
          <animate
            attributeName="fill-opacity"
            values="0;0.8;0"
            dur="2s"
            begin="0.7s"
            repeatCount="indefinite"
          />
        </circle>
        <circle cx="10" cy="15" r="1.5" fill="#fff" fill-opacity="0">
          <animate
            attributeName="fill-opacity"
            values="0;0.7;0"
            dur="2s"
            begin="1.3s"
            repeatCount="indefinite"
          />
        </circle>
      </g>

      {/* Energy rings - showing phase transition boundary */}
      <g fill="none" stroke="#FFB86F">
        <ellipse cx="200" cy="150" rx="55" ry="50" stroke-width="1" stroke-opacity="0">
          <animate attributeName="rx" values="35;70;35" dur="4s" repeatCount="indefinite" />
          <animate attributeName="ry" values="30;60;30" dur="4s" repeatCount="indefinite" />
          <animate
            attributeName="stroke-opacity"
            values="0.5;0;0.5"
            dur="4s"
            repeatCount="indefinite"
          />
        </ellipse>
        <ellipse cx="200" cy="150" rx="45" ry="40" stroke-width="1" stroke-opacity="0">
          <animate
            attributeName="rx"
            values="35;70;35"
            dur="4s"
            begin="2s"
            repeatCount="indefinite"
          />
          <animate
            attributeName="ry"
            values="30;60;30"
            dur="4s"
            begin="2s"
            repeatCount="indefinite"
          />
          <animate
            attributeName="stroke-opacity"
            values="0.5;0;0.5"
            dur="4s"
            begin="2s"
            repeatCount="indefinite"
          />
        </ellipse>
      </g>

      {/* Peripheral stable nodes - already crystallized capabilities */}
      <g>
        {/* Stable capability 1 */}
        <polygon
          points="60,70 72,76 72,88 60,94 48,88 48,76"
          fill="none"
          stroke="#FFB86F"
          stroke-width="1"
          stroke-opacity="0.4"
        />
        <circle cx="60" cy="82" r="3" fill="#FFB86F" fill-opacity="0.5">
          <animate
            attributeName="fill-opacity"
            values="0.3;0.6;0.3"
            dur="3s"
            repeatCount="indefinite"
          />
        </circle>

        {/* Stable capability 2 */}
        <polygon
          points="340,90 352,96 352,108 340,114 328,108 328,96"
          fill="none"
          stroke="#FFB86F"
          stroke-width="1"
          stroke-opacity="0.4"
        />
        <circle cx="340" cy="102" r="3" fill="#FFB86F" fill-opacity="0.5">
          <animate
            attributeName="fill-opacity"
            values="0.3;0.6;0.3"
            dur="3.5s"
            repeatCount="indefinite"
          />
        </circle>

        {/* Stable capability 3 */}
        <polygon
          points="70,210 82,216 82,228 70,234 58,228 58,216"
          fill="none"
          stroke="#FFB86F"
          stroke-width="1"
          stroke-opacity="0.4"
        />
        <circle cx="70" cy="222" r="3" fill="#FFB86F" fill-opacity="0.5">
          <animate
            attributeName="fill-opacity"
            values="0.3;0.6;0.3"
            dur="2.8s"
            repeatCount="indefinite"
          />
        </circle>

        {/* Stable capability 4 */}
        <polygon
          points="330,200 342,206 342,218 330,224 318,218 318,206"
          fill="none"
          stroke="#FFB86F"
          stroke-width="1"
          stroke-opacity="0.4"
        />
        <circle cx="330" cy="212" r="3" fill="#FFB86F" fill-opacity="0.5">
          <animate
            attributeName="fill-opacity"
            values="0.3;0.6;0.3"
            dur="3.2s"
            repeatCount="indefinite"
          />
        </circle>
      </g>

      {/* Faint connections between stable capabilities and center */}
      <g stroke="#FFB86F" stroke-width="0.5" stroke-opacity="0.15" stroke-dasharray="4 4">
        <line x1="60" y1="82" x2="176" y2="140" />
        <line x1="340" y1="102" x2="224" y2="140" />
        <line x1="70" y1="222" x2="180" y2="165" />
        <line x1="330" y1="212" x2="220" y2="165" />
      </g>
    </svg>
  );
}

export function OrchestratorIllustration() {
  return (
    <svg
      width="100%"
      height="100%"
      viewBox="0 0 400 300"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <radialGradient id="brain-glow" cx="0.5" cy="0.5" r="0.5">
          <stop stop-color="#FFB86F" stop-opacity="0.2" />
          <stop offset="1" stop-color="#FFB86F" stop-opacity="0" />
        </radialGradient>
      </defs>

      {/* Claude Brain (top) */}
      <g transform="translate(200, 70)">
        <circle r="40" fill="url(#brain-glow)" />
        <circle r="30" fill="#0a0908" stroke="#FFB86F" stroke-width="3" />

        {/* Brain pattern */}
        <path
          d="M-15 -10 Q -5 -20 5 -10 Q 15 0 5 10 Q -5 20 -15 10"
          stroke="#FFB86F"
          stroke-width="2"
          fill="none"
          stroke-opacity="0.6"
        />
        <path
          d="M5 -15 Q 15 -5 5 5 Q -5 15 5 20"
          stroke="#FFB86F"
          stroke-width="2"
          fill="none"
          stroke-opacity="0.6"
        />

        {/* Crown hint */}
        <path
          d="M-20 -35 L -10 -25 L 0 -35 L 10 -25 L 20 -35"
          stroke="#FFB86F"
          stroke-width="2"
          fill="none"
        />

        <text
          x="0"
          y="55"
          text-anchor="middle"
          fill="#FFB86F"
          font-family="sans-serif"
          font-size="11"
          font-weight="bold"
        >
          CLAUDE
        </text>
        <text
          x="0"
          y="68"
          text-anchor="middle"
          fill="#d5c3b5"
          font-family="sans-serif"
          font-size="9"
        >
          Strategic Orchestrator
        </text>
      </g>

      {/* Delegation arrow */}
      <path d="M200 110 L 200 160" stroke="#FFB86F" stroke-width="2" stroke-dasharray="6 4" />
      <polygon points="200,170 195,160 205,160" fill="#FFB86F" />
      <text x="230" y="145" fill="#d5c3b5" font-family="sans-serif" font-size="9">delegate</text>

      {/* Gateway (middle) */}
      <g transform="translate(200, 200)">
        <rect
          x="-70"
          y="-25"
          width="140"
          height="50"
          rx="8"
          fill="#12110f"
          stroke="#FFB86F"
          stroke-width="2"
        />
        <text
          x="0"
          y="5"
          text-anchor="middle"
          fill="#FFB86F"
          font-family="sans-serif"
          font-size="12"
          font-weight="bold"
        >
          PML GATEWAY
        </text>

        {/* Processing indicator */}
        <rect x="-55" y="12" width="110" height="4" rx="2" fill="#FFB86F" fill-opacity="0.2" />
        <rect x="-55" y="12" width="60" height="4" rx="2" fill="#FFB86F">
          <animate attributeName="width" values="20;110;20" dur="2s" repeatCount="indefinite" />
        </rect>
      </g>

      {/* Return arrow */}
      <path
        d="M270 200 Q 320 200 320 145 Q 320 90 270 90"
        stroke="#34d399"
        stroke-width="2"
        fill="none"
      />
      <polygon points="270,85 280,90 270,95" fill="#34d399" />
      <text x="335" y="150" fill="#34d399" font-family="sans-serif" font-size="9">summary</text>
      <text x="335" y="162" fill="#d5c3b5" font-family="sans-serif" font-size="8">~100 tokens</text>

      {/* MCP Servers (bottom) */}
      <g transform="translate(200, 270)">
        <rect
          x="-90"
          y="-12"
          width="50"
          height="24"
          rx="4"
          fill="#0a0908"
          stroke="#FFB86F"
          stroke-width="1"
          stroke-opacity="0.5"
        />
        <text
          x="-65"
          y="4"
          text-anchor="middle"
          fill="#d5c3b5"
          font-family="sans-serif"
          font-size="8"
        >
          fs
        </text>

        <rect
          x="-25"
          y="-12"
          width="50"
          height="24"
          rx="4"
          fill="#0a0908"
          stroke="#FFB86F"
          stroke-width="1"
          stroke-opacity="0.5"
        />
        <text
          x="0"
          y="4"
          text-anchor="middle"
          fill="#d5c3b5"
          font-family="sans-serif"
          font-size="8"
        >
          github
        </text>

        <rect
          x="40"
          y="-12"
          width="50"
          height="24"
          rx="4"
          fill="#0a0908"
          stroke="#FFB86F"
          stroke-width="1"
          stroke-opacity="0.5"
        />
        <text
          x="65"
          y="4"
          text-anchor="middle"
          fill="#d5c3b5"
          font-family="sans-serif"
          font-size="8"
        >
          db
        </text>
      </g>

      {/* Connections to MCP */}
      <path d="M200 225 L 135 258" stroke="#FFB86F" stroke-width="1" stroke-opacity="0.3" />
      <path d="M200 225 L 200 258" stroke="#FFB86F" stroke-width="1" stroke-opacity="0.3" />
      <path d="M200 225 L 265 258" stroke="#FFB86F" stroke-width="1" stroke-opacity="0.3" />
    </svg>
  );
}

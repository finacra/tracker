'use client'

export default function SubtleCircuitBackground() {
  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
      {/* Subtle circuit board pattern */}
      <svg
        className="absolute inset-0 w-full h-full opacity-15"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <pattern
            id="circuit-subtle"
            x="0"
            y="0"
            width="150"
            height="150"
            patternUnits="userSpaceOnUse"
          >
            <circle cx="10" cy="10" r="1" fill="#FF6B35" opacity="0.4" />
            <circle cx="50" cy="30" r="1.2" fill="#FF6B35" opacity="0.3" />
            <circle cx="80" cy="60" r="1" fill="#FF6B35" opacity="0.35" />
            <circle cx="30" cy="80" r="1.1" fill="#FF6B35" opacity="0.3" />
            <circle cx="70" cy="20" r="1" fill="#FF6B35" opacity="0.4" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#circuit-subtle)" />
      </svg>

      {/* Very subtle glowing lines */}
      <svg
        className="absolute inset-0 w-full h-full opacity-10"
        xmlns="http://www.w3.org/2000/svg"
      >
        <line
          x1="0"
          y1="60%"
          x2="100%"
          y2="65%"
          stroke="#FF6B35"
          strokeWidth="1"
          opacity="0.2"
        />
        <line
          x1="20%"
          y1="0"
          x2="40%"
          y2="100%"
          stroke="#FF6B35"
          strokeWidth="1"
          opacity="0.15"
        />
        <line
          x1="70%"
          y1="0"
          x2="90%"
          y2="100%"
          stroke="#FF6B35"
          strokeWidth="1"
          opacity="0.12"
        />
      </svg>
    </div>
  )
}

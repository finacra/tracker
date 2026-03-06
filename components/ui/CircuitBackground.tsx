'use client'

export default function CircuitBackground() {
  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
      {/* Circuit board pattern */}
      <svg
        className="absolute inset-0 w-full h-full opacity-60"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <pattern
            id="circuit"
            x="0"
            y="0"
            width="100"
            height="100"
            patternUnits="userSpaceOnUse"
          >
            <circle cx="10" cy="10" r="1.5" fill="#FF6B35" opacity="0.8" />
            <circle cx="50" cy="30" r="2" fill="#FF6B35" opacity="0.7" />
            <circle cx="80" cy="60" r="1.5" fill="#FF6B35" opacity="0.8" />
            <circle cx="30" cy="80" r="1.8" fill="#FF6B35" opacity="0.7" />
            <circle cx="70" cy="20" r="1.5" fill="#FF6B35" opacity="0.8" />
            <circle cx="25" cy="45" r="1.2" fill="#FF6B35" opacity="0.6" />
            <circle cx="85" cy="35" r="1.3" fill="#FF6B35" opacity="0.7" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#circuit)" />
      </svg>

      {/* Glowing lines */}
      <svg
        className="absolute inset-0 w-full h-full opacity-50"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Horizontal lines */}
        <line
          x1="0"
          y1="60%"
          x2="100%"
          y2="65%"
          stroke="#FF6B35"
          strokeWidth="1.5"
          opacity="0.5"
        />
        <line
          x1="0"
          y1="80%"
          x2="100%"
          y2="85%"
          stroke="#FF6B35"
          strokeWidth="1.5"
          opacity="0.4"
        />
        <line
          x1="0"
          y1="40%"
          x2="100%"
          y2="42%"
          stroke="#FF6B35"
          strokeWidth="1"
          opacity="0.3"
        />
        {/* Diagonal lines */}
        <line
          x1="20%"
          y1="0"
          x2="40%"
          y2="100%"
          stroke="#FF6B35"
          strokeWidth="1.5"
          opacity="0.4"
        />
        <line
          x1="70%"
          y1="0"
          x2="90%"
          y2="100%"
          stroke="#FF6B35"
          strokeWidth="1.5"
          opacity="0.35"
        />
        <line
          x1="10%"
          y1="0"
          x2="25%"
          y2="100%"
          stroke="#FF6B35"
          strokeWidth="1"
          opacity="0.3"
        />
        {/* Vertical lines */}
        <line
          x1="30%"
          y1="0"
          x2="30%"
          y2="100%"
          stroke="#FF6B35"
          strokeWidth="1.5"
          opacity="0.35"
        />
        <line
          x1="75%"
          y1="0"
          x2="75%"
          y2="100%"
          stroke="#FF6B35"
          strokeWidth="1.5"
          opacity="0.3"
        />
        <line
          x1="55%"
          y1="0"
          x2="55%"
          y2="100%"
          stroke="#FF6B35"
          strokeWidth="1"
          opacity="0.25"
        />
      </svg>

      {/* Glowing dots */}
      <div className="absolute bottom-20 right-20 w-3 h-3 bg-primary-orange rounded-full blur-md opacity-60 animate-pulse" />
      <div className="absolute top-40 right-40 w-2.5 h-2.5 bg-primary-orange rounded-full blur-sm opacity-70" />
      <div className="absolute bottom-40 left-32 w-2 h-2 bg-primary-orange rounded-full blur-sm opacity-80" />
      <div className="absolute top-60 left-60 w-3.5 h-3.5 bg-primary-orange rounded-full blur-md opacity-50 animate-pulse" style={{ animationDelay: '1s' }} />
      <div className="absolute top-20 left-20 w-2 h-2 bg-primary-orange rounded-full blur-sm opacity-65" />
      <div className="absolute bottom-60 right-40 w-2.5 h-2.5 bg-primary-orange rounded-full blur-md opacity-55" />
    </div>
  )
}

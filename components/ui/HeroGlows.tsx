'use client'

/**
 * PR-13: futuristic skin — floating glow blobs that live behind hero
 * areas. Three softly-blurred violet/indigo gradients positioned
 * absolutely. Pure decoration, pointer-events: none, prefers-reduced-
 * motion safe (no animation on the blobs themselves — the page motion
 * is in .aurora-text which already honors the preference).
 *
 * Caller is responsible for setting `position: relative` and
 * `overflow: hidden` on the wrapping element so the blobs don't bleed.
 *
 * Costs ~0 layout perf — three divs with CSS filter:blur and opacity.
 * GPU-composited.
 */
export default function HeroGlows() {
  return (
    <div aria-hidden="true" className="absolute inset-0 overflow-hidden pointer-events-none">
      <div
        className="glow-blob"
        style={{
          top: '-80px',
          left: '15%',
          width: '320px',
          height: '320px',
          background:
            'radial-gradient(circle, rgb(var(--accent-violet)) 0%, rgb(var(--accent-brand) / 0.6) 50%, transparent 80%)',
        }}
      />
      <div
        className="glow-blob"
        style={{
          top: '20px',
          right: '10%',
          width: '240px',
          height: '240px',
          background:
            'radial-gradient(circle, rgb(var(--accent-brand)) 0%, rgb(var(--accent-violet) / 0.5) 60%, transparent 85%)',
        }}
      />
      <div
        className="glow-blob"
        style={{
          top: '160px',
          left: '40%',
          width: '180px',
          height: '180px',
          background:
            'radial-gradient(circle, rgb(var(--accent-violet) / 0.7) 0%, transparent 75%)',
          opacity: 0.25,
        }}
      />
    </div>
  )
}

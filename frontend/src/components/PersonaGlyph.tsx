type PersonaGlyphProps = {
  maturity?: number
  size?: number
  pulse?: boolean
}

export function PersonaGlyph({ maturity = 0.6, size = 120, pulse = false }: PersonaGlyphProps) {
  const rings = 4
  const coreRadius = size * 0.13
  const center = size / 2
  const gradientId = `persona-core-${size}-${Math.round(maturity * 1000)}-${pulse ? 'p' : 's'}`

  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} aria-hidden>
      <defs>
        <radialGradient id={gradientId} cx="50%" cy="45%" r="60%">
          <stop offset="0%" stopColor="oklch(0.78 0.16 260)" stopOpacity={0.5 + 0.5 * maturity} />
          <stop offset="100%" stopColor="oklch(0.55 0.16 260)" stopOpacity={0.08 + 0.3 * maturity} />
        </radialGradient>
      </defs>

      {Array.from({ length: rings }).map((_, index) => {
        const progress = (index + 1) / rings
        const visible = progress <= maturity + 0.08
        const radius = coreRadius + size * 0.32 * progress
        return (
          <circle
            key={index}
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke={
              visible
                ? `oklch(0.68 0.15 260 / ${Math.max(0.16, 0.6 - index * 0.12)})`
                : 'oklch(0.5 0.02 260 / 0.25)'
            }
            strokeWidth={visible ? 1 : 0.8}
            strokeDasharray={visible ? '0' : '2 3'}
          />
        )
      })}

      <circle cx={center} cy={center} r={coreRadius + 2} fill={`url(#${gradientId})`} />
      <circle cx={center} cy={center} r={coreRadius * 0.55} fill="oklch(0.92 0.08 260)" opacity={0.7 + 0.3 * maturity} />
      {pulse ? (
        <circle
          cx={center}
          cy={center}
          r={coreRadius * 0.55}
          fill="none"
          stroke="oklch(0.7 0.15 260)"
          style={{ transformOrigin: `${center}px ${center}px`, animation: 'pulseRing 1.8s ease-out infinite' }}
        />
      ) : null}
    </svg>
  )
}

export function MiniGlyph({ maturity = 0.6 }: { maturity?: number }) {
  return <PersonaGlyph maturity={maturity} size={22} />
}

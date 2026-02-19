'use client'

import type { SuspicionGaugeProps } from '@/lib/types'

export default function SuspicionGauge({ score }: SuspicionGaugeProps) {
  const radius = 36
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (score / 100) * circumference
  const color = score > 80 ? '#FF2D55' : score > 50 ? '#FFB800' : '#00F5FF'

  return (
    <svg width="96" height="96" viewBox="0 0 96 96">
      <circle
        cx="48"
        cy="48"
        r={radius}
        fill="none"
        stroke="#1E1E2E"
        strokeWidth="5"
      />
      <circle
        cx="48"
        cy="48"
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth="5"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="butt"
        transform="rotate(-90 48 48)"
        style={{ transition: 'stroke-dashoffset 0.8s ease' }}
      />
      <text
        x="48"
        y="44"
        textAnchor="middle"
        dominantBaseline="central"
        fill={color}
        fontSize="22"
        fontFamily="var(--font-mono), monospace"
        fontWeight="700"
      >
        {score}
      </text>
      <text
        x="48"
        y="62"
        textAnchor="middle"
        fill="#6B6B80"
        fontSize="8"
        fontFamily="var(--font-mono), monospace"
        style={{ textTransform: 'uppercase' }}
        letterSpacing="1"
      >
        {'RISK'}
      </text>
    </svg>
  )
}

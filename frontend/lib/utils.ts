import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { useState, useEffect } from 'react'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const COMMUNITY_PALETTE = [
  '#00F5FF',
  '#7B61FF',
  '#FF6B6B',
  '#4ECDC4',
  '#45B7D1',
  '#96CEB4',
  '#FFEEAD',
  '#D4A574',
  '#A8E6CF',
  '#FF8A5C',
  '#778BEB',
  '#E77F67',
]

export function getCommunityColor(communityId: number): string {
  return COMMUNITY_PALETTE[communityId % COMMUNITY_PALETTE.length]
}

export function useCountUp(target: number, duration = 1200) {
  const [value, setValue] = useState(0)
  useEffect(() => {
    if (target === 0) {
      setValue(0)
      return
    }
    const start = performance.now()
    let raf: number
    const animate = (now: number) => {
      const elapsed = now - start
      const progress = Math.min(elapsed / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setValue(Math.floor(eased * target))
      if (progress < 1) raf = requestAnimationFrame(animate)
    }
    raf = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(raf)
  }, [target, duration])
  return value
}

export async function sha256(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message)
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}

function replacer(_key: string, value: unknown): unknown {
  if (value instanceof Map) {
    return { __type: 'Map', value: Object.fromEntries(value) }
  }
  if (value instanceof Set) {
    return { __type: 'Set', value: Array.from(value) }
  }
  return value
}

function reviver(_key: string, value: unknown): unknown {
  if (value && typeof value === 'object' && '__type' in value) {
    const obj = value as { __type: string; value: unknown }
    if (obj.__type === 'Map' && typeof obj.value === 'object') {
      return new Map(Object.entries(obj.value as Record<string, unknown>))
    }
    if (obj.__type === 'Set' && Array.isArray(obj.value)) {
      return new Set(obj.value)
    }
  }
  return value
}

export function serializeAnalysisResult(result: unknown): string {
  return JSON.stringify(result, replacer)
}

export function deserializeAnalysisResult(json: string): unknown {
  return JSON.parse(json, reviver)
}

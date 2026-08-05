import { describe, expect, it } from 'vitest'
import { createAnonymousProbeVideoElement } from './probe-media'

describe('Leafer 规模探针媒体元素', () => {
  it('在赋 src 前显式启用 anonymous CORS', () => {
    const assignments: string[] = []
    const fake = {
      set crossOrigin(value: string | null) { assignments.push(`crossOrigin:${value}`) },
      set preload(value: string) { assignments.push(`preload:${value}`) },
      set playsInline(value: boolean) { assignments.push(`playsInline:${value}`) },
      set src(value: string) { assignments.push(`src:${value}`) },
      get src() { return assignments.find((value) => value.startsWith('src:'))?.slice(4) ?? '' },
    } as HTMLVideoElement
    const video = createAnonymousProbeVideoElement(
      'https://mdn.github.io/shared-assets/videos/flower.mp4',
      () => fake,
    )

    expect(assignments[0]).toBe('crossOrigin:anonymous')
    expect(video.src).toContain('https://mdn.github.io/shared-assets/videos/flower.mp4')
  })
})

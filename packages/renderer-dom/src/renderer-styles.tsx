import type { ReactNode } from 'react'

export const SKELETON_ANIMATION = 'fw-generation-skeleton-sweep'
export const PROGRESS_ANIMATION = 'fw-generation-progress-indeterminate'

export function RendererStyles(): ReactNode {
  return (
    <style data-fw-renderer-styles="true">{`
      @keyframes ${SKELETON_ANIMATION} {
        from { transform: translateX(-100%); }
        to { transform: translateX(225%); }
      }
      @keyframes ${PROGRESS_ANIMATION} {
        0%, 100% { transform: translateX(-100%); }
        50% { transform: translateX(285%); }
      }
      [data-fw-generation-unit="true"]:hover {
        z-index: 1;
      }
    `}</style>
  )
}

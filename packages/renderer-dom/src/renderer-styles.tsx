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
      [data-fw-audio-card="true"]::before {
        content: "♫  ▁▃▆▂▅▇▃";
        position: absolute;
        left: 14px;
        top: 12px;
        color: #8DB6FF;
        font: 600 22px/1 sans-serif;
        letter-spacing: 2px;
        pointer-events: none;
      }
      [data-fw-audio-card="true"]::after {
        content: attr(data-fw-audio-name);
        position: absolute;
        left: 14px;
        right: 14px;
        top: 42px;
        overflow: hidden;
        color: #FFFFFF;
        font: 500 14px/20px sans-serif;
        text-overflow: ellipsis;
        white-space: nowrap;
        pointer-events: none;
      }
      [data-fw-audio-controls="true"] {
        position: absolute;
        left: 8px;
        right: 8px;
        bottom: 4px;
        width: calc(100% - 16px);
        height: 36px;
      }
    `}</style>
  )
}

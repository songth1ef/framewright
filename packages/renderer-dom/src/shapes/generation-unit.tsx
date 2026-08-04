import {
  GEN_UNIT_STYLE,
  isAiImageNode,
  isAiVideoNode,
  type AiImageNode,
  type AiVideoNode,
  type Point,
} from '@framewright/core'
import type { CSSProperties, ReactNode } from 'react'
import { toNodeStyle } from '../node-style'

type GenerationNode = AiImageNode | AiVideoNode

export interface GenerationUnitProps {
  node: GenerationNode
  position: Point
  size?: { width: number; height: number }
  selected: boolean
  onNodeAction(fwId: string, action: string): void
}

const SELECTED_OUTLINE = '2px solid #5B8091'
const SKELETON_ANIMATION = 'fw-generation-skeleton-sweep'
const PROGRESS_ANIMATION = 'fw-generation-progress-indeterminate'

const centeredContent: CSSProperties = {
  width: '100%',
  height: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
}

const interactionButtonStyle: CSSProperties = {
  appearance: 'none',
  border: 0,
  padding: 0,
  background: 'transparent',
  color: 'inherit',
  font: 'inherit',
  cursor: 'pointer',
}

function EmptyContent({ onAction }: { onAction(): void }): ReactNode {
  return (
    <div
      style={{
        ...centeredContent,
        background: GEN_UNIT_STYLE.emptyBackground,
        color: GEN_UNIT_STYLE.emptyTextColor,
        fontSize: `${GEN_UNIT_STYLE.emptyFontSize}px`,
      }}
    >
      <button
        data-fw-interaction="ignore"
        style={interactionButtonStyle}
        type="button"
        onClick={(event) => {
          event.stopPropagation()
          onAction()
        }}
      >
        点击生成
      </button>
    </div>
  )
}

function GeneratingContent(): ReactNode {
  return (
    <div
      data-fw-generation-skeleton="true"
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        background: GEN_UNIT_STYLE.skeletonBase,
        animationDuration: `${GEN_UNIT_STYLE.skeletonPeriodMs}ms`,
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          width: '45%',
          background: `linear-gradient(90deg, transparent, ${GEN_UNIT_STYLE.skeletonHighlight}, transparent)`,
          animation: `${SKELETON_ANIMATION} ${GEN_UNIT_STYLE.skeletonPeriodMs}ms ease-in-out infinite`,
        }}
      />
      <div
        data-fw-generation-progress="true"
        style={{
          position: 'absolute',
          right: 0,
          bottom: 0,
          left: 0,
          height: `${GEN_UNIT_STYLE.progressHeight}px`,
          overflow: 'hidden',
          background: GEN_UNIT_STYLE.progressTrackColor,
        }}
      >
        <div
          style={{
            width: '35%',
            height: '100%',
            background: GEN_UNIT_STYLE.progressBarColor,
            animation: `${PROGRESS_ANIMATION} ${GEN_UNIT_STYLE.skeletonPeriodMs}ms ease-in-out infinite`,
          }}
        />
      </div>
    </div>
  )
}

function SucceededContent({ node }: { node: GenerationNode }): ReactNode {
  const mediaStyle: CSSProperties = {
    display: 'block',
    width: '100%',
    height: `calc(100% - ${GEN_UNIT_STYLE.footerHeight}px)`,
    objectFit: node.fit,
  }
  const media = isAiImageNode(node) ? (
    <img alt="" draggable={false} src={node.src ?? undefined} style={mediaStyle} />
  ) : (
    <video poster={isAiVideoNode(node) ? node.poster ?? undefined : undefined} src={node.src ?? undefined} style={mediaStyle} />
  )

  return (
    <>
      {media}
      <div
        data-fw-generation-badge="true"
        style={{
          position: 'absolute',
          top: `${GEN_UNIT_STYLE.badgeInset}px`,
          left: `${GEN_UNIT_STYLE.badgeInset}px`,
          padding: '2px 5px',
          borderRadius: '3px',
          background: 'rgba(0, 0, 0, 0.55)',
          color: '#FFFFFF',
          fontSize: `${GEN_UNIT_STYLE.badgeFontSize}px`,
          lineHeight: 1.2,
        }}
      >
        AI生成
      </div>
      <div
        data-fw-generation-footer="true"
        style={{
          height: `${GEN_UNIT_STYLE.footerHeight}px`,
          padding: `0 ${GEN_UNIT_STYLE.footerPaddingX}px`,
          overflow: 'hidden',
          background: GEN_UNIT_STYLE.footerBackground,
          color: GEN_UNIT_STYLE.footerTextColor,
          fontSize: `${GEN_UNIT_STYLE.footerFontSize}px`,
          lineHeight: `${GEN_UNIT_STYLE.footerHeight}px`,
          whiteSpace: 'nowrap',
          textOverflow: 'ellipsis',
          boxSizing: 'border-box',
        }}
      >
        {node.prompt}
      </div>
    </>
  )
}

function FailedContent({ node, onAction }: { node: GenerationNode; onAction(): void }): ReactNode {
  return (
    <div
      style={{
        ...centeredContent,
        flexDirection: 'column',
        gap: '8px',
        overflow: 'hidden',
        background: GEN_UNIT_STYLE.failedBackground,
        color: GEN_UNIT_STYLE.failedTextColor,
        fontSize: `${GEN_UNIT_STYLE.failedFontSize}px`,
      }}
    >
      <div
        data-fw-generation-error="true"
        style={{ maxWidth: '80%', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}
      >
        {node.errorMessage || '生成失败'}
      </div>
      <button
        data-fw-interaction="ignore"
        style={interactionButtonStyle}
        type="button"
        onClick={(event) => {
          event.stopPropagation()
          onAction()
        }}
      >
        重试
      </button>
    </div>
  )
}

function renderContent(
  node: GenerationNode,
  onNodeAction: GenerationUnitProps['onNodeAction'],
): ReactNode {
  switch (node.status) {
    case 'empty':
      return <EmptyContent onAction={() => onNodeAction(node.fwId, 'generate')} />
    case 'pending':
    case 'running':
      return <GeneratingContent />
    case 'succeeded':
      return <SucceededContent node={node} />
    case 'failed':
      return <FailedContent node={node} onAction={() => onNodeAction(node.fwId, 'retry')} />
  }
}

export function GenerationUnit({
  node,
  position,
  size,
  selected,
  onNodeAction,
}: GenerationUnitProps): ReactNode {
  const isEmpty = node.status === 'empty'
  const isFailed = node.status === 'failed'
  const style: CSSProperties = {
    ...toNodeStyle(node, position, size),
    overflow: 'hidden',
    borderWidth: `${GEN_UNIT_STYLE.borderWidth}px`,
    borderStyle: isEmpty ? 'dashed' : 'solid',
    borderColor: isFailed ? GEN_UNIT_STYLE.failedBorderColor : GEN_UNIT_STYLE.borderColor,
    borderRadius: `${GEN_UNIT_STYLE.cornerRadius}px`,
    outline: selected ? SELECTED_OUTLINE : undefined,
  }

  return (
    <div data-fw-id={node.fwId} data-fw-type={node.fwType} style={style}>
      <style>{`
        @keyframes ${SKELETON_ANIMATION} {
          from { transform: translateX(-100%); }
          to { transform: translateX(225%); }
        }
        @keyframes ${PROGRESS_ANIMATION} {
          0%, 100% { transform: translateX(-100%); }
          50% { transform: translateX(285%); }
        }
      `}</style>
      {renderContent(node, onNodeAction)}
    </div>
  )
}

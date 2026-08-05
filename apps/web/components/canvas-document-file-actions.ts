import type { CanvasOp, FrameNode } from '@framewright/core'
import { useState } from 'react'
import {
  createImportRootOp,
  downloadCanvasRoot,
  parseCanvasRootJson,
} from './canvas-document-file'

export interface CanvasImportMessage {
  kind: 'success' | 'error'
  text: string
}

interface CanvasDocumentFileActionsOptions {
  documentName?: string
  getRoot(): FrameNode
  commitOps(ops: readonly CanvasOp[]): void
  clearSelection(): void
}

export function useCanvasDocumentFileActions(options: CanvasDocumentFileActionsOptions) {
  const [importMessage, setImportMessage] = useState<CanvasImportMessage | null>(null)

  const importCanvasFile = async (file: File): Promise<void> => {
    setImportMessage(null)
    let json: string
    try {
      json = await file.text()
    } catch {
      setImportMessage({ kind: 'error', text: '导入失败：无法读取所选文件。' })
      return
    }

    const result = parseCanvasRootJson(json)
    if (!result.ok) {
      setImportMessage({ kind: 'error', text: result.error })
      return
    }

    options.commitOps([createImportRootOp(options.getRoot(), result.root)])
    options.clearSelection()
    setImportMessage({ kind: 'success', text: '画布已导入，可使用 Ctrl+Z 撤销。' })
  }

  return {
    importMessage,
    importCanvasFile,
    exportCanvas: () => downloadCanvasRoot(options.getRoot(), options.documentName),
  }
}

import type { CanvasImportMessage } from './canvas-document-file-actions'

interface CanvasDocumentStatusProps {
  historyReady: boolean
  hasPersistentDocument: boolean
  saveStatus: 'idle' | 'saving' | 'saved' | 'error'
  importMessage: CanvasImportMessage | null
}

export function CanvasDocumentStatus({
  historyReady,
  hasPersistentDocument,
  saveStatus,
  importMessage,
}: CanvasDocumentStatusProps) {
  return (
    <>
      {!historyReady ? <span role="status">正在加载撤销历史…</span> : null}
      {!hasPersistentDocument || saveStatus === 'idle' ? null : (
        <span
          data-testid="save-status"
          role={saveStatus === 'error' ? 'alert' : 'status'}
          style={{ color: saveStatus === 'error' ? '#b42318' : '#475467' }}
        >
          {saveStatus === 'saving'
            ? '保存中…'
            : saveStatus === 'error'
              ? '保存失败，请重试'
              : '已保存'}
        </span>
      )}
      {importMessage === null ? null : (
        <span
          data-testid="canvas-import-message"
          role={importMessage.kind === 'error' ? 'alert' : 'status'}
          style={{ color: importMessage.kind === 'error' ? '#b42318' : '#067647' }}
        >
          {importMessage.text}
        </span>
      )}
    </>
  )
}

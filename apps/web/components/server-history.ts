import { invertOp, type CanvasOp, type FrameNode, type MemoryHistory } from '@framewright/core'

/**
 * U2：操作栈写后端的撤销历史（docs/domain.md §4.5）。
 *
 * 与 core 的 MemoryHistory 同接口（record/undo/redo 保持同步，host 无感），
 * 区别在于：加载时从后端读回操作日志与 historySeq（→ 跨会话撤销），
 * record 时把 op 写透到 `POST /api/documents/[id]/history`。
 *
 * 撤销/重做只动本地游标，不立即打后端；若之后产生新操作而 historySeq 尚未落库，
 * record 会先经 `PUT /api/documents/[id]` 把 historySeq 写回再追加，保证两端 seq 不错位。
 * 平时的 historySeq 持久化由 Document 防抖保存（F6）携带 `getHistorySeq()` 完成。
 */
export interface ServerHistory extends MemoryHistory {
  /** 当前游标对应的绝对 historySeq，随 Document 保存写回后端。 */
  getHistorySeq(): number
  /** 等待进行中的写库完成；写库错误经 onError 上报，这里不 reject。 */
  flush(): Promise<void>
}

export interface ServerHistoryOptions {
  fetch?: typeof fetch
  /** 返回当前 node 树，用于撤销后首次追加前的 historySeq 写回。 */
  getRoot: () => FrameNode
  onError?: (error: unknown) => void
}

interface HistoryEntryDto {
  seq: number
  op: CanvasOp
}

export async function loadServerHistory(
  documentId: string,
  options: ServerHistoryOptions,
): Promise<ServerHistory> {
  const fetchImpl = options.fetch ?? fetch
  const base = `/api/documents/${encodeURIComponent(documentId)}`
  const [historyResult, documentResult] = await Promise.all([
    fetchImpl(`${base}/history`),
    fetchImpl(base),
  ])
  if (!historyResult.ok || !documentResult.ok) {
    throw new Error(`加载撤销历史失败: history=${historyResult.status} document=${documentResult.status}`)
  }
  const rawEntries = (await historyResult.json()) as readonly HistoryEntryDto[]
  const document = (await documentResult.json()) as { name: string; historySeq: number }

  let entries = rawEntries.map(({ seq, op }) => ({ seq, op })).sort((a, b) => a.seq - b.seq)
  let historySeq = document.historySeq
  /** 后端 document.historySeq 的已确认值；撤销/重做后它与本地游标分叉，下次追加前必须写回。 */
  let confirmedSeq = document.historySeq
  let pending: Promise<void> = Promise.resolve()

  const JSON_HEADERS = { 'content-type': 'application/json' }

  return {
    record(op) {
      entries = entries.filter((entry) => entry.seq <= historySeq)
      historySeq += 1
      entries.push({ seq: historySeq, op })
      const targetSeq = historySeq
      pending = pending.catch(() => undefined).then(async () => {
        if (confirmedSeq !== targetSeq - 1) {
          const putResult = await fetchImpl(base, {
            method: 'PUT',
            headers: JSON_HEADERS,
            body: JSON.stringify({
              name: document.name,
              root: options.getRoot(),
              historySeq: targetSeq - 1,
            }),
          })
          if (!putResult.ok) throw new Error(`写回 historySeq 失败: ${putResult.status}`)
        }
        const postResult = await fetchImpl(`${base}/history`, {
          method: 'POST',
          headers: JSON_HEADERS,
          body: JSON.stringify({ op }),
        })
        if (!postResult.ok) throw new Error(`写入操作日志失败: ${postResult.status}`)
        const created = (await postResult.json()) as HistoryEntryDto
        confirmedSeq = created.seq
      })
      pending.catch((error: unknown) => options.onError?.(error))
    },

    undo() {
      const entry = entries.find((candidate) => candidate.seq === historySeq)
      if (entry === undefined) return null
      historySeq -= 1
      return invertOp(entry.op)
    },

    redo() {
      const entry = entries.find((candidate) => candidate.seq === historySeq + 1)
      if (entry === undefined) return null
      historySeq += 1
      return entry.op
    },

    getHistorySeq() {
      return historySeq
    },

    async flush() {
      await pending.catch(() => undefined)
    },
  }
}

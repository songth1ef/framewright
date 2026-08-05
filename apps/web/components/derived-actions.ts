import {
  createDerivedGenerationBatchOp,
  createDerivedGenerationOp,
  findNodeById,
  isAiImageNode,
  type CanvasOp,
  type DerivedGenerationInput,
  type FrameNode,
} from '@framewright/core'

/**
 * G2-5：把 core 的派生生成（`derived-generation.ts`）接到 host 的动作通道上。
 *
 * 本模块只做两件事：按源节点 fwId 找到画布中的 ai-image 源节点，调 core
 * 拿到构造完毕的 add-node / batch op；然后交给调用方传入的 `commitOps`
 * ——即 renderer-host 里既有的 history/record 提交通道。
 *
 * 🔴 不开第二条提交路径：摆放、sourceFwIds（连线由此派生）、可撤销分组
 * 全部已在 core 的 op 里处理完；这里绝不自己构造 CanvasOp，也绝不绕过
 * `commitOps` 直接 applyOp——本仓踩过「同一动作两条路径导致撤销行为
 * 不一致」的坑（工具条删除曾绕过 onNodesDelete）。
 */

export interface DerivedGenerationSubmitterDeps {
  getRoot(): FrameNode
  /** host 的既有提交通道（renderer-host 的 commitOps）：applyOp + history.record。 */
  commitOps(ops: readonly CanvasOp[]): void
  /** core 拒绝构造 op 时回调（如 fwId 重复）；此时没有任何东西进 history。 */
  onError?(error: unknown): void
}

export interface DerivedGenerationSubmitter {
  /**
   * 以 `sourceFwId` 指向的 ai-image 节点为来源派生生成结果。
   * 单个输入提交 add-node op，多个输入提交单层 batch op（一次撤销整体回退）。
   * 返回 true 表示 op 已进入提交通道；false 表示未提交任何操作。
   */
  submit(sourceFwId: string, inputs: readonly DerivedGenerationInput[]): boolean
}

export function createDerivedGenerationSubmitter(
  deps: DerivedGenerationSubmitterDeps,
): DerivedGenerationSubmitter {
  return {
    submit(sourceFwId, inputs) {
      if (inputs.length === 0) return false
      const root = deps.getRoot()
      const source = findNodeById(root, sourceFwId)
      if (source === null || !isAiImageNode(source)) return false

      try {
        const op =
          inputs.length === 1
            ? createDerivedGenerationOp(root, source, inputs[0]!)
            : createDerivedGenerationBatchOp(root, source, inputs)
        deps.commitOps([op])
        return true
      } catch (error) {
        deps.onError?.(error)
        return false
      }
    },
  }
}

import { describe, expect, it } from 'vitest'
import { CORE_PACKAGE_NAME } from './index'

describe('core 包骨架', () => {
  it('导出包名常量', () => {
    expect(CORE_PACKAGE_NAME).toBe('@framewright/core')
  })
})

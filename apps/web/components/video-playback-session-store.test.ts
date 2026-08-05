import { createVideoPlaybackSessionWriteAction } from '@framewright/renderer-dom'
import { describe, expect, it } from 'vitest'
import { createVideoPlaybackSessionStore } from './video-playback-session-store'

describe('host 视频播放会话状态', () => {
  it('按节点保存 currentTime 与 paused，并通过既有 action 回调同步读取', () => {
    const store = createVideoPlaybackSessionStore()
    const state = { src: '/preview.mp4', currentTime: 4.25, paused: false }

    expect(store.handleAction('video-1', createVideoPlaybackSessionWriteAction(state))).toEqual({
      handled: true,
    })
    expect(store.handleAction('video-1', 'video-playback-session:read')).toEqual({
      handled: true,
      response: state,
    })
  })

  it('非视频会话 action 留给原有 onNodeAction 处理', () => {
    const store = createVideoPlaybackSessionStore()
    expect(store.handleAction('video-1', 'generate')).toEqual({ handled: false })
  })
})

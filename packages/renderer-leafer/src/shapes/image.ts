import { isImgNode } from '@framewright/core'
import { Rect } from 'leafer-ui'
import { toLeaferProps } from '../node-props'
import type { ShapeFactory } from './registry'

export function createImageShape(): ShapeFactory {
  return ({ node, position, size }) => {
    if (!isImgNode(node)) {
      throw new Error(`createImageShape 只接受 img，收到 ${node.fwType}`)
    }

    const geometry = toLeaferProps(node, position, size)
    if (node.src === '') {
      return new Rect({
        ...geometry,
        fill: '#DDDDDD',
        stroke: '#999999',
        strokeWidth: 1,
        dashPattern: [4, 4],
      })
    }

    const mode = node.fit === 'cover' ? 'cover' : node.fit === 'fill' ? 'stretch' : 'fit'
    return new Rect({
      ...geometry,
      fill: { type: 'image', url: node.src, mode },
    })
  }
}

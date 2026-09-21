// Unit tests for the browser download helper, driven with a fake document
// and spies on the object-URL functions. Run with `pnpm test:unit`.
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { downloadBytes } from './download.ts'

interface FakeAnchor {
  href: string
  download: string
  rel: string
  clicks: number
  attachedOnClick: boolean | undefined
  click(): void
  remove(): void
}

function fakeDocument(onClick?: () => void) {
  const attached = new Set<FakeAnchor>()
  const anchors: FakeAnchor[] = []
  const anchor: FakeAnchor = {
    href: '',
    download: '',
    rel: '',
    clicks: 0,
    attachedOnClick: undefined,
    click() {
      anchor.clicks += 1
      anchor.attachedOnClick = attached.has(anchor)
      onClick?.()
    },
    remove() {
      attached.delete(anchor)
    },
  }
  const document = {
    anchors,
    attached,
    createElement(tag: string) {
      assert.equal(tag, 'a')
      anchors.push(anchor)
      return anchor
    },
    body: {
      append(node: FakeAnchor) {
        attached.add(node)
      },
    },
  }
  return { document: document as unknown as Document, anchors, attached }
}

/** Run `fn` with `URL.createObjectURL`/`revokeObjectURL` recorded, then restore them. */
async function withObjectUrlSpies(fn: (spies: { created: Blob[]; revoked: string[]; urls: string[] }) => Promise<void> | void) {
  const original = { create: URL.createObjectURL, revoke: URL.revokeObjectURL }
  const spies = { created: [] as Blob[], revoked: [] as string[], urls: [] as string[] }
  URL.createObjectURL = (blob: Blob | MediaSource) => {
    spies.created.push(blob as Blob)
    const url = original.create.call(URL, blob)
    spies.urls.push(url)
    return url
  }
  URL.revokeObjectURL = (url: string) => {
    spies.revoked.push(url)
    original.revoke.call(URL, url)
  }
  try {
    await fn(spies)
  } finally {
    URL.createObjectURL = original.create
    URL.revokeObjectURL = original.revoke
  }
}

test('clicks an attached anchor whose download name and blob match the input, then cleans up', async () => {
  await withObjectUrlSpies(async (spies) => {
    const { document, anchors, attached } = fakeDocument()
    const bytes = new Uint8Array([78, 82, 82, 68, 48, 48, 48, 53])

    downloadBytes(bytes, 'registered.nrrd', { document })

    assert.equal(anchors.length, 1)
    const anchor = anchors[0]!
    assert.equal(anchor.download, 'registered.nrrd')
    assert.equal(anchor.rel, 'noopener')
    assert.equal(anchor.clicks, 1)
    assert.equal(anchor.attachedOnClick, true, 'anchor is in the document when clicked')
    assert.equal(attached.size, 0, 'anchor is removed afterwards')

    assert.equal(spies.created.length, 1)
    assert.equal(anchor.href, spies.urls[0])
    assert.match(anchor.href, /^blob:/)
    assert.deepEqual(spies.revoked, spies.urls)

    const blob = spies.created[0]!
    assert.equal(blob.type, 'application/octet-stream')
    assert.deepEqual(new Uint8Array(await blob.arrayBuffer()), bytes)
  })
})

test('copies the viewed window of a shared or oversized buffer into the blob', async () => {
  await withObjectUrlSpies(async (spies) => {
    const shared = new SharedArrayBuffer(6)
    new Uint8Array(shared).set([0, 1, 2, 3, 4, 5])
    const view = new Uint8Array(shared, 2, 3)

    downloadBytes(view, 'transform.h5', { document: fakeDocument().document })

    assert.deepEqual(Array.from(new Uint8Array(await spies.created[0]!.arrayBuffer())), [2, 3, 4])
  })
})

test('still removes the anchor and revokes the URL when the click throws', async () => {
  await withObjectUrlSpies((spies) => {
    const { document, attached } = fakeDocument(() => {
      throw new Error('blocked')
    })

    assert.throws(() => downloadBytes(new Uint8Array([1]), 'x.bin', { document }), /blocked/)
    assert.equal(attached.size, 0)
    assert.deepEqual(spies.revoked, spies.urls)
  })
})

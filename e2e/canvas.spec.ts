import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  // Each test starts from a clean board.
  await page.evaluate(async () => {
    for (const db of await indexedDB.databases()) if (db.name) indexedDB.deleteDatabase(db.name)
  })
  await page.reload()
  await expect(page.getByTestId('toolbar')).toBeVisible()
})

test('creates, edits and persists a text node', async ({ page }) => {
  await page.getByTestId('add-text').click()
  const body = page.getByTestId('text-node-body').first()
  await expect(body).toBeVisible()

  await body.dblclick()
  await page.keyboard.press('ControlOrMeta+A')
  await page.keyboard.type('persisted idea')
  await page.mouse.click(600, 600) // blur commits the edit

  // y-indexeddb writes each update to IndexedDB via an async transaction
  // triggered off the Yjs 'update' event (see node_modules/y-indexeddb):
  // the write is only *started* synchronously with the commit above, not
  // finished. Reloading immediately can race ahead of that transaction and
  // observe the pre-edit state. Give it a moment to land before reloading —
  // this still exercises real IndexedDB persistence end to end, just without
  // asserting on a coin flip.
  await page.waitForTimeout(300)
  await page.reload()
  await expect(page.getByText('persisted idea')).toBeVisible()
})

test('undo removes a created node and redo restores it', async ({ page }) => {
  await page.getByTestId('add-text').click()
  await expect(page.getByTestId('text-node-body')).toHaveCount(1)

  await page.getByTestId('undo').click()
  await expect(page.getByTestId('text-node-body')).toHaveCount(0)

  await page.getByTestId('redo').click()
  await expect(page.getByTestId('text-node-body')).toHaveCount(1)
})

test('connects two nodes with an edge', async ({ page }) => {
  await page.getByTestId('add-text').click()
  await page.mouse.click(600, 600) // deselect
  await page.getByTestId('add-text').click()

  // Separate the two nodes so they are distinguishable.
  const bodies = page.getByTestId('text-node-body')
  await expect(bodies).toHaveCount(2)
  await bodies.nth(1).hover()
  await page.mouse.down()
  await page.mouse.move(900, 500, { steps: 10 })
  await page.mouse.up()

  await page.getByTestId('tool-connect').click()
  await bodies.nth(0).hover()
  await page.mouse.down()
  await bodies.nth(1).hover()
  await page.mouse.up()

  await expect(page.locator('[data-edge-id]')).toHaveCount(1)
})

test('zooms about the viewport centre and reports the level', async ({ page }) => {
  await expect(page.getByTestId('zoom-level')).toHaveText('100%')
  await page.getByTestId('zoom-in').click()
  await expect(page.getByTestId('zoom-level')).toHaveText('120%')
})

test('deletes the selected node with the Delete key', async ({ page }) => {
  await page.getByTestId('add-text').click()
  await page.getByTestId('text-node-body').first().click()
  await page.keyboard.press('Escape')
  await page.keyboard.press('Delete')
  await expect(page.getByTestId('text-node-body')).toHaveCount(0)
})

test('pointercancel clears an in-flight marquee instead of leaving a ghost box', async ({ page }) => {
  // Start a marquee drag on empty canvas and leave it in flight (no pointerup).
  await page.mouse.move(300, 300)
  await page.mouse.down()
  await page.mouse.move(500, 450, { steps: 5 })
  await expect(page.getByTestId('marquee')).toBeVisible()

  // Simulate a touch/gesture interruption (a real device delivers
  // pointercancel instead of pointerup -- e.g. the browser's own gesture
  // recognizer taking over a two-finger scroll; per the Pointer Events spec,
  // no pointerup follows a pointercancel for that same interaction).
  // Playwright's mouse API has no "cancel" action, so dispatch the real
  // event directly.
  await page.evaluate(() => {
    const viewport = document.querySelector('[data-testid="viewport"]')
    viewport?.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, pointerId: 1 }))
  })

  // The marquee box must be gone *immediately* on cancel, before any further
  // pointer event -- real or synthetic. This must be checked before calling
  // page.mouse.up() below: a real pointerup is what a completed (not
  // cancelled) drag would send, and selectTool.onUp *also* clears the
  // marquee via that normal path when marqueeOrigin is still set. Checking
  // after an up would pass whether or not the pointercancel listener ever
  // attached, which is exactly the "passes either way" trap to avoid here.
  // (selectTool.onDown separately resets module-level state defensively on
  // the *next* pointer-down regardless of this fix, so that alone also
  // wouldn't distinguish a working handler from one that never attached --
  // this in-flight, pre-next-gesture check is what actually does.)
  await expect(page.getByTestId('marquee')).toHaveCount(0)

  // Only now release Playwright's own virtual mouse button, purely so later
  // actions in this test behave normally. By this point the app has already
  // cleared marqueeOrigin on the cancel above, so this is a no-op for
  // gesture state -- selectTool.onUp's `if (marqueeOrigin)` branch sees null
  // and does nothing.
  await page.mouse.up()

  // The gesture system should be fully usable again: a fresh marquee-select
  // and delete on a new node works exactly as normal.
  await page.getByTestId('add-text').click()
  await page.waitForTimeout(100)
  const nodeBox = await page.getByTestId('text-node-body').first().boundingBox()
  if (!nodeBox) throw new Error('expected node to be visible')
  await page.mouse.move(nodeBox.x - 20, nodeBox.y - 20)
  await page.mouse.down()
  await page.mouse.move(nodeBox.x + nodeBox.width + 20, nodeBox.y + nodeBox.height + 20, { steps: 5 })
  await page.mouse.up()
  await page.keyboard.press('Escape')
  await page.keyboard.press('Delete')
  await expect(page.getByTestId('text-node-body')).toHaveCount(0)
})

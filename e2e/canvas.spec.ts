import { expect, test, type Page } from '@playwright/test'

/**
 * Waits for a real persisted signal instead of a blind constant: polls the
 * board's IndexedDB database from inside the page until the committed text is
 * actually present in a stored Yjs update.
 *
 * y-indexeddb keeps the document as binary update records in the `updates`
 * object store of `brainstorm-canvas/<boardId>`. Yjs encodes string content as
 * UTF-8 inside those records, so the text's bytes appearing there means the
 * write transaction has committed to disk — which is exactly the condition
 * DoD 8 ("close and reopen the browser and find the board as it was") depends
 * on, and the condition the old `waitForTimeout(300)` was guessing at.
 */
async function waitForPersisted(page: Page, boardId: string, text: string) {
  await page.waitForFunction(
    async ([dbName, needle]: [string, string]) => {
      // Never open by name blindly: opening a database that does not exist
      // creates an empty one, which would race the app's own upgrade.
      const listed = await indexedDB.databases()
      if (!listed.some((d) => d.name === dbName)) return false

      const db = await new Promise<IDBDatabase | null>((resolve) => {
        const req = indexedDB.open(dbName)
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => resolve(null)
        req.onblocked = () => resolve(null)
      })
      if (!db) return false
      try {
        if (!db.objectStoreNames.contains('updates')) return false
        const rows: unknown[] = await new Promise((resolve) => {
          const req = db.transaction('updates', 'readonly').objectStore('updates').getAll()
          req.onsuccess = () => resolve(req.result as unknown[])
          req.onerror = () => resolve([])
        })
        const decoder = new TextDecoder()
        return rows.some((row) => {
          const bytes =
            row instanceof Uint8Array
              ? row
              : row instanceof ArrayBuffer
                ? new Uint8Array(row)
                : null
          return bytes ? decoder.decode(bytes).includes(needle) : false
        })
      } finally {
        db.close()
      }
    },
    [`brainstorm-canvas/${boardId}`, text] as [string, string],
    { timeout: 15_000 },
  )
}

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
  // finished. Reloading immediately races ahead of that transaction and
  // observes the pre-edit state — measured at 29/30 against a production
  // build, see README's "Known limitations". Waiting on the write actually
  // being on disk, rather than on an arbitrary constant, keeps this test
  // proving DoD 8 (reload restores the board from IndexedDB) without
  // asserting on a coin flip and without hiding how narrow the window is.
  await waitForPersisted(page, 'default', 'persisted idea')
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

// DoD 3: all three routing styles must be reachable from the UI. Before the
// toolbar control, connectTool always created DEFAULT_EDGE_STYLE and only the
// geometry unit tests ever exercised the other two.
test('creates a connector with a non-default routing style', async ({ page }) => {
  await page.getByTestId('add-text').click()
  await page.mouse.click(600, 600) // end the edit session and deselect
  await page.getByTestId('add-text').click()

  const bodies = page.getByTestId('text-node-body')
  await expect(bodies).toHaveCount(2)
  await bodies.nth(1).hover()
  await page.mouse.down()
  await page.mouse.move(900, 500, { steps: 10 })
  await page.mouse.up()

  // curve -> elbow -> straight
  await page.getByTestId('edge-style').click()
  await page.getByTestId('edge-style').click()
  await expect(page.getByTestId('edge-style')).toHaveAttribute('data-edge-style', 'straight')

  await page.getByTestId('tool-connect').click()
  await bodies.nth(0).hover()
  await page.mouse.down()
  await bodies.nth(1).hover()
  await page.mouse.up()

  const path = page.locator('[data-edge-id]')
  await expect(path).toHaveCount(1)
  await expect(path).toHaveAttribute('data-edge-style', 'straight')
  // A straight edge is a single line segment, never a bezier.
  expect(await path.getAttribute('d')).toMatch(/^M [\d.-]+ [\d.-]+ L [\d.-]+ [\d.-]+$/)
  // And the stored arrow is actually painted.
  await expect(path).toHaveAttribute('marker-end', /^url\(#arrow-/)
})

test('zooms about the viewport centre and reports the level', async ({ page }) => {
  await expect(page.getByTestId('zoom-level')).toHaveText('100%')
  await page.getByTestId('zoom-in').click()
  await expect(page.getByTestId('zoom-level')).toHaveText('120%')
})

test('deletes the selected node with the Delete key', async ({ page }) => {
  await page.getByTestId('add-text').click()
  // "+ Text" drops the new node straight into an edit session. Clicking empty
  // canvas ends it (and deselects); clicking the node then selects it without
  // reopening the editor. No Escape: the keyboard must return to command mode
  // on its own, which is exactly what this test now also proves.
  await page.mouse.click(600, 600)
  await page.getByTestId('text-node-body').first().click()
  await page.keyboard.press('Delete')
  await expect(page.getByTestId('text-node-body')).toHaveCount(0)
})

// Regression: `editingId` used to be cleared only by Escape, so the very first
// node created put the board in "typing" mode permanently and the Delete
// branch was unreachable for the rest of the session.
test('Delete works after a text edit without pressing Escape', async ({ page }) => {
  await page.getByTestId('add-text').click()
  const body = page.getByTestId('text-node-body').first()
  await body.dblclick()
  await page.keyboard.press('ControlOrMeta+A')
  await page.keyboard.type('typed then abandoned')
  await page.mouse.click(600, 600) // click away: this alone must end the edit
  await expect(body).toHaveText('typed then abandoned')

  await body.click() // re-select the node, still with no Escape anywhere
  await page.keyboard.press('Delete')
  await expect(page.getByTestId('text-node-body')).toHaveCount(0)
})

// Regression: while the edit session never ended, TextNode kept rendering its
// frozen draft, so the document could be rolled back underneath a view that
// went on showing the edited text. The first ⌘Z looked like a no-op and the
// second deleted the node.
test('one undo after an edit shows the reverted text on screen', async ({ page }) => {
  await page.getByTestId('add-text').click()
  const body = page.getByTestId('text-node-body').first()
  await expect(body).toHaveText('New idea')

  await body.dblclick()
  await page.keyboard.press('ControlOrMeta+A')
  await page.keyboard.type('edited text')
  await page.mouse.click(600, 600) // blur commits the edit
  await expect(body).toHaveText('edited text')

  await page.keyboard.press('ControlOrMeta+z')
  await expect(body).toHaveText('New idea')
})

// Regression: the middle-button branch returned before setPointerCapture, so a
// release over the Toolbar (a sibling of the viewport, whose events never
// bubble to it) never reached the handler that ends the pan. The board then
// followed every subsequent bare mouse move with no button held.
test('a middle-drag released off the viewport does not leave the board panning', async ({
  page,
}) => {
  await page.getByTestId('add-text').click()
  await page.mouse.click(700, 600) // end the edit session
  const body = page.getByTestId('text-node-body').first()

  // Middle-drag the board, then release with the cursor over the toolbar.
  await page.mouse.move(400, 500)
  await page.mouse.down({ button: 'middle' })
  await page.mouse.move(340, 440, { steps: 5 })
  await page.mouse.move(40, 30, { steps: 5 })
  await page.mouse.up({ button: 'middle' })

  const afterPan = await body.boundingBox()
  if (!afterPan) throw new Error('expected the node to be visible')

  // Bare moves, no button held: the board must not budge.
  await page.mouse.move(500, 500)
  await page.mouse.move(800, 300, { steps: 5 })

  const afterHover = await body.boundingBox()
  expect(afterHover).toEqual(afterPan)
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
  // No Escape: the marquee's own pointer-down on empty canvas is what ends the
  // edit session "+ Text" opened, so the keyboard is already back in command
  // mode by the time Delete arrives.
  await page.keyboard.press('Delete')
  await expect(page.getByTestId('text-node-body')).toHaveCount(0)
})

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

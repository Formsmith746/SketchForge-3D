async (page) => {
  await page.reload();
  await page.waitForTimeout(1000);
  await page.keyboard.press('Control+a');
  await page.waitForTimeout(700);
  await page.evaluate(() => {
    window.__keyboardSaveCount = 0;
    const originalPut = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function(value, ...args) {
      if (this.name === 'projectShapes' && value.skfPackage) window.__keyboardSaveCount++;
      return originalPut.call(this, value, ...args);
    };
  });
  const state = async () => JSON.parse(await page.locator('[data-codex-state]').textContent());
  const before = await state();
  for (let i = 0; i < 31; i++) {
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(30);
  }
  const held = await state();
  const savesDuringHold = await page.evaluate(() => window.__keyboardSaveCount);
  await page.keyboard.up('ArrowRight');
  await page.waitForTimeout(700);
  const released = await state();
  const savesAfterRelease = await page.evaluate(() => window.__keyboardSaveCount);
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(200);
  const undone = await state();
  await page.keyboard.press('Control+y');
  await page.waitForTimeout(200);
  const redone = await state();
  if (savesDuringHold !== 0 || savesAfterRelease !== 1 || held.shapes[0].x !== before.shapes[0].x + 31
      || undone.shapes[0].x !== before.shapes[0].x || redone.shapes[0].x !== held.shapes[0].x) {
    throw new Error('Held arrow movement was not one save and one reversible undo step');
  }
  await page.keyboard.down('Control');
  for (let i = 0; i < 11; i++) {
    await page.keyboard.down('ArrowUp');
    await page.waitForTimeout(30);
  }
  await page.keyboard.up('ArrowUp');
  await page.keyboard.up('Control');
  const raised = await state();
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(150);
  const unraised = await state();
  if (raised.shapes[0].elevation !== before.shapes[0].elevation + 11
      || unraised.shapes[0].elevation !== before.shapes[0].elevation) throw new Error('Raise hold did not undo as one action');
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight');
  const tapped = await state();
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(150);
  const untapped = await state();
  if (untapped.shapes[0].x !== tapped.shapes[0].x - 1) throw new Error('Discrete taps were merged');
  await page.keyboard.down('ArrowLeft');
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await page.keyboard.down('ArrowLeft');
  await page.keyboard.up('ArrowLeft');
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(150);
  const unblurred = await state();
  if (unblurred.shapes[0].x !== untapped.shapes[0].x) throw new Error('Interrupted hold did not finalize correctly');
  return {savesDuringHold, savesAfterRelease,
    holdX: [before, held, released, undone, redone].map((entry) => entry.shapes[0].x),
    raiseY: [raised, unraised].map((entry) => entry.shapes[0].elevation),
    tapX: [tapped, untapped].map((entry) => entry.shapes[0].x),
    blurUndoX: unblurred.shapes[0].x};
}

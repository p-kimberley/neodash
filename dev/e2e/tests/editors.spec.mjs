// Report settings editors: text fields that suggest field, label and property names.
import { test, expect } from '@playwright/test';
import { SALES, SINK, card, expectNoErrors, openPage, trackErrors } from './helpers.mjs';

test('style rules: the field name suggests the report fields', async ({ page }) => {
  const errors = trackErrors(page);
  await openPage(page, SALES);
  const report = card(page, 'Monthly revenue');
  await report.getByRole('button', { name: 'Settings' }).click();
  await report.getByRole('button', { name: 'Set rule-based styling' }).click();
  const dialog = page.getByRole('dialog');
  if ((await dialog.getByRole('combobox', { name: 'Field name' }).count()) === 0) {
    await dialog.getByRole('button', { name: 'Add', exact: true }).click();
  }
  const field = dialog.getByRole('combobox', { name: 'Field name' }).first();
  await field.fill('rev');
  await expect(page.getByRole('option', { name: 'Revenue' })).toBeVisible();
  // Arrow keys and Enter pick a suggestion; Escape closes the list, not the dialog.
  await field.press('ArrowDown');
  await field.press('Enter');
  await expect(field).toHaveValue('Revenue');
  await field.fill('Mo');
  await field.press('Escape');
  await expect(page.getByRole('option')).toHaveCount(0);
  await expect(dialog).toBeVisible();
  await expectNoErrors(page, errors);
});

test('report actions: the value field suggests and takes typed text', async ({ page }) => {
  const errors = trackErrors(page);
  await openPage(page, SALES, 1);
  const report = card(page, 'Order history');
  await report.getByRole('button', { name: 'Settings' }).click();
  await report.getByRole('button', { name: 'Set report actions' }).click();
  const dialog = page.getByRole('dialog');
  if ((await dialog.getByRole('combobox', { name: 'Value' }).count()) === 0) {
    await dialog.getByRole('button', { name: 'Add', exact: true }).click();
  }
  const value = dialog.getByRole('combobox', { name: 'Value' }).first();
  await value.fill('some text');
  await expect(value).toHaveValue('some text');
  await expectNoErrors(page, errors);
});

test('parameter report: the label is searched in the database and picked', async ({ page }) => {
  const errors = trackErrors(page);
  await openPage(page, SINK, 5);
  const report = card(page, 'Node property');
  await report.getByRole('button', { name: 'Settings' }).click();
  const label = report.getByRole('combobox', { name: 'Node Label' });
  const before = await label.inputValue();
  await label.fill('Prod');
  const option = page.getByRole('option', { name: 'Product', exact: true });
  await expect(option).toBeVisible();
  await option.click();
  await expect(label).toHaveValue('Product');
  // Typed text that isn't picked doesn't change the setting.
  await label.fill('Pro');
  await label.blur();
  await expect(label).toHaveValue('Product');
  expect(before).not.toBe('');
  await expectNoErrors(page, errors);
});

test('colour scheme select: names with swatches', async ({ page }) => {
  const errors = trackErrors(page);
  await openPage(page, SINK, 1);
  const report = card(page, 'Revenue by category and segment (grouped)');
  await report.getByRole('button', { name: 'Settings' }).click();
  await report.getByText('Advanced settings').click();
  const select = report.getByRole('combobox', { name: 'Color Scheme' });
  await select.click();
  const options = page.getByRole('option');
  await expect(options.first()).toBeVisible();
  const names = await options.allInnerTexts();
  expect(names.join('|')).not.toContain('[object Object]');
  expect(names.map((n) => n.trim())).toContain('pastel1');
  // Each scheme shows its colours beside its name.
  await expect(page.getByRole('option', { name: 'pastel1' }).locator('.nd-scheme-swatches > span')).toHaveCount(9);
  await page.screenshot({ path: `.scratch/scheme-select-${test.info().project.name}.png` });
  await page.keyboard.press('Escape');
  await expectNoErrors(page, errors);
});

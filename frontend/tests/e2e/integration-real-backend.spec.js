// End-to-end integration tests executed against a real backend instance.
// Responsibility: validate UI-to-backend integration behavior under realistic runtime conditions.

import { expect, test } from "@playwright/test";

test("real backend: tracking add and undo work", async ({ page }) => {
  await page.goto("/");

  const firstTrackButton = page.locator('[data-testid^="track-person-"]').first();
  await expect(firstTrackButton).toBeVisible();
  await firstTrackButton.click();

  await expect(page.getByTestId("tracking-add-event-button")).toBeVisible();
  const locationSelect = page.locator(".tracking-form select").first();
  const locationOptionCount = await locationSelect.locator("option").count();
  if (locationOptionCount > 1) {
    await locationSelect.selectOption({ index: 1 });
  }
  await page.getByTestId("tracking-add-event-button").click();

  await expect(page.locator(".tracking-event-row")).toHaveCount(1);
  const undoButton = page.getByTestId("tracking-undo-button");
  await expect(undoButton).toBeEnabled();
  await undoButton.click();

  await expect(page.locator(".tracking-event-row")).toHaveCount(0);
});

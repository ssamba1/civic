import { expect, test } from "playwright/test";

/**
 * Help-assistant widget smoke (help-assistant plan Task 12). The widget is
 * flag-gated (NEXT_PUBLIC_HELP_ASSISTANT); when the flag is off the launcher
 * must be absent, that's asserted, not skipped, so both deploy shapes have a
 * passing, meaningful test.
 */
test("landing renders and the assistant launcher matches the flag", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/Civic/);

  const launcher = page.getByRole("button", { name: /assistant|help/i });
  const flagOn = process.env.NEXT_PUBLIC_HELP_ASSISTANT === "1";
  if (flagOn) {
    await expect(launcher).toBeVisible();
  } else {
    await expect(launcher).toHaveCount(0);
  }
});

test("assistant opens, accepts input, and streams a reply shell", async ({
  page,
}) => {
  test.skip(
    process.env.NEXT_PUBLIC_HELP_ASSISTANT !== "1",
    "assistant flag off in this environment",
  );

  await page.goto("/");
  await page.getByRole("button", { name: /assistant|help/i }).click();

  const input = page.getByRole("textbox");
  await expect(input).toBeVisible();
  await input.fill("How do I report a pothole?");
  await input.press("Enter");

  // The user's message must render immediately (optimistic echo). The model
  // reply itself depends on a live Gemini key and is not asserted here.
  await expect(page.getByText("How do I report a pothole?")).toBeVisible();
});

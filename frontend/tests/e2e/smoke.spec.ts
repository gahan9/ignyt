import { expect, test } from "@playwright/test";

/**
 * Smoke: the app boots, auth-gate renders, and basic validation works
 * without Firebase.
 *
 * We don't complete sign-in here (that needs Firebase + a test user). What
 * this guards against is the regression where a build-time bug (bad import,
 * bundler misconfig, missing env var handling) lands main and nobody can
 * even see the sign-in page.
 */

test.describe("app shell smoke", () => {
  test("loads and shows the sign-in gate", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: /sign in to your account/i }),
    ).toBeVisible();
    await expect(page.getByLabel(/^email$/i)).toBeVisible();
    await expect(page.getByLabel(/^password$/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /^sign in$/i })).toBeEnabled();
  });

  test("client-side validation blocks empty submit", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /^sign in$/i }).click();
    await expect(page.getByText(/email is required/i)).toBeVisible();
    await expect(page.getByText(/password is required/i)).toBeVisible();
  });

  test("client-side validation rejects invalid email", async ({ page }) => {
    await page.goto("/");
    await page.getByLabel(/^email$/i).fill("not-an-email");
    await page.getByLabel(/^password$/i).fill("hunter2");
    await page.getByRole("button", { name: /^sign in$/i }).click();
    await expect(page.getByText(/valid email address/i)).toBeVisible();
  });

  test("password eye toggles input type", async ({ page }) => {
    await page.goto("/");
    const pw = page.getByLabel(/^password$/i);
    await pw.fill("hunter2");
    await expect(pw).toHaveAttribute("type", "password");
    await page.getByRole("button", { name: /show password/i }).click();
    await expect(pw).toHaveAttribute("type", "text");
  });

  test("toggles between sign-in and sign-up modes", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /create one/i }).click();
    await expect(
      page.getByRole("heading", { name: /create your account/i }),
    ).toBeVisible();
    await expect(page.getByLabel(/confirm password/i)).toBeVisible();
  });

  test("unauthenticated users cannot reach /admin directly", async ({ page }) => {
    await page.goto("/admin");
    // Auth gate keeps them on the sign-in form regardless of URL.
    await expect(
      page.getByRole("heading", { name: /sign in to your account/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /admin.*attendees/i }),
    ).toHaveCount(0);
  });
});

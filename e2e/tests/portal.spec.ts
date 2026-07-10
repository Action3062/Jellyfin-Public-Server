import { expect, test, type BrowserContext, type Page } from "@playwright/test";

const API = "http://127.0.0.1:4000";

function uniqueUser(prefix: string) {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
}

/**
 * Unique per run: redeemed voucher codes are persisted, so a reused code
 * would 409 on the next run. The last two characters must be digits — the
 * mock Azteco client derives the EUR value from them ("01" → €50, "02" → €75).
 */
function uniqueVoucher(valueDigits: "00" | "01" | "02" | "03") {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ456789";
  let body = "E";
  for (let i = 0; i < 13; i += 1) body += alphabet[Math.floor(Math.random() * alphabet.length)];
  const raw = body + valueDigits;
  return raw.replace(/(.{4})/g, "$1-").replace(/-$/, "");
}

async function simulatePayment(page: Page, orderId: string) {
  const res = await page.request.post(`${API}/pay/api/dev/simulate-payment`, {
    data: { order_id: orderId }
  });
  expect(res.ok()).toBeTruthy();
}

/**
 * The checkout tries window.open for the invoice, which Chromium may block
 * when the preceding fetch outlives the user activation — the order page's
 * explicit invoice link is the designed fallback. Tolerate both outcomes.
 */
function maybePopup(context: BrowserContext) {
  return context.waitForEvent("page", { timeout: 5_000 }).catch(() => null);
}

function orderIdFromUrl(page: Page) {
  const match = page.url().match(/\/order\/([^/#?]+)/);
  expect(match, `expected an order URL, got ${page.url()}`).toBeTruthy();
  return match![1];
}

test.describe("landing page", () => {
  test("renders German by default and switches to English", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Dein privates Kino.");
    await expect(page.locator(".stats .stat").first()).toContainText("2000+");

    await page.getByRole("group", { name: "Language" }).getByRole("button", { name: "EN" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Your private cinema.");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");

    // Language choice persists onto the checkout page.
    await page.getByRole("link", { name: "Become a member" }).first().click();
    await expect(page.getByRole("button", { name: "Pay with Crypto" })).toBeVisible();
  });

  test("plan cards deep-link into the checkout with the plan preselected", async ({ page }) => {
    await page.goto("/");
    await page.locator(".plan-card.popular").getByRole("link").click();
    await expect(page).toHaveURL(/\/pay\?plan=hd_12m/);
    await expect(page.locator(".dur-grid .choice.selected")).toContainText("12");
  });
});

test.describe("crypto checkout", () => {
  test("existing member: pay, get provisioned, see active dashboard", async ({ page, context }) => {
    const username = uniqueUser("alice");
    await page.goto("/pay?plan=hd_12m");

    await page.getByLabel(/Jellyfin-Benutzername/).fill(username);
    await expect(page.locator(".hint.ok")).toBeVisible(); // mock jfa-go: user "exists"

    // The yearly plan is Plex-eligible, so the Plex field must appear.
    await expect(page.getByLabel(/Plex-Username/)).toBeVisible();

    const popupPromise = maybePopup(context);
    await page.getByRole("button", { name: /Mit Crypto bezahlen/ }).click();
    await expect(page).toHaveURL(/\/order\/np_/);
    await (await popupPromise)?.close();

    const orderId = orderIdFromUrl(page);
    await expect(page.getByTestId("step-payment")).toContainText("Warten auf Zahlungseingang");
    await expect(page.getByTestId("claim-card")).toContainText("Zugangslink");

    await simulatePayment(page, orderId);
    await page.reload();
    await expect(page.getByTestId("step-payment")).toContainText("Zahlung bestätigt");
    await expect(page.getByTestId("step-activation")).toContainText("Dein Zugang ist aktiv");

    await page.getByRole("link", { name: "Zum Dashboard" }).click();
    await expect(page.getByTestId("dashboard-status")).toBeVisible();
    await expect(page.getByTestId("dashboard-status")).toContainText("Aktiv");
    await expect(page.getByTestId("expires-at")).not.toHaveText("—");
    await expect(page.locator(".history-table tr")).toHaveCount(1);
  });

  test("new member: pay and receive a registration invite link", async ({ page, context }) => {
    await page.goto("/pay?plan=hd_1m");
    await page.getByRole("radio", { name: /Ich bin neu hier/ }).click();
    await expect(page.getByText(/Einladungslink/).first()).toBeVisible();

    const popupPromise = maybePopup(context);
    await page.getByRole("button", { name: /Mit Crypto bezahlen/ }).click();
    await expect(page).toHaveURL(/\/order\/np_/);
    await (await popupPromise)?.close();

    const orderId = orderIdFromUrl(page);
    await simulatePayment(page, orderId);
    await page.reload();

    await expect(page.getByTestId("step-payment")).toContainText("Zahlung bestätigt");
    const invite = page.getByTestId("invite-link");
    await expect(invite).toBeVisible();
    await expect(invite).toHaveAttribute("href", new RegExp(`/invite/mock-${orderId}`));

    // Dashboard reports the registration as still pending.
    await page.getByRole("link", { name: "Zum Dashboard" }).click();
    await expect(page.getByTestId("dashboard-unregistered")).toContainText("Registrierung");
  });

  test("mock invoice page can drive the payment to finished while the order page polls", async ({ page, context }) => {
    const username = uniqueUser("bob");
    await page.goto("/pay?plan=hd_3m");
    await page.getByLabel(/Jellyfin-Benutzername/).fill(username);
    await expect(page.locator(".hint.ok")).toBeVisible();

    const popupPromise = maybePopup(context);
    await page.getByRole("button", { name: /Mit Crypto bezahlen/ }).click();
    await expect(page).toHaveURL(/\/order\/np_/);
    await (await popupPromise)?.close();

    // Open the invoice deliberately via the order page's fallback link.
    const invoiceHref = await page.getByRole("link", { name: /Zahlungsseite öffnen/ }).getAttribute("href");
    expect(invoiceHref).toContain("/pay/mock-invoice/");
    const invoiceTab = await context.newPage();
    await invoiceTab.goto(invoiceHref!);

    const [simulateResponse] = await Promise.all([
      invoiceTab.waitForResponse((res) => res.url().includes("/dev/simulate-payment")),
      invoiceTab.getByTestId("simulate-payment").click()
    ]);
    expect(simulateResponse.ok()).toBeTruthy();
    await expect(invoiceTab.locator(".status.success")).toBeVisible();
    await invoiceTab.close();

    // The order page discovers the state change through its own polling.
    await expect(page.getByTestId("step-activation")).toContainText("Dein Zugang ist aktiv", { timeout: 30_000 });
  });
});

test.describe("azteco checkout", () => {
  test("existing member redeems a voucher and is provisioned instantly", async ({ page }) => {
    const username = uniqueUser("carol");
    await page.goto("/pay");
    await page.getByRole("button", { name: /Azteco/ }).click();
    await page.getByLabel(/Gutschein-Code 1/).fill(uniqueVoucher("01")); // mock: €50
    await page.getByLabel(/Jellyfin-Benutzername/).fill(username);
    await expect(page.locator(".hint.ok")).toBeVisible();

    await page.getByRole("button", { name: /Einlösen & Aktivieren/ }).click();
    await expect(page).toHaveURL(/\/order\/az_/);
    await expect(page.getByTestId("step-payment")).toContainText("Zahlung bestätigt");
    await expect(page.getByTestId("step-activation")).toContainText("Dein Zugang ist aktiv");
  });

  test("new member sees only one voucher field and gets an invite", async ({ page }) => {
    await page.goto("/pay");
    await page.getByRole("button", { name: /Azteco/ }).click();
    await page.getByRole("radio", { name: /Ich bin neu hier/ }).click();
    await expect(page.getByLabel(/Gutschein-Code 2/)).toHaveCount(0);

    await page.getByLabel(/Gutschein-Code 1/).fill(uniqueVoucher("02")); // mock: €75
    await page.getByRole("button", { name: /Einlösen & Aktivieren/ }).click();
    await expect(page).toHaveURL(/\/order\/az_/);
    await expect(page.getByTestId("invite-link")).toBeVisible();
  });
});

test.describe("dashboard", () => {
  test("rejects an unknown access key", async ({ page }) => {
    await page.goto("/dashboard");
    await page.getByLabel(/Zugangsschlüssel/).fill("definitely-not-a-real-token-123");
    await page.getByRole("button", { name: /Status prüfen/ }).click();
    await expect(page.locator(".status.error")).toContainText("Kein Zugang");
  });
});

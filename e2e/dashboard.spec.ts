import { expect, test } from "@playwright/test";
import { mkdir, readFile } from "node:fs/promises";

test("edit the synthetic example, compare scenarios and export results", async ({
  page,
}) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/");
  await expect(page.getByText("Synthetic demo data")).toBeVisible();
  await page.getByLabel("Arrivals per hour 6 am – 12 pm").fill("25");
  await page.getByLabel("Intervention").selectOption("beds");
  await page.getByRole("button", { name: "Run simulation" }).click();
  await page.getByRole("slider", { name: "Inspect simulation hour" }).fill("3");
  const hourRow = page.locator(".chart-data tbody tr").nth(3);
  const hour = (await hourRow.locator("th").textContent())!.trim();
  await expect(page.locator(".flow-inspector")).toContainText(
    `Inspect hour ${hour}`,
  );
  const queue = await hourRow.locator("td").nth(2).textContent();
  await expect(
    page.locator(".pathway-stage").first().locator(".stage-values strong"),
  ).toHaveText(queue!.trim());
  await expect(page.locator(".selected-hour-line")).toHaveAttribute(
    "aria-label",
    `Selected hour ${hour}`,
  );
  await page.getByRole("slider", { name: "Inspect simulation hour" }).focus();
  await page.keyboard.press("ArrowRight");
  const nextHour = (await page
    .locator(".chart-data tbody tr")
    .nth(4)
    .locator("th")
    .textContent())!.trim();
  await expect(page.locator(".selected-hour-line")).toHaveAttribute(
    "aria-label",
    `Selected hour ${nextHour}`,
  );
  const chart = page.locator(".flow-chart");
  const bounds = (await chart.boundingBox())!;
  await chart.click({
    position: { x: bounds.width * 0.75, y: bounds.height / 2 },
  });
  const clickedIndex = Number(
    await page
      .getByRole("slider", { name: "Inspect simulation hour" })
      .inputValue(),
  );
  expect(clickedIndex).toBeGreaterThan(4);
  const clickedHour = (await page
    .locator(".chart-data tbody tr")
    .nth(clickedIndex)
    .locator("th")
    .textContent())!.trim();
  await expect(page.locator(".selected-hour-line")).toHaveAttribute(
    "aria-label",
    `Selected hour ${clickedHour}`,
  );
  await expect(
    page.getByText(/Results from 24 independent replications/),
  ).toBeVisible({ timeout: 30_000 });
  await expect(
    page.locator(".compare-columns small").filter({ hasText: "INTERVENTION" }),
  ).toBeVisible();
  await expect(page.locator(".compare-columns strong").first()).toHaveText(
    /\d+ min/,
  );
  await mkdir("test-results", { recursive: true });
  await page.screenshot({ path: "test-results/desktop.png", fullPage: true });
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "JSON" }).click();
  const jsonDownload = await download;
  expect(jsonDownload.suggestedFilename()).toBe("hospital-twin-results.json");
  const jsonPath = await jsonDownload.path();
  const json = JSON.parse(await readFile(jsonPath!, "utf8")) as {
    baseline: { source: string; scenario: { seed: number } };
  };
  expect(json.baseline.source).toBe("synthetic");
  expect(json.baseline.scenario.seed).toBe(41721);
  const csvDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "CSV" }).click();
  const csvPath = await (await csvDownload).path();
  const csv = await readFile(csvPath!, "utf8");
  expect(csv).toContain("scenario configuration");
  expect(csv).toContain("Synthetic assumptions only");
  expect(pageErrors).toEqual([]);
});

test("scenario assumptions remain available on a mobile screen", async ({
  page,
}) => {
  await page.setViewportSize({ width: 720, height: 900 });
  await page.goto("/");
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(720);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Scenario assumptions" }),
  ).toBeVisible();
  await expect(page.getByLabel("ED beds")).toBeVisible();
  await page.getByRole("button", { name: "Run simulation" }).click();
  await expect(
    page.getByText(/Results from 24 independent replications/),
  ).toBeVisible({ timeout: 30_000 });
  await mkdir("test-results", { recursive: true });
  await page.screenshot({ path: "test-results/mobile.png", fullPage: true });
});

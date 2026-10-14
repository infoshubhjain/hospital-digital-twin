import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("edit the synthetic example, compare scenarios and export results", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByText("Synthetic demo data")).toBeVisible();
  await page.getByLabel("Arrivals per hour 6 am – 12 pm").fill("25");
  await page.getByLabel("Intervention").selectOption("beds");
  await page.getByRole("button", { name: "Run simulation" }).click();
  await expect(
    page.getByText(/Results from 24 independent replications/),
  ).toBeVisible({ timeout: 30_000 });
  await expect(
    page.locator(".compare-columns small").filter({ hasText: "INTERVENTION" }),
  ).toBeVisible();
  await expect(page.locator(".compare-columns strong").first()).toHaveText(
    /\d+ min/,
  );
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
});

test("scenario assumptions remain available on a mobile screen", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Scenario assumptions" }),
  ).toBeVisible();
  await expect(page.getByLabel("ED beds")).toBeVisible();
});

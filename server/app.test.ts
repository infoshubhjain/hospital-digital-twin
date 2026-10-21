import { afterEach, describe, expect, it } from "vitest";
import type { Server } from "node:http";
import { createApp } from "./app.js";
import { demoScenario } from "../shared/model.js";

let server: Server;
const originalProxyHops = process.env.TRUST_PROXY_HOPS;
const originalVercel = process.env.VERCEL;
async function endpoint() {
  server = createApp().listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  return `http://127.0.0.1:${(server.address() as { port: number }).port}`;
}
afterEach(() => {
  server?.close();
  if (originalProxyHops === undefined) delete process.env.TRUST_PROXY_HOPS;
  else process.env.TRUST_PROXY_HOPS = originalProxyHops;
  if (originalVercel === undefined) delete process.env.VERCEL;
  else process.env.VERCEL = originalVercel;
});

describe("simulation API", () => {
  it("serves health, rejects invalid assumptions, runs simulations, and returns JSON for unknown API routes", async () => {
    const base = await endpoint();
    const health = await fetch(`${base}/api/health`);
    expect(((await health.json()) as { status: string }).status).toBe("ok");
    expect(health.headers.get("content-security-policy")).toContain("default-src 'self'");
    expect(health.headers.get("x-content-type-options")).toBe("nosniff");
    const invalid = await fetch(`${base}/api/simulations`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...demoScenario,
        capacities: { ...demoScenario.capacities, edBeds: 0 },
      }),
    });
    expect(invalid.status).toBe(400);
    const tooLarge = await fetch(`${base}/api/simulations`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...demoScenario,
        arrivalRates: [80, 80, 80, 80],
        horizonHours: 168,
        warmupHours: 0,
        replications: 100,
      }),
    });
    expect(tooLarge.status).toBe(422);
    const oversized = await fetch(`${base}/api/simulations`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ payload: "x".repeat(70_000) }),
    });
    expect(oversized.status).toBe(413);
    const response = await fetch(`${base}/api/simulations`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...demoScenario,
        horizonHours: 6,
        warmupHours: 0,
        replications: 2,
      }),
    });
    expect(response.status).toBe(201);
    expect(response.headers.get("content-type")).toContain("application/json");
    const unknown = await fetch(`${base}/api/does-not-exist`);
    expect(unknown.status).toBe(404);
    expect(unknown.headers.get("content-type")).toContain("application/json");
    expect(await unknown.json()).toEqual({ error: "API route not found." });
  });

  it("returns 404 instead of the app page for a missing asset", async () => {
    const base = await endpoint();
    const missing = await fetch(`${base}/assets/not-a-real-bundle.js`);
    expect(missing.status).toBe(404);
    expect(await missing.text()).not.toContain("<!doctype html>");
  });

  it("applies the run limit to the forwarded client IP when proxy trust is configured", async () => {
    process.env.TRUST_PROXY_HOPS = "2";
    const base = await endpoint();
    const request = (ip: string) => fetch(`${base}/api/simulations`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": ip },
      body: "{}",
    });
    for (let i = 0; i < 20; i++) expect((await request("192.0.2.10, 203.0.113.1")).status).toBe(400);
    expect((await request("192.0.2.10, 203.0.113.1")).status).toBe(429);
    expect((await request("192.0.2.11, 203.0.113.1")).status).toBe(400);
  });

  it("uses Vercel's sanitized client IP for per-client run limits", async () => {
    process.env.VERCEL = "1";
    process.env.TRUST_PROXY_HOPS = "0";
    const base = await endpoint();
    const request = (ip: string) => fetch(`${base}/api/simulations`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": ip },
      body: "{}",
    });
    for (let i = 0; i < 20; i++) expect((await request("192.0.2.20")).status).toBe(400);
    expect((await request("192.0.2.20")).status).toBe(429);
    expect((await request("192.0.2.21")).status).toBe(400);
  });
});

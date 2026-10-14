import { afterEach, describe, expect, it } from "vitest";
import type { Server } from "node:http";
import { createApp } from "./app.js";
import { demoScenario } from "../shared/model.js";

let server: Server;
async function endpoint() {
  server = createApp().listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  return `http://127.0.0.1:${(server.address() as { port: number }).port}`;
}
afterEach(() => {
  server?.close();
});

describe("simulation API", () => {
  it("serves health, rejects invalid assumptions, runs and retrieves results", async () => {
    const base = await endpoint();
    expect(
      ((await (await fetch(`${base}/api/health`)).json()) as { status: string })
        .status,
    ).toBe("ok");
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
    const result = (await response.json()) as { id: string };
    const stored = await fetch(`${base}/api/simulations/${result.id}`);
    expect(((await stored.json()) as { id: string }).id).toBe(result.id);
    expect((await fetch(`${base}/api/simulations/missing`)).status).toBe(404);
  });
});

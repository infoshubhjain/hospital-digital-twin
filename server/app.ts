import express from "express";
import helmet from "helmet";
import { ipKeyGenerator, rateLimit } from "express-rate-limit";
import { resolve } from "node:path";
import { scenarioSchema } from "../shared/model.js";
import { simulate } from "../shared/simulation.js";

export function createApp() {
  const app = express();
  const proxyHops = Number(process.env.TRUST_PROXY_HOPS ?? 0);
  if (!Number.isInteger(proxyHops) || proxyHops < 0 || proxyHops > 5)
    throw new Error("TRUST_PROXY_HOPS must be an integer from 0 to 5.");
  app.set("trust proxy", proxyHops);
  const results = new Map<string, ReturnType<typeof simulate>>();
  app.disable("x-powered-by");
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:"],
          connectSrc: ["'self'"],
          fontSrc: ["'self'", "data:"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
        },
      },
    }),
  );
  app.use(express.json({ limit: "64kb", strict: true }));
  app.get("/api/health", (_req, res) =>
    res.json({ status: "ok", modelVersion: "1.0.0" }),
  );
  app.post(
    "/api/simulations",
    rateLimit({
      windowMs: 60_000,
      limit: 20,
      standardHeaders: "draft-7",
      legacyHeaders: false,
      keyGenerator: (req) => {
        const vercelClientIp = process.env.VERCEL
          ? req.get("x-forwarded-for")?.split(",", 1)[0]?.trim()
          : undefined;
        return ipKeyGenerator(vercelClientIp || req.ip || "unknown");
      },
    }),
    (req, res) => {
      const parsed = scenarioSchema.safeParse(req.body);
      if (!parsed.success)
        return res.status(400).json({
          error: "Invalid scenario",
          details: parsed.error.issues.map(({ path, message }) => ({
            path: path.join("."),
            message,
          })),
        });
      const s = parsed.data;
      const expectedArrivals =
        (s.arrivalRates.reduce((a, b) => a + b, 0) / 4) *
        (s.horizonHours + s.warmupHours) *
        s.replications;
      if (expectedArrivals * 4 > 700_000)
        return res.status(422).json({
          error:
            "This run is too large. Reduce the horizon, arrival rates, or replication count.",
        });
      try {
        const result = simulate(s);
        results.set(result.id, result);
        while (results.size > 12) results.delete(results.keys().next().value!);
        return res.status(201).json(result);
      } catch {
        return res.status(500).json({
          error: "Simulation failed. Check the scenario and try again.",
        });
      }
    },
  );
  app.get("/api/simulations/:id", (req, res) => {
    const result = results.get(req.params.id);
    if (!result)
      return res.status(404).json({
        error:
          "Result not found. Run the scenario again; results are held temporarily in memory.",
      });
    return res.json(result);
  });
  if (process.env.NODE_ENV === "production")
    app.use(
      express.static(resolve(process.cwd(), "public"), {
        maxAge: "1h",
        index: false,
      }),
    );
  app.get("*path", (_req, res, next) => {
    if (process.env.NODE_ENV !== "production") return next();
    return res.sendFile(resolve(process.cwd(), "public/index.html"));
  });
  app.use(
    (
      err: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      void _next;
      if (err instanceof SyntaxError)
        return res
          .status(400)
          .json({ error: "Request body must be valid JSON." });
      if (
        typeof err === "object" &&
        err !== null &&
        "status" in err &&
        err.status === 413
      )
        return res
          .status(413)
          .json({ error: "Request body must be 64 KB or smaller." });
      return res.status(500).json({ error: "Unexpected server error." });
    },
  );
  return app;
}

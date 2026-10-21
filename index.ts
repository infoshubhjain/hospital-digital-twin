import type { Express } from "express";
import { createApp } from "./server/app.js";

const app: Express = createApp();

export default app;

import crypto from "node:crypto";
import express from "express";
import cors from "cors";
import { createDb } from "./lib/db.js";
import { verifyPassword } from "./lib/passwords.js";

export const LOGIN_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
export const MAX_FAILED_LOGIN_ATTEMPTS = 5;
export const MAX_LOGIN_ATTEMPT_ENTRIES = 1_000;

function clearExpiredLoginAttempts(attempts, currentTime) {
  for (const [key, attempt] of attempts) {
    if (attempt.resetAt <= currentTime) attempts.delete(key);
  }
}

export async function createApp(options = {}) {
  const db = options.db ?? (await createDb());
  const failedLoginAttempts = new Map();
  const maxFailedLoginAttempts = options.maxFailedLoginAttempts ?? MAX_FAILED_LOGIN_ATTEMPTS;
  const loginRateLimitWindowMs = options.loginRateLimitWindowMs ?? LOGIN_RATE_LIMIT_WINDOW_MS;
  const maxLoginAttemptEntries = options.maxLoginAttemptEntries ?? MAX_LOGIN_ATTEMPT_ENTRIES;
  const now = options.now ?? Date.now;
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, service: "civic-voice-api" });
  });

  app.post("/api/login", (req, res) => {
    const { nric, password, role } = req.body ?? {};
    const user = db.data.users.find((candidate) => (
      candidate.nric === nric
      && candidate.role === role
      && verifyPassword(password, candidate.passwordHash)
    ));
    const attemptKey = `${req.ip}:${String(nric ?? "").trim().toUpperCase()}`;

    if (user) {
      failedLoginAttempts.delete(attemptKey);

      // Workshop baseline only: this is deliberately not a production session.
      const token = Buffer.from(`${user.nric}:${user.role}`).toString("base64");
      return res.json({ token, user: { nric: user.nric, name: user.name, role: user.role } });
    }

    const currentTime = now();
    clearExpiredLoginAttempts(failedLoginAttempts, currentTime);
    const attempt = failedLoginAttempts.get(attemptKey);
    if (attempt && attempt.resetAt > currentTime && attempt.count >= maxFailedLoginAttempts) {
      const retryAfterSeconds = Math.ceil((attempt.resetAt - currentTime) / 1000);
      return res.status(429).set("Retry-After", String(retryAfterSeconds)).json({
        error: "Too many unsuccessful sign-in attempts. Please try again later.",
      });
    }

    if (!attempt && failedLoginAttempts.size >= maxLoginAttemptEntries) {
      failedLoginAttempts.delete(failedLoginAttempts.keys().next().value);
    }
    failedLoginAttempts.set(attemptKey, {
      count: attempt && attempt.resetAt > currentTime ? attempt.count + 1 : 1,
      resetAt: currentTime + loginRateLimitWindowMs,
    });
    return res.status(401).json({ error: "Invalid NRIC, password, or sign-in mode." });
  });

  app.get("/api/feedback", (req, res) => {
    if (req.header("x-user-role") !== "admin") {
      return res.status(403).json({ error: "Admin access required." });
    }
    return res.json({ feedback: db.data.feedback });
  });

  app.post("/api/feedback", async (req, res) => {
    const { nric, name, message } = req.body ?? {};
    if (typeof message !== "string" || message.trim().length === 0) {
      return res.status(400).json({ error: "Please enter feedback that is not blank." });
    }
    const feedback = {
      id: crypto.randomUUID(), nric, name, message, category: "General", status: "New",
      createdAt: new Date().toISOString(),
    };
    db.data.feedback.unshift(feedback);
    await db.write();
    return res.status(201).json({ feedback });
  });

  return app;
}

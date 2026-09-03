import crypto from "node:crypto";
import express from "express";
import cors from "cors";
import { createDb } from "./lib/db.js";
import { verifyPassword } from "./lib/passwords.js";
import { sendError } from "./lib/errors.js";

export const LOGIN_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
export const MAX_FAILED_LOGIN_ATTEMPTS = 5;
export const MAX_LOGIN_ATTEMPT_ENTRIES = 1_000;

function clearExpiredLoginAttempts(attempts, currentTime) {
  for (const [key, attempt] of attempts) {
    if (attempt.resetAt <= currentTime) attempts.delete(key);
  }
}

export function normalizeFeedbackText(value) {
  return typeof value === "string" ? value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "") : value;
}

export async function createApp(options = {}) {
  const db = options.db ?? (await createDb());
  const failedLoginAttempts = new Map();
  const maxFailedLoginAttempts = options.maxFailedLoginAttempts ?? MAX_FAILED_LOGIN_ATTEMPTS;
  const loginRateLimitWindowMs = options.loginRateLimitWindowMs ?? LOGIN_RATE_LIMIT_WINDOW_MS;
  const maxLoginAttemptEntries = options.maxLoginAttemptEntries ?? MAX_LOGIN_ATTEMPT_ENTRIES;
  const now = options.now ?? Date.now;
  const sessions = new Map();
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

      const token = crypto.randomBytes(32).toString("hex");
      sessions.set(token, { nric: user.nric, role: user.role });
      return res.json({ token, user: { nric: user.nric, name: user.name, role: user.role } });
    }

    const currentTime = now();
    clearExpiredLoginAttempts(failedLoginAttempts, currentTime);
    const attempt = failedLoginAttempts.get(attemptKey);
    if (attempt && attempt.resetAt > currentTime && attempt.count >= maxFailedLoginAttempts) {
      const retryAfterSeconds = Math.ceil((attempt.resetAt - currentTime) / 1000);
      return sendError(
        res.set("Retry-After", String(retryAfterSeconds)),
        429,
        "RATE_LIMITED",
        "Too many unsuccessful sign-in attempts. Please try again later.",
      );
    }

    if (!attempt && failedLoginAttempts.size >= maxLoginAttemptEntries) {
      failedLoginAttempts.delete(failedLoginAttempts.keys().next().value);
    }
    failedLoginAttempts.set(attemptKey, {
      count: attempt && attempt.resetAt > currentTime ? attempt.count + 1 : 1,
      resetAt: currentTime + loginRateLimitWindowMs,
    });
    return sendError(res, 401, "INVALID_CREDENTIALS", "Invalid NRIC, password, or sign-in mode.");
  });

  function requireAdminSession(req, res, next) {
    const token = req.header("authorization")?.match(/^Bearer (.+)$/)?.[1];
    const session = token && sessions.get(token);
    if (session?.role !== "admin") {
      return sendError(res, 403, "FORBIDDEN", "Admin access required.");
    }
    next();
  }

  app.get("/api/feedback", requireAdminSession, (_req, res) => {
    return res.json({ feedback: db.data.feedback });
  });

  app.post("/api/feedback", async (req, res, next) => {
    const { nric, name, message } = req.body ?? {};
    if (typeof message !== "string" || message.trim().length === 0) {
      return sendError(res, 400, "VALIDATION_ERROR", "Please enter feedback that is not blank.");
    }
    const feedback = {
      id: crypto.randomUUID(), nric, name: normalizeFeedbackText(name), message: normalizeFeedbackText(message), category: "General", status: "New",
      createdAt: new Date().toISOString(),
    };
    db.data.feedback.unshift(feedback);
    try {
      await db.write();
    } catch (error) {
      return next(error);
    }
    return res.status(201).json({ feedback });
  });

  app.use((req, res) => sendError(res, 404, "NOT_FOUND", `No route matches ${req.method} ${req.path}.`));

  app.use((error, _req, res, _next) => {
    if (res.headersSent) return _next(error);
    if (error.type === "entity.parse.failed") {
      return sendError(res, 400, "MALFORMED_JSON", "Request body must contain valid JSON.");
    }
    if (error.type === "entity.too.large") {
      return sendError(res, 413, "PAYLOAD_TOO_LARGE", "Request body is too large.");
    }
    return sendError(res, 500, "INTERNAL_ERROR", "Something went wrong.");
  });

  return app;
}

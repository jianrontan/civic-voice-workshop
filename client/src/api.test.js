import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../server/app.js";
import { createDb } from "../../server/lib/db.js";
import { login } from "./api";
import { getLoginErrorMessage } from "./pages/LoginPage";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

async function testApp(options = {}) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "civic-voice-client-api-"));
  const db = await createDb(path.join(directory, "db.json"));
  return createApp({ db, ...options });
}

function fetchFromApp(app) {
  return async (input, options = {}) => {
    const url = new URL(input);
    const method = (options.method ?? "GET").toLowerCase();
    let apiRequest = request(app)[method](url.pathname).set(options.headers ?? {});
    if (options.body) apiRequest = apiRequest.send(JSON.parse(options.body));

    const response = await apiRequest;
    return { ok: response.ok, status: response.status, json: async () => response.body };
  };
}

describe("API error handling", () => {
  it("preserves structured error codes and HTTP statuses", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({ error: { code: "RATE_LIMITED", message: "Please try again later." } }),
    });

    await expect(login({})).rejects.toMatchObject({
      name: "ApiError", status: 429, code: "RATE_LIMITED", message: "Please try again later.",
    });
  });

  it("uses a safe fallback when an error response is not JSON", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => { throw new SyntaxError("Unexpected token"); },
    });

    await expect(login({})).rejects.toMatchObject({
      status: 502, code: "REQUEST_FAILED", message: "Something went wrong.",
    });
  });

  it("parses a live rate-limit response into an ApiError for the login UI", async () => {
    const app = await testApp({ maxFailedLoginAttempts: 1 });
    globalThis.fetch = fetchFromApp(app);
    const credentials = { nric: "S0000001A", password: "wrong-password", role: "citizen" };

    await expect(login(credentials)).rejects.toMatchObject({
      status: 401, code: "INVALID_CREDENTIALS",
    });

    let error;
    try {
      await login(credentials);
    } catch (caughtError) {
      error = caughtError;
    }

    expect(error).toMatchObject({ status: 429, code: "RATE_LIMITED" });
    expect(getLoginErrorMessage(error)).toBe("Too many unsuccessful sign-in attempts. Please wait a few minutes and try again.");
  });
});

import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../server/app.js";
import { createDb } from "../../server/lib/db.js";
import { login, submitFeedback } from "./api";

async function testApp() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "civic-voice-client-api-"));
  const db = await createDb(path.join(directory, "db.json"));
  return createApp({ db });
}

function fetchFromApp(app) {
  return async (input, options = {}) => {
    const url = new URL(input);
    const method = (options.method ?? "GET").toLowerCase();
    let apiRequest = request(app)[method](url.pathname).set(options.headers ?? {});
    if (options.body) apiRequest = apiRequest.send(JSON.parse(options.body));

    const response = await apiRequest;
    return { ok: response.ok, json: async () => response.body };
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("client API integration", () => {
  it("supports switching between public and admin sign-in modes", async () => {
    const app = await testApp();
    vi.stubGlobal("fetch", fetchFromApp(app));

    const citizen = await login({ nric: "S0000001A", password: "citizen123", role: "citizen" });
    const admin = await login({ nric: "S0000002B", password: "admin123", role: "admin" });

    expect(citizen.user.role).toBe("citizen");
    expect(admin.user.role).toBe("admin");
  });

  it("submits citizen feedback through the client API", async () => {
    const app = await testApp();
    vi.stubGlobal("fetch", fetchFromApp(app));

    const response = await submitFeedback({
      nric: "S0000001A", name: "Aisha Rahman", message: "The library study area is very useful.",
    });

    expect(response.feedback.message).toBe("The library study area is very useful.");
  });

  it("surfaces feedback validation errors from the API", async () => {
    const app = await testApp();
    vi.stubGlobal("fetch", fetchFromApp(app));

    await expect(submitFeedback({
      nric: "S0000001A", name: "Aisha Rahman", message: "   ",
    })).rejects.toThrow("Please enter feedback that is not blank.");
  });
});

import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { createDb } from "./lib/db.js";

async function testApp(options = {}) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "civic-voice-"));
  const db = await createDb(path.join(directory, "db.json"));
  return createApp({ db, ...options });
}

describe("CivicVoice baseline API", () => {
  it("creates a missing datastore directory on first use", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "civic-voice-"));
    const db = await createDb(path.join(directory, "missing", "data", "db.json"));
    expect(db.data.users).toHaveLength(2);
  });

  it("logs in the seeded citizen", async () => {
    const app = await testApp();
    const response = await request(app).post("/api/login").send({
      nric: "S0000001A", password: "citizen123", role: "citizen",
    });
    expect(response.status).toBe(200);
    expect(response.body.user.role).toBe("citizen");
  });

  it("stores only password hashes while retaining the workshop credentials", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "civic-voice-"));
    const db = await createDb(path.join(directory, "db.json"));
    const app = await createApp({ db });
    const response = await request(app).post("/api/login").send({
      nric: "S0000002B", password: "admin123", role: "admin",
    });
    expect(response.status).toBe(200);
    for (const user of db.data.users) {
      expect(user).not.toHaveProperty("password");
      expect(user.passwordHash).toMatch(/^pbkdf2\$sha512\$/);
    }
  });

  it("migrates legacy persisted passwords to hashes", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "civic-voice-"));
    const databasePath = path.join(directory, "db.json");
    await writeFile(databasePath, JSON.stringify({
      users: [{ nric: "S0000003C", password: "legacy-demo-password", name: "Maya Lim", role: "citizen" }],
      feedback: [],
    }));

    const db = await createDb(databasePath);
    expect(db.data.users[0]).not.toHaveProperty("password");
    expect(db.data.users[0].passwordHash).toMatch(/^pbkdf2\$sha512\$/);
  });

  it("rejects an incorrect password", async () => {
    const app = await testApp();
    const response = await request(app).post("/api/login").send({
      nric: "S0000001A", password: "wrong-password", role: "citizen",
    });
    expect(response.status).toBe(401);
  });

  it("rate-limits repeated failed sign-ins without blocking a valid sign-in", async () => {
    const app = await testApp({ maxFailedLoginAttempts: 2 });
    const invalidCredentials = { nric: "S0000001A", password: "wrong-password", role: "citizen" };

    await request(app).post("/api/login").send(invalidCredentials).expect(401);
    await request(app).post("/api/login").send(invalidCredentials).expect(401);
    const limited = await request(app).post("/api/login").send(invalidCredentials);

    expect(limited.status).toBe(429);
    expect(limited.headers["retry-after"]).toBeDefined();
    expect(limited.body.error).toMatch(/too many unsuccessful/i);

    const successfulLogin = await request(app).post("/api/login").send({
      nric: "S0000001A", password: "citizen123", role: "citizen",
    });
    expect(successfulLogin.status).toBe(200);

    await request(app).post("/api/login").send(invalidCredentials).expect(401);
  });

  it("expires failed attempts after the rate-limit window", async () => {
    let currentTime = Date.parse("2026-09-03T00:00:00.000Z");
    const app = await testApp({
      maxFailedLoginAttempts: 1,
      loginRateLimitWindowMs: 1_000,
      now: () => currentTime,
    });
    const invalidCredentials = { nric: "S0000001A", password: "wrong-password", role: "citizen" };

    await request(app).post("/api/login").send(invalidCredentials).expect(401);
    await request(app).post("/api/login").send(invalidCredentials).expect(429);

    currentTime += 1_001;
    await request(app).post("/api/login").send(invalidCredentials).expect(401);
  });

  it("bounds tracked failed identifiers by evicting the oldest entry", async () => {
    const app = await testApp({ maxFailedLoginAttempts: 1, maxLoginAttemptEntries: 2 });
    const invalidCredentials = (nric) => ({ nric, password: "wrong-password", role: "citizen" });

    await request(app).post("/api/login").send(invalidCredentials("S0000101A")).expect(401);
    await request(app).post("/api/login").send(invalidCredentials("S0000102B")).expect(401);
    await request(app).post("/api/login").send(invalidCredentials("S0000103C")).expect(401);

    await request(app).post("/api/login").send(invalidCredentials("S0000101A")).expect(401);
  });

  it("accepts feedback", async () => {
    const app = await testApp();
    const response = await request(app).post("/api/feedback").send({
      nric: "S0000001A", name: "Aisha Rahman", message: "Please add more benches.",
    });
    expect(response.status).toBe(201);
    expect(response.body.feedback.message).toBe("Please add more benches.");
  });

  it.each(["   ", "\n\t"]) ("rejects whitespace-only feedback", async (message) => {
    const app = await testApp();
    const response = await request(app).post("/api/feedback").send({
      nric: "S0000001A", name: "Aisha Rahman", message,
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/not blank/);
  });

  it("blocks the feedback list without the admin role header", async () => {
    const app = await testApp();
    const response = await request(app).get("/api/feedback");
    expect(response.status).toBe(403);
  });
});

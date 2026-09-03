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
    expect(response.body.error).toEqual({
      code: "INVALID_CREDENTIALS", message: "Invalid NRIC, password, or sign-in mode.",
    });
  });

  it("rate-limits repeated failed sign-ins without blocking a valid sign-in", async () => {
    const app = await testApp({ maxFailedLoginAttempts: 2 });
    const invalidCredentials = { nric: "S0000001A", password: "wrong-password", role: "citizen" };

    await request(app).post("/api/login").send(invalidCredentials).expect(401);
    await request(app).post("/api/login").send(invalidCredentials).expect(401);
    const limited = await request(app).post("/api/login").send(invalidCredentials);

    expect(limited.status).toBe(429);
    expect(limited.headers["retry-after"]).toBeDefined();
    expect(limited.body.error).toEqual({
      code: "RATE_LIMITED", message: "Too many unsuccessful sign-in attempts. Please try again later.",
    });

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
    expect(response.body.error).toEqual({
      code: "VALIDATION_ERROR", message: "Please enter feedback that is not blank.",
    });
  });

  it("preserves civic feedback containing angle brackets", async () => {
    const app = await testApp();
    const response = await request(app).post("/api/feedback").send({
      nric: "S0000001A",
      name: "Aisha Rahman",
      message: "Keep speeds < 40 km/h near school > at all times",
    });

    expect(response.status).toBe(201);
    expect(response.body.feedback.message).toBe("Keep speeds < 40 km/h near school > at all times");
  });

  it("keeps HTML-like text nonblank while removing control characters", async () => {
    const app = await testApp();
    const response = await request(app).post("/api/feedback").send({
      nric: "S0000001A", name: "Aisha Rahman", message: "<b></b>\u0000",
    });

    expect(response.status).toBe(201);
    expect(response.body.feedback.message).toBe("<b></b>");
  });

  it("blocks the feedback list without an admin session", async () => {
    const app = await testApp();
    const response = await request(app).get("/api/feedback");
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("FORBIDDEN");
  });

  it("returns structured validation and unknown-route errors", async () => {
    const app = await testApp();
    const validationResponse = await request(app).post("/api/feedback").send({});
    expect(validationResponse.status).toBe(400);
    expect(validationResponse.body.error.code).toBe("VALIDATION_ERROR");

    const missingRouteResponse = await request(app).get("/api/missing");
    expect(missingRouteResponse.status).toBe(404);
    expect(missingRouteResponse.body.error).toEqual({
      code: "NOT_FOUND", message: "No route matches GET /api/missing.",
    });
  });

  it("returns structured errors for malformed and oversized JSON", async () => {
    const app = await testApp();
    const malformedResponse = await request(app)
      .post("/api/feedback")
      .set("Content-Type", "application/json")
      .send('{"message":');
    expect(malformedResponse.status).toBe(400);
    expect(malformedResponse.body.error).toEqual({
      code: "MALFORMED_JSON", message: "Request body must contain valid JSON.",
    });

    const oversizedResponse = await request(app)
      .post("/api/feedback")
      .set("Content-Type", "application/json")
      .send(`"${"x".repeat(102_401)}"`);
    expect(oversizedResponse.status).toBe(413);
    expect(oversizedResponse.body.error).toEqual({
      code: "PAYLOAD_TOO_LARGE", message: "Request body is too large.",
    });
  });

  it("returns a structured error for unexpected server failures", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "civic-voice-"));
    const db = await createDb(path.join(directory, "db.json"));
    db.write = async () => { throw new Error("Simulated database failure"); };
    const app = await createApp({ db });
    const response = await request(app).post("/api/feedback").send({
      nric: "S0000001A", name: "Aisha Rahman", message: "Please add more benches.",
    });
    expect(response.status).toBe(500);
    expect(response.body.error).toEqual({ code: "INTERNAL_ERROR", message: "Something went wrong." });
  });

  it("does not let a citizen read the inbox by changing the role header", async () => {
    const app = await testApp();
    const login = await request(app).post("/api/login").send({
      nric: "S0000001A", password: "citizen123", role: "citizen",
    });

    const response = await request(app)
      .get("/api/feedback")
      .set("Authorization", `Bearer ${login.body.token}`)
      .set("x-user-role", "admin");

    expect(response.status).toBe(403);
  });

  it("allows the inbox only with a server-issued admin session", async () => {
    const app = await testApp();
    const login = await request(app).post("/api/login").send({
      nric: "S0000002B", password: "admin123", role: "admin",
    });

    const response = await request(app)
      .get("/api/feedback")
      .set("Authorization", `Bearer ${login.body.token}`);

    expect(response.status).toBe(200);
    expect(response.body.feedback).toBeInstanceOf(Array);
  });
});

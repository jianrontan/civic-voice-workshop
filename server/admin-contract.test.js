import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { createDb } from "./lib/db.js";

async function contractApp() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "civic-voice-admin-contract-"));
  const db = await createDb(path.join(directory, "db.json"));
  return createApp({ db });
}

describe("admin inbox API contract", () => {
  it("lets an admin sign in and read the inbox with its opaque session", async () => {
    const app = await contractApp();
    const login = await request(app).post("/api/login").send({
      nric: "S0000002B", password: "admin123", role: "admin",
    });

    expect(login.status).toBe(200);
    expect(login.body).toMatchObject({
      token: expect.any(String),
      user: { nric: "S0000002B", name: "Daniel Tan", role: "admin" },
    });

    const inbox = await request(app)
      .get("/api/feedback")
      .set("Authorization", `Bearer ${login.body.token}`);

    expect(inbox.status).toBe(200);
    expect(inbox.body.feedback).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "fb-seed-1", status: "New" }),
    ]));
  });

  it("returns the forbidden contract when a citizen session requests the inbox", async () => {
    const app = await contractApp();
    const login = await request(app).post("/api/login").send({
      nric: "S0000001A", password: "citizen123", role: "citizen",
    });

    const inbox = await request(app)
      .get("/api/feedback")
      .set("Authorization", `Bearer ${login.body.token}`);

    expect(inbox.status).toBe(403);
    expect(inbox.body).toEqual({
      error: { code: "FORBIDDEN", message: "Admin access required." },
    });
  });
});

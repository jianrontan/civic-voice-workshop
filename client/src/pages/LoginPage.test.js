import { describe, expect, it } from "vitest";
import { getLoginErrorMessage } from "./LoginPage";

describe("login error messages", () => {
  it("gives rate-limited users a useful retry message", () => {
    expect(getLoginErrorMessage({ status: 429, message: "Too many requests" }))
      .toMatch(/wait a few minutes/i);
  });

  it("keeps other API error messages", () => {
    expect(getLoginErrorMessage({ status: 401, message: "Invalid workshop credentials." }))
      .toBe("Invalid workshop credentials.");
  });
});

import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { getLoginErrorMessage, LoginPage } from "./LoginPage";

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

describe("login API health indicator", () => {
  it("renders an accessible initial connection indicator", () => {
    const markup = renderToStaticMarkup(createElement(LoginPage, { onLogin: () => {} }));
    expect(markup).toContain('role="status"');
    expect(markup).toContain("Checking local API connection");
  });
});

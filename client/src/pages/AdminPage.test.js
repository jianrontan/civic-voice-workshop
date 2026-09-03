import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AdminPage, getExportButtonState } from "./AdminPage";

describe("admin feedback export", () => {
  it("renders a CSV download action", () => {
    const markup = renderToStaticMarkup(
      createElement(AdminPage, { session: { token: "admin-session", user: { name: "Daniel Tan", role: "admin" } } }),
    );

    expect(markup).toContain("Download CSV");
  });

  it("disables the action while an export is in progress", () => {
    expect(getExportButtonState(false)).toEqual({ disabled: false, label: "Download CSV" });
    expect(getExportButtonState(true)).toEqual({ disabled: true, label: "Preparing export…" });
  });
});

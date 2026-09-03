import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, downloadFeedback } from "./api";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("feedback CSV download", () => {
  it("requests filtered CSV with a Bearer token and cleans up the Blob URL after clicking", async () => {
    const click = vi.fn();
    const link = { click, href: "", download: "" };
    const blob = new Blob(["csv"]);
    const fetch = vi.fn().mockResolvedValue({ ok: true, blob: vi.fn().mockResolvedValue(blob) });
    const createObjectURL = vi.fn().mockReturnValue("blob:civicvoice-export");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("fetch", fetch);
    vi.stubGlobal("document", { createElement: vi.fn().mockReturnValue(link) });
    vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });
    vi.useFakeTimers();

    await downloadFeedback("admin-session", { category: "Transport", status: "New" });

    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:3001/api/feedback/export?category=Transport&status=New",
      { headers: { Authorization: "Bearer admin-session" } },
    );
    expect(link.href).toBe("blob:civicvoice-export");
    expect(link.download).toBe("civicvoice-feedback.csv");
    expect(click).toHaveBeenCalledOnce();
    expect(revokeObjectURL).not.toHaveBeenCalled();

    vi.runAllTimers();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:civicvoice-export");
  });

  it("preserves structured export errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: vi.fn().mockResolvedValue({ error: { code: "FORBIDDEN", message: "Admin access required." } }),
    }));

    await expect(downloadFeedback("citizen-session")).rejects.toMatchObject(
      new ApiError(403, "FORBIDDEN", "Admin access required."),
    );
  });
});

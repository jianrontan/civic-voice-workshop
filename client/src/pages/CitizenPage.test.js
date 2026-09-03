import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  CitizenPage,
  FEEDBACK_CATEGORIES,
  FEEDBACK_CHARACTER_LIMIT,
  isBlankFeedback,
  limitFeedbackMessage,
} from "./CitizenPage";

describe("citizen feedback character limit", () => {
  it("keeps feedback at or below 500 characters unchanged", () => {
    const message = "a".repeat(FEEDBACK_CHARACTER_LIMIT);

    expect(limitFeedbackMessage(message)).toBe(message);
  });

  it("prevents feedback longer than 500 characters", () => {
    const message = "a".repeat(FEEDBACK_CHARACTER_LIMIT + 1);

    expect(limitFeedbackMessage(message)).toHaveLength(FEEDBACK_CHARACTER_LIMIT);
  });

  it("identifies blank and whitespace-only feedback", () => {
    expect(isBlankFeedback("   \n\t ")).toBe(true);
    expect(isBlankFeedback("More sheltered seating near the playground.")).toBe(false);
  });

  it("renders the limit and current character count", () => {
    const markup = renderToStaticMarkup(
      createElement(CitizenPage, { user: { nric: "S0000001A", name: "Aisha Lim" } }),
    );

    expect(markup).toContain(`maxlength="${FEEDBACK_CHARACTER_LIMIT}"`);
    expect(markup).toContain(`0/${FEEDBACK_CHARACTER_LIMIT} characters`);
  });

  it("renders each supported feedback category", () => {
    const markup = renderToStaticMarkup(
      createElement(CitizenPage, { user: { nric: "S0000001A", name: "Aisha Lim" } }),
    );

    FEEDBACK_CATEGORIES.forEach((category) => expect(markup).toContain(`>${category}</option>`));
  });
});

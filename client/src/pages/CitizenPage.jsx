import { useState } from "react";
import { submitFeedback } from "../api";

export const FEEDBACK_CHARACTER_LIMIT = 500;

export function limitFeedbackMessage(message) {
  return message.slice(0, FEEDBACK_CHARACTER_LIMIT);
}

export function isBlankFeedback(message) {
  return message.trim().length === 0;
}

export function SubmissionConfirmation({ reference }) {
  return <div className="success-banner">Thank you. Your feedback has been received. Your reference is {reference}.</div>;
}

export function CitizenPage({ user }) {
  const [message, setMessage] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [submissionReference, setSubmissionReference] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    if (isBlankFeedback(message)) {
      setError("Please enter feedback that is not blank.");
      return;
    }
    if (message.length > FEEDBACK_CHARACTER_LIMIT) {
      setError(`Feedback must be ${FEEDBACK_CHARACTER_LIMIT} characters or fewer.`);
      return;
    }

    try {
      const response = await submitFeedback({ nric: user.nric, name: user.name, message });
      setSubmissionReference(response.feedback.reference);
      setSubmitted(true);
      setMessage("");
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  return (
    <main className="page-shell">
      <div className="page-heading">
        <div className="eyebrow">Public feedback</div>
        <h1>What would you like us to know?</h1>
        <p>Tell us about an issue, an idea, or a positive experience in your community.</p>
      </div>
      <section className="form-card">
        {submitted && <SubmissionConfirmation reference={submissionReference} />}
        <form onSubmit={handleSubmit}>
          <label>Your feedback
            <textarea
              rows="7"
              value={message}
              maxLength={FEEDBACK_CHARACTER_LIMIT}
              onChange={(event) => setMessage(limitFeedbackMessage(event.target.value))}
              placeholder="Share your feedback here..."
            />
          </label>
          <div className="character-count">{message.length}/{FEEDBACK_CHARACTER_LIMIT} characters</div>
          <div className="form-footer">
            <span className="muted">Please do not include sensitive personal information.</span>
            <button className="primary-button">Submit feedback</button>
          </div>
          {error && <p className="error-message">{error}</p>}
        </form>
      </section>
    </main>
  );
}

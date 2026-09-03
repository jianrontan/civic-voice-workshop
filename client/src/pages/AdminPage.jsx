import { useEffect, useState } from "react";
import { downloadFeedback, getFeedback } from "../api";

function FeedbackText({ children }) {
  return <p>{children}</p>;
}

export function getExportButtonState(exporting) {
  return exporting
    ? { disabled: true, label: "Preparing export…" }
    : { disabled: false, label: "Download CSV" };
}

export function AdminPage({ session }) {
  const [feedback, setFeedback] = useState([]);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    getFeedback(session.token).then((response) => setFeedback(response.feedback)).catch((requestError) => setError(requestError.message));
  }, [session.token]);

  async function handleExport() {
    setExporting(true);
    setError("");
    try {
      await downloadFeedback(session.token);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setExporting(false);
    }
  }

  const exportButton = getExportButtonState(exporting);

  return (
    <main className="page-shell admin-shell">
      <div className="page-heading">
        <div className="eyebrow">Admin workspace</div>
        <h1>Feedback inbox</h1>
        <p>A simple view of feedback received from members of the public.</p>
      </div>
      {error && <p className="error-message">{error}</p>}
      <section className="feedback-list">
        <div className="list-header">
          <strong>Latest feedback</strong>
          <span>{feedback.length} items</span>
          <button type="button" className="secondary-button" onClick={handleExport} disabled={exportButton.disabled}>
            {exportButton.label}
          </button>
        </div>
        {feedback.map((item) => (
          <article className="feedback-row" key={item.id}>
            <div>
              <div className="feedback-meta">{item.name} · {new Date(item.createdAt).toLocaleDateString()}</div>
              <FeedbackText>{item.message}</FeedbackText>
            </div>
            <span className="status-pill">{item.status}</span>
          </article>
        ))}
      </section>
    </main>
  );
}

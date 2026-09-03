const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

export async function checkHealth() {
  try {
    const response = await fetch(`${API_URL}/api/health`);
    const body = await response.json();
    return response.ok && body?.ok === true;
  } catch {
    return false;
  }
}

function feedbackQuery(filters = {}) {
  const query = new URLSearchParams(Object.entries(filters).filter(([, value]) => value));
  return query.size ? `?${query}` : "";
}

async function api(path, options = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    headers: { "Content-Type": "application/json", ...(options.headers ?? {}) },
    ...options,
  });
  let body;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  if (!response.ok) {
    const error = body?.error;
    throw new ApiError(
      response.status,
      typeof error?.code === "string" ? error.code : "REQUEST_FAILED",
      typeof error?.message === "string" ? error.message : "Something went wrong.",
    );
  }
  return body;
}

export function login(credentials) {
  return api("/api/login", { method: "POST", body: JSON.stringify(credentials) });
}
export function submitFeedback(feedback) {
  return api("/api/feedback", { method: "POST", body: JSON.stringify(feedback) });
}
export function getFeedback(token, filters) {
  return api(`/api/feedback${feedbackQuery(filters)}`, { headers: { Authorization: `Bearer ${token}` } });
}
export async function downloadFeedback(token, filters) {
  const response = await fetch(`${API_URL}/api/feedback/export${feedbackQuery(filters)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    let body;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    const error = body?.error;
    throw new ApiError(
      response.status,
      typeof error?.code === "string" ? error.code : "REQUEST_FAILED",
      typeof error?.message === "string" ? error.message : "Unable to export feedback.",
    );
  }

  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = "civicvoice-feedback.csv";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

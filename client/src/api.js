const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
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
export function getFeedback(user) {
  return api("/api/feedback", { headers: { "x-user-role": user.role } });
}

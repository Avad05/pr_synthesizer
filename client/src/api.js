const API_BASE = '/api';

async function handleResponse(res) {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed with status ${res.status}`);
  }
  return res.json();
}

export async function getReviews() {
  const res = await fetch(`${API_BASE}/reviews`);
  return handleResponse(res);
}

export async function getReview(id) {
  const res = await fetch(`${API_BASE}/reviews/${id}`);
  return handleResponse(res);
}

export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000').replace(/\/$/, '');

export async function apiRequest(path, options = {}) {
  const url = `${API_BASE_URL}${path}`;
  const defaultOptions = { headers: {} };
  const merged = {
    ...defaultOptions,
    ...options,
    headers: {
      ...(options.headers || {}),
    },
  };

  if (!(merged.body instanceof FormData)) {
    merged.headers['Content-Type'] = merged.headers['Content-Type'] || 'application/json';
  }

  try {
    const response = await fetch(url, merged);
    const contentType = response.headers.get('content-type') || '';
    const payload = contentType.includes('application/json') ? await response.json() : await response.text();

    if (!response.ok) {
      const message = typeof payload === 'object' && payload && payload.detail
        ? payload.detail
        : (typeof payload === 'string' && payload ? payload : 'Request failed.');
      throw new Error(message);
    }

    if (payload === '') {
      return null;
    }

    return payload;
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error('The backend is unavailable. Check that the FastAPI API is running on the configured URL.');
    }
    throw error;
  }
}

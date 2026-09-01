const API_URL = import.meta.env.VITE_API_URL as string;

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      ...(typeof options.body === 'string' ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  });

  if (!response.ok) {
    let message = response.statusText;
    try {
      const body = (await response.json()) as { message?: string | string[] };
      message = Array.isArray(body.message) ? body.message.join(', ') : (body.message ?? message);
    } catch {
      // response had no JSON body — fall back to statusText
    }
    throw new ApiError(response.status, message);
  }

  // NestJS's default status for most write endpoints (DELETE included) is 200, not 204, even
  // when the handler returns void — so a truly empty body isn't reliably signalled by status
  // alone. Reading as text first and checking for emptiness (rather than calling .json() and
  // relying on 204) avoids "Unexpected end of JSON input" on any endpoint that responds with an
  // empty 200, whatever its status code turns out to be.
  const text = await response.text();
  if (text === '') {
    return undefined as T;
  }
  return JSON.parse(text) as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body !== undefined ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PATCH', body: body !== undefined ? JSON.stringify(body) : undefined }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
  upload: <T>(path: string, formData: FormData) => request<T>(path, { method: 'POST', body: formData }),
};

export function discordLoginUrl(): string {
  return `${API_URL}/auth/discord`;
}

/** The backend returns asset paths like "/uploads/liveries/x.png" relative to its own origin,
 * not the frontend's — this resolves them to a full URL the browser can actually load. */
export function resolveAssetUrl(path: string): string {
  return path.startsWith('http') ? path : `${API_URL}${path}`;
}

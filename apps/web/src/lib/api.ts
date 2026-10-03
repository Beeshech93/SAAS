export interface ApiError {
  code: string;
  message: string;
}

export class ApiRequestError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: { reason?: string }) {
    super(message);
  }
}

let accessToken: string | null = null;
export const setAccessToken = (t: string | null) => {
  accessToken = t;
};

export async function api<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: options.method ?? 'GET',
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      credentials: 'same-origin',
    });
  } catch {
    throw new ApiRequestError(0, 'NETWORK', 'network');
  }
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.success) {
    throw new ApiRequestError(res.status, json?.error?.code ?? 'INTERNAL_ERROR', json?.error?.message ?? 'error', json?.error?.details);
  }
  return json.data as T;
}

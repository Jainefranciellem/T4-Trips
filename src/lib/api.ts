import { getAccessToken, getRefreshToken, setAccessToken, clearTokens } from './auth-storage';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

// Carrega o status e o corpo da resposta de erro — alguns fluxos (ex.: aviso de
// cliente duplicado) dependem de campos extras além da mensagem.
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public body: Record<string, unknown> | null,
  ) {
    super(message);
  }
}

const PUBLIC_AUTH_ENDPOINTS = ['/auth/login', '/auth/refresh', '/auth/forgot-password', '/auth/reset-password'];

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return null;

  const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });

  if (!response.ok) return null;

  const data = await response.json();
  setAccessToken(data.accessToken);
  return data.accessToken as string;
}

export async function apiFetch<T>(
  endpoint: string,
  options: RequestInit = {},
  isRetry = false
): Promise<T> {
  // Rotas de /auth que funcionam sem sessão; /auth/me e /auth/logout precisam do token.
  const isAuthEndpoint = PUBLIC_AUTH_ENDPOINTS.some((p) => endpoint.startsWith(p));
  const token = getAccessToken();

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      // Fastify rejects a Content-Type: application/json header on a request
      // with no body (FST_ERR_CTP_EMPTY_JSON_BODY), so only set it when
      // there's actually a body to send.
      // Upload (FormData) define o próprio Content-Type com o boundary.
      ...(typeof options.body === 'string' ? { 'Content-Type': 'application/json' } : {}),
      ...(token && !isAuthEndpoint ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (response.status === 401 && !isAuthEndpoint) {
    if (!isRetry) {
      const refreshed = await refreshAccessToken();
      if (refreshed) {
        return apiFetch<T>(endpoint, options, true);
      }
    }
    clearTokens();
    if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
      window.location.href = '/login';
    }
    throw new Error('Sessão expirada');
  }

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new ApiError(body?.message ?? 'Erro na API', response.status, body);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json();
}

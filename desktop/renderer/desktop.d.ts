export {};

interface DesktopUser {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  locale: string;
  timezone: string;
}

interface ApiRequest {
  path: string;
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  token?: string;
  body?: unknown;
}

interface ApiResponse {
  ok: boolean;
  status: number;
  body: unknown;
}

declare global {
  interface Window {
    todoEnOrdenDesktop: {
      platform: string;
      versions: { chrome: string; electron: string };
      startGoogleLogin(): Promise<void>;
      onAuthSession(callback: (session: { user: DesktopUser; token: string }) => void): () => void;
      onRefreshAgenda(callback: () => void): () => void;
      apiRequest(request: ApiRequest): Promise<ApiResponse>;
    };
  }
}

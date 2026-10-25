export {};

declare global {
  interface Window {
    todoEnOrdenDesktop?: {
      platform: string;
      versions: Readonly<{
        chrome: string;
        electron: string;
      }>;
      onRefreshAgenda(callback: () => void): () => void;
      startGoogleLogin(): Promise<void>;
      onAuthSession(callback: (session: {
        token: string;
        user: {
          id: string;
          name: string;
          email: string;
          avatarUrl: string | null;
          locale: string;
          timezone: string;
        };
      }) => void): () => void;
    };
  }
}

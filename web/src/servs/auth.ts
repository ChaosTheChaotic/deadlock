export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface User {
  uid: string;
  email: string;
}

export interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
}

const AUTH_STORAGE_KEY = 'auth_tokens';

export class AuthService {
  static setTokens(tokens: AuthTokens) {
    if (typeof window !== 'undefined') {
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(tokens));
    }
  }

  static getTokens(): AuthTokens | null {
    if (typeof window !== 'undefined') {
      const tokens = localStorage.getItem(AUTH_STORAGE_KEY);
      return tokens ? JSON.parse(tokens) : null;
    }
    return null;
  }

  static clearTokens() {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(AUTH_STORAGE_KEY);
    }
  }

  static getAccessToken(): string | null {
    const tokens = this.getTokens();
    return tokens?.accessToken || null;
  }

  static isAuthenticated(): boolean {
    return !!this.getAccessToken();
  }
}

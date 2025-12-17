import { jwtDecode } from "jwt-decode";

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  jti?: string;
  expiresAt?: number;
}

export interface User {
  uid: string;
  email: string;
}

export interface DecodedToken {
  uid: string;
  email: string;
  iat: number;
  exp: number;
  token_type?: string;
}

const AUTH_STORAGE_KEY = "auth_data";
const TOKEN_REFRESH_THRESHOLD = 5 * 60 * 1000; // 5 minutes before expiry

export class AuthService {
  static setTokens(tokens: AuthTokens) {
    if (typeof window !== "undefined") {
      const data = {
        ...tokens,
        storedAt: Date.now(),
      };
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(data));
    }
  }

  static getTokens(): AuthTokens | null {
    if (typeof window !== "undefined") {
      const data = localStorage.getItem(AUTH_STORAGE_KEY);
      if (!data) return null;

      try {
        const parsed = JSON.parse(data);
        // Validate token expiration
        if (parsed.expiresAt && Date.now() > parsed.expiresAt) {
          this.clearTokens();
          return null;
        }
        return parsed;
      } catch {
        this.clearTokens();
        return null;
      }
    }
    return null;
  }

  static clearTokens() {
    if (typeof window !== "undefined") {
      localStorage.removeItem(AUTH_STORAGE_KEY);
    }
  }

  static getAccessToken(): string | null {
    const tokens = this.getTokens();
    return tokens?.accessToken || null;
  }

  static getRefreshToken(): string | null {
    const tokens = this.getTokens();
    return tokens?.refreshToken || null;
  }

  static getJti(): string | null {
    const tokens = this.getTokens();
    return tokens?.jti || null;
  }

  static isTokenExpiringSoon(): boolean {
    const token = this.getAccessToken();
    if (!token) return true;

    try {
      const decoded = jwtDecode<DecodedToken>(token);
      const now = Date.now() / 1000;
      const timeUntilExpiry = decoded.exp - now;
      return timeUntilExpiry < TOKEN_REFRESH_THRESHOLD / 1000;
    } catch {
      return true;
    }
  }

  static decodeToken(token: string): DecodedToken | null {
    try {
      return jwtDecode<DecodedToken>(token);
    } catch {
      return null;
    }
  }

  static getUser(): User | null {
    const token = this.getAccessToken();
    if (!token) return null;

    const decoded = this.decodeToken(token);
    if (!decoded) return null;

    return {
      uid: decoded.uid,
      email: decoded.email,
    };
  }

  static isAuthenticated(): boolean {
    const token = this.getAccessToken();
    if (!token) return false;

    try {
      const decoded = this.decodeToken(token);
      if (!decoded) return false;

      const now = Date.now() / 1000;
      return decoded.exp > now && decoded.token_type === "access";
    } catch {
      return false;
    }
  }
}

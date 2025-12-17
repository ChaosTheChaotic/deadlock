import axios, { AxiosError, type InternalAxiosRequestConfig } from "axios";
import { AuthService } from "./auth";
import { trpcClient } from "./client";

let isRefreshing = false;
let failedQueue: Array<{
  resolve: (token: string) => void;
  reject: (error: unknown) => void;
}> = [];

const processQueue = (error: unknown, token: string | null = null) => {
  failedQueue.forEach(promise => {
    if (error) {
      promise.reject(error);
    } else {
      promise.resolve(token!);
    }
  });
  failedQueue = [];
};

const api = axios.create({
  baseURL: "/",
  timeout: 10000,
  headers: {
    "Content-Type": "application/json",
  },
});

api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = AuthService.getAccessToken();
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
      
      // Add fingerprint/device ID for additional security
      const deviceId = localStorage.getItem("device_id") || "unknown";
      config.headers["X-Device-ID"] = deviceId;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    // Only handle 401 errors for token refresh
    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        // Queue the request
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            originalRequest.headers!.Authorization = `Bearer ${token}`;
            return api(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const refreshToken = AuthService.getRefreshToken();
        if (!refreshToken) {
          throw new Error("No refresh token available");
        }

        // Use tRPC client for refresh
        const result = await trpcClient.refreshToken.mutate({
          refreshToken,
        });

        // Update stored tokens
        const currentTokens = AuthService.getTokens();
        if (currentTokens) {
          AuthService.setTokens({
            accessToken: result.accessToken,
            refreshToken: result.refreshToken,
            jti: result.jti,
          });
        }

        processQueue(null, result.accessToken);
        
        // Retry original request
        originalRequest.headers!.Authorization = `Bearer ${result.accessToken}`;
        return api(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        
        // Clear tokens and redirect to login
        AuthService.clearTokens();
        
        // Only redirect if not already on login page
        if (!window.location.pathname.includes("login")) {
          window.location.href = "/login";
        }
        
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    // Handle other errors
    if (error.response?.status === 403) {
      // Handle forbidden access
      console.error("Forbidden access:", error);
    }

    return Promise.reject(error);
  }
);

export default api;

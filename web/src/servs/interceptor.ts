import axios from 'axios';
import { AuthService } from './auth';

const api = axios.create();

api.interceptors.request.use((config) => {
  const token = AuthService.getAccessToken();
  if (token && config.headers) {
    config.headers.Authorization = token;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // If error is 401 and we haven't tried refreshing yet
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        // Get new access token using refresh token
        const refreshToken = AuthService.getTokens()?.refreshToken;
        if (!refreshToken) {
          throw new Error('No refresh token available');
        }

        // Call your refresh endpoint
        const response = await api.post('/trpc/refreshToken', {
          json: { refreshToken },
        });

        const newAccessToken = response.data.result.data.accessToken;
        
        // Update stored token
        const tokens = AuthService.getTokens();
        if (tokens) {
          tokens.accessToken = newAccessToken;
          AuthService.setTokens(tokens);
        }

        // Retry original request
        originalRequest.headers.Authorization = newAccessToken;
        return api(originalRequest);
      } catch (refreshError) {
        // Refresh failed, clear tokens and redirect to login
        AuthService.clearTokens();
        window.location.href = '/login';
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

export default api;

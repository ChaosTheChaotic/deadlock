import axios, { AxiosError } from "axios";

const api = axios.create({
  baseURL: "/",
  timeout: 10000,
  headers: {
    "Content-Type": "application/json",
  },
  withCredentials: true, // Important: send cookies with requests
});

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    // Handle 401 errors by redirecting to login
    if (error.response?.status === 401) {
      // Only redirect if not already on login page
      if (!window.location.pathname.includes("login")) {
        window.location.href = "/login";
      }
    }

    return Promise.reject(error);
  },
);

export default api;

import { useState, useEffect } from "react";
import { useAuth } from "@hooks/index";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isRegister, setIsRegister] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isOAuthConfigured, setIsOAuthConfigured] = useState(true);
  const { login, register, isLoading } = useAuth();

  // Check OAuth configuration
  useEffect(() => {
    const checkOAuthConfig = async () => {
      try {
        const response = await fetch("/auth/config");
        const config = await response.json();
        setIsOAuthConfigured(config.hasGoogleConfig);
      } catch (error) {
        console.warn("Failed to check OAuth config:", error);
        setIsOAuthConfigured(false);
      }
    };
    
    void checkOAuthConfig();
  }, []);

  // Check URL parameters on component mount
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const error = urlParams.get("error");
    const message = urlParams.get("message");
    const success = urlParams.get("success");
    const email = urlParams.get("email");

    if (error && message) {
      setError(decodeURIComponent(message));
      // Clear URL parameters
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (success === "true" && email) {
      setSuccess(`Successfully logged in as ${decodeURIComponent(email)}`);
      // Clear URL parameters and redirect after a delay
      window.history.replaceState({}, document.title, window.location.pathname);
      setTimeout(() => {
        window.location.href = "/";
      }, 2000);
    }
  }, []);

  const handleSubmit = async (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    try {
      if (isRegister) {
        await register(email, password);
      } else {
        await login(email, password);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed");
    }
  };

  const handleGoogleLogin = () => {
    // Get current path for redirect after auth
    const redirectUri = window.location.pathname === "/login" ? "/" : window.location.pathname;
    
    // Add query params to preserve any existing ones
    const search = window.location.search;
    const fullRedirectUri = redirectUri + (search ? search : "");
    
    // Redirect to OAuth endpoint
    window.location.href = `/auth/google?redirect_uri=${encodeURIComponent(fullRedirectUri)}`;
  };

  return (
    <div className="login-form">
      <h2>{isRegister ? "Register" : "Login"}</h2>
      
      {error && <div className="error">{error}</div>}
      {success && <div className="success">{success}</div>}
      
      {/* Google OAuth Button - only show if configured */}
      {isOAuthConfigured && (
        <>
          <div style={{ marginBottom: "20px" }}>
            <button
              type="button"
              onClick={handleGoogleLogin}
              disabled={isLoading}
              style={{
                backgroundColor: "#4285F4",
                color: "white",
                border: "none",
                padding: "10px 20px",
                borderRadius: "4px",
                cursor: "pointer",
                width: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "10px",
              }}
            >
              <svg width="18" height="18" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                <path fill="#4285F4" d="M46.5 24c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
                <path fill="none" d="M0 0h48v48H0z"/>
              </svg>
              {isLoading ? "Loading..." : "Continue with Google"}
            </button>
          </div>

          <div style={{ textAlign: "center", margin: "10px 0" }}>
            <span>or</span>
          </div>
        </>
      )}

      {/* Email/password form */}
      <form onSubmit={handleSubmit}>
        <div>
          <label>Email:</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div>
          <label>Password:</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required={!isRegister}
          />
        </div>
        <button type="submit" disabled={isLoading}>
          {isLoading ? "Loading..." : isRegister ? "Register" : "Login"}
        </button>
      </form>
      
      {!isOAuthConfigured && (
        <div style={{ 
          marginTop: "20px", 
          padding: "10px", 
          backgroundColor: "#fff3cd", 
          border: "1px solid #ffeaa7",
          borderRadius: "4px",
          color: "#856404"
        }}>
          <strong>Note:</strong> Google OAuth is not configured. Please set up Google OAuth in your environment variables.
        </div>
      )}
      
      <button onClick={() => setIsRegister(!isRegister)}>
        {isRegister
          ? "Already have an account? Login"
          : "Need an account? Register"}
      </button>
    </div>
  );
}

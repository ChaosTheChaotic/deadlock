import { useState, useEffect, type SyntheticEvent } from "react";
import { useAuth } from "@hooks/index";
import { useSearchParams } from "react-router-dom";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isRegister, setIsRegister] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [searchParams] = useSearchParams();
  const { login, register, isLoading } = useAuth();

  // Check for OAuth callback parameters
  useEffect(() => {
    const error = searchParams.get("error");
    const message = searchParams.get("message");
    const success = searchParams.get("success");
    const email = searchParams.get("email");

    if (error && message) {
      setError(decodeURIComponent(message));
    } else if (success === "true" && email) {
      setSuccess(`Successfully logged in as ${decodeURIComponent(email)}`);
      // Optionally redirect after a delay
      setTimeout(() => {
        window.location.href = "/";
      }, 2000);
    }
  }, [searchParams]);

  const handleSubmit = async (e: SyntheticEvent) => {
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
    // Redirect to backend OAuth endpoint
    const redirectUri = window.location.pathname === "/login" ? "/" : window.location.pathname;
    window.location.href = `/auth/google?redirect_uri=${encodeURIComponent(redirectUri)}`;
  };

  return (
    <div className="login-form">
      <h2>{isRegister ? "Register" : "Login"}</h2>
      
      {error && <div className="error">{error}</div>}
      {success && <div className="success">{success}</div>}
      
      {/* Google OAuth Button */}
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
          }}
        >
          {isLoading ? "Loading..." : "Continue with Google"}
        </button>
      </div>

      <div style={{ textAlign: "center", margin: "10px 0" }}>
        <span>or</span>
      </div>

      {/* Existing email/password form */}
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
      <button onClick={() => setIsRegister(!isRegister)}>
        {isRegister
          ? "Already have an account? Login"
          : "Need an account? Register"}
      </button>
    </div>
  );
}

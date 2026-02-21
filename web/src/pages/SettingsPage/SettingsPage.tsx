import { useState } from "react";
import { trpc } from "@servs/client";
import { Navbar } from "@components/index";
import { useAuth } from "@hooks/index";

export const SettingsPage = () => {
  const { user } = useAuth();
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const updateMutation = trpc.updateUser.useMutation({
    onSuccess: () => {
      setMessage({
        type: "success",
        text: "Account settings updated successfully!",
      });
    },
    onError: (error) => {
      setMessage({ type: "error", text: error.message });
    },
  });

  const handleSave = (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    setMessage(null);

    if (!user) return;

    const formData = new FormData(e.currentTarget);
    const email = formData.get("email") as string;
    const pass = formData.get("pass") as string;

    updateMutation.mutate({
      uid: user.uid,
      email: email,
      pass: pass || undefined,
    });
  };

  if (!user) return <div>Loading...</div>;

  return (
    <div className="page-container">
      <Navbar />
      <main className="content">
        <header className="content-header">
          <h2>Account Settings</h2>
        </header>

        <div
          className="settings-form-container"
          style={{ maxWidth: "500px", marginTop: "2rem" }}
        >
          {message && (
            <div
              style={{
                padding: "1rem",
                marginBottom: "1rem",
                borderRadius: "4px",
                backgroundColor:
                  message.type === "success" ? "#d4edda" : "#f8d7da",
                color: message.type === "success" ? "#155724" : "#721c24",
              }}
            >
              {message.text}
            </div>
          )}

          <form
            onSubmit={handleSave}
            style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
          >
            <div style={{ display: "flex", flexDirection: "column" }}>
              <label htmlFor="email">Email Address</label>
              <input
                id="email"
                name="email"
                defaultValue={user.email}
                required
                type="email"
                style={{ padding: "0.5rem", marginTop: "0.25rem" }}
              />
            </div>

            <div style={{ display: "flex", flexDirection: "column" }}>
              <label htmlFor="pass">
                New Password <small>(Leave blank to keep current)</small>
              </label>
              <input
                id="pass"
                name="pass"
                type="password"
                placeholder="••••••••"
                style={{ padding: "0.5rem", marginTop: "0.25rem" }}
              />
            </div>

            <div style={{ marginTop: "1rem" }}>
              <button
                type="submit"
                className="btn-primary"
                disabled={updateMutation.isPending}
                style={{ padding: "0.5rem 1rem" }}
              >
                {updateMutation.isPending ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
};

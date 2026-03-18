import { trpc } from "@servs/client";
import { Navbar, LogStreamViewer } from "@components/index";
import "./AdminDashboard.css";

export const AdminDashboard = () => {
  const cleanup = trpc.runCleanup.useMutation();

  const handleSystemMaintenance = async () => {
    const res = await cleanup.mutateAsync();
    alert(`Cleanup complete! Removed ${res.totalCleaned} expired entries.`);
  };

  return (
    <div className="page-container">
      <Navbar />
      <main className="content">
        <h1>System Administration</h1>

        <div className="dashboard-grid">
          <section className="stat-card">
            <h3>Maintenance</h3>
            <p>Clear expired sessions and rate-limit history.</p>
            <button
              disabled={cleanup.isPending}
              onClick={handleSystemMaintenance}
              className="action-button"
            >
              {cleanup.isPending ? "Cleaning..." : "Run System Cleanup"}
            </button>
          </section>

          <section className="full-width-card">
            <h3>Live System Logs</h3>
            <LogStreamViewer />
          </section>
        </div>
      </main>
    </div>
  );
};

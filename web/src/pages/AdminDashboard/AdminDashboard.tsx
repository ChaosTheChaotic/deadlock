import { trpc } from "@servs/client";
import { Navbar } from "@components/index";

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

          <section className="stat-card">
            <h3>Security Policy</h3>
            <p>Active Perm Map: <code>users:manage</code> → <code>create, edit, delete, search</code></p>
          </section>
        </div>
      </main>
    </div>
  );
};

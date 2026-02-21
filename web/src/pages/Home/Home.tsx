import "./Home.css";
import { useAuth } from "@hooks/index";
import { LoginForm } from "@components/LoginForm";
import { Navbar } from "@components/Navbar";

export const HomePage = () => {
  const { user } = useAuth();

  if (!user) return <LoginForm />;

  return (
    <div className="home-page">
      <Navbar />
      <header className="hero">
        <h1>Welcome back, {user.email}</h1>
        <div className="user-badge">
          <span>Role: {user.roles[0] || "User"}</span>
        </div>
      </header>
      
      <section className="overview">
        <p>Use the navigation menu above to access your assigned tools.</p>
      </section>
    </div>
  );
};

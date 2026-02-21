import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@hooks/index";

export const Navbar = () => {
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  if (!user) return null;

  const hasPerm = (p: string) => user.perms.includes(p) || user.perms.includes("admin:access");

  return (
    <nav className="navbar">
      <div className="nav-brand"><Link to="/">Dashboard</Link></div>
      
      <div className="nav-dropdown">
        <button className="dropdown-trigger" onClick={() => setMenuOpen(!menuOpen)}>
          Tools ▾
        </button>
        
        {menuOpen && (
          <div className="dropdown-menu">
            <div className="user-info">
              <strong>{user.email}</strong>
              <span>{user.roles[0]}</span>
            </div>
            <hr />
            {hasPerm("admin:access") && (
              <Link to="/admin" onClick={() => setMenuOpen(false)}>Admin Dashboard</Link>
            )}
            {hasPerm("users:search") && (
              <Link to="/users" onClick={() => setMenuOpen(false)}>User Management</Link>
            )}
            <hr />
            <button className="logout-link" onClick={logout}>Sign Out</button>
          </div>
        )}
      </div>
    </nav>
  );
};

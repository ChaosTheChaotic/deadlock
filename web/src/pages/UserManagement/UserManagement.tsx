import { useState } from "react";
import { trpc } from "@servs/client";
import { Navbar } from "@components/index";
import type { User } from "@serv/rlibs";

export const UserManagement = () => {
  const [emailSearch, setEmailSearch] = useState("");
  const [isModalOpen, setModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);

  const utils = trpc.useUtils();
  const { data: users } = trpc.searchUsers.useQuery({ email: emailSearch });

  const upsertMutation = trpc.updateUser.useMutation({
    onSuccess: () => {
      utils.searchUsers.invalidate();
      closeModal();
    },
  });

  const createMutation = trpc.addUser.useMutation({
    onSuccess: () => {
      utils.searchUsers.invalidate();
      closeModal();
    },
  });

  const deleteMutation = trpc.deleteUser.useMutation({
    onSuccess: () => utils.searchUsers.invalidate(),
  });

  const closeModal = () => {
    setModalOpen(false);
    setEditingUser(null);
  };

  const handleSave = (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const data = {
      email: formData.get("email") as string,
      pass: (formData.get("pass") as string) || undefined,
      roles: (formData.get("roles") as string)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      perms: (formData.get("perms") as string)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    };

    if (editingUser) {
      upsertMutation.mutate({ uid: editingUser.uid, ...data });
    } else {
      createMutation.mutate(data);
    }
  };

  return (
    <div className="page-container">
      <Navbar />
      <main className="content">
        <header className="content-header">
          <h2>User Directory</h2>
          <div className="header-actions">
            <input
              type="text"
              placeholder="Search by email..."
              onChange={(e) => setEmailSearch(e.target.value)}
              className="search-bar"
            />
            <button className="btn-primary" onClick={() => setModalOpen(true)}>
              + Add User
            </button>
          </div>
        </header>

        <table className="admin-table">
          <thead>
            <tr>
              <th>Email</th>
              <th>Roles</th>
              <th>Permissions</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users?.map((u) => (
              <tr key={u.uid}>
                <td>{u.email}</td>
                <td>{u.roles.join(", ")}</td>
                <td>{u.perms.join(", ")}</td>
                <td className="table-actions">
                  <button
                    onClick={() => {
                      setEditingUser(u);
                      setModalOpen(true);
                    }}
                  >
                    Edit
                  </button>
                  <button
                    className="btn-danger"
                    onClick={() =>
                      confirm("Delete user?") &&
                      deleteMutation.mutate({ email: u.email })
                    }
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </main>

      {isModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3>{editingUser ? "Edit User" : "Create New User"}</h3>
            <form onSubmit={handleSave}>
              <label>Email</label>
              <input
                name="email"
                defaultValue={editingUser?.email}
                required
                type="email"
              />

              <label>
                Password {editingUser && "(Leave blank to keep current)"}
              </label>
              <input name="pass" type="password" placeholder="••••••••" />

              <label>Roles (comma separated)</label>
              <input
                name="roles"
                defaultValue={editingUser?.roles.join(", ")}
                placeholder="admin, user"
              />

              <label>Permissions (comma separated)</label>
              <input
                name="perms"
                defaultValue={editingUser?.perms.join(", ")}
                placeholder="users:manage, admin:access"
              />

              <div className="modal-footer">
                <button type="button" onClick={closeModal}>
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={
                    upsertMutation.isPending || createMutation.isPending
                  }
                >
                  {editingUser ? "Update User" : "Create User"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

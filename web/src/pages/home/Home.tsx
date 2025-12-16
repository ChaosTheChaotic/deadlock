import { useState, type ChangeEvent } from "react";
import { useDebounce } from "@hooks/useDebounce";
import { trpc } from "@servs/client";
import "./Home.css";
import type { User } from "@serv/rlibs";

type UserFormData = {
  email: string;
  password: string;
  display: string;
};

type DeleteUserState = {
  email: string;
  status: "idle" | "success" | "error";
  message: string;
  deletedUser: User | null;
};

type CheckPasswordState = {
  email: string;
  password: string;
  result: string;
  isLoading: boolean;
};

export const HomePage = () => {
  const [search, setSearch] = useState({
    text: "",
    db: "",
  });

  const [userForm, setUserForm] = useState<UserFormData>({
    email: "",
    password: "",
    display: "",
  });

  const [deleteState, setDeleteState] = useState<DeleteUserState>({
    email: "",
    status: "idle",
    message: "",
    deletedUser: null,
  });

  const [checkPassState, setCheckPassState] = useState<CheckPasswordState>({
    email: "",
    password: "",
    result: "",
    isLoading: false,
  });

  const [uiState, setUiState] = useState({
    showPassword: false,
    showCheckPassword: false,
  });

  const debouncedDB = useDebounce(search.db, 500);

  const addUserMutation = trpc.addUser.useMutation();
  const deleteUserMutation = trpc.deleteUser.useMutation();
  const utils = trpc.useUtils();

  const { data: users, isLoading: isUsersLoading } = trpc.searchUsers.useQuery(
    { email: debouncedDB },
    {
      enabled: debouncedDB.length > 0,
    },
  );

  const handleInputChange = (
    field: keyof typeof search | keyof UserFormData,
    e: ChangeEvent<HTMLInputElement>,
  ) => {
    if (field in search) {
      setSearch((prev) => ({ ...prev, [field]: e.target.value }));
    } else {
      setUserForm((prev) => ({ ...prev, [field]: e.target.value }));
    }
  };

  const handleDeleteInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    setDeleteState((prev) => ({
      ...prev,
      email: e.target.value,
      status: "idle",
      message: "",
      deletedUser: null,
    }));
  };

  const handleCheckPassInputChange = (
    field: keyof Omit<CheckPasswordState, "result" | "isLoading">,
    e: ChangeEvent<HTMLInputElement>,
  ) => {
    setCheckPassState((prev) => ({
      ...prev,
      [field]: e.target.value,
      result: "", // Clear previous result when input changes
    }));
  };

  const togglePasswordVisibility = () => {
    setUiState((prev) => ({ ...prev, showPassword: !prev.showPassword }));
  };

  const toggleCheckPasswordVisibility = () => {
    setUiState((prev) => ({
      ...prev,
      showCheckPassword: !prev.showCheckPassword,
    }));
  };

  const handleAddUser = async () => {
    const { email, password } = userForm;

    if (!email.trim() || !password.trim()) {
      setUserForm((prev) => ({
        ...prev,
        display: "Error: Email and password are required",
      }));
      return;
    }

    try {
      const newUser = await addUserMutation.mutateAsync({
        email,
        pass: password,
      });
      setUserForm((prev) => ({
        ...prev,
        display: JSON.stringify(newUser, null, 2),
      }));

      // Clear form fields except display
      setUserForm((prev) => ({
        ...prev,
        email: "",
        password: "",
      }));
    } catch (error) {
      console.error("Add user error:", error);
      setUserForm((prev) => ({
        ...prev,
        display: `Error: ${error instanceof Error ? error.message : "Unknown error occurred"}`,
      }));
    }
  };

  const handleDeleteUser = async () => {
    const { email } = deleteState;

    if (!email.trim()) {
      setDeleteState((prev) => ({
        ...prev,
        status: "error",
        message: "Email is required to delete a user",
      }));
      return;
    }

    try {
      const deletedUser = await deleteUserMutation.mutateAsync({ email });

      setDeleteState({
        email: "",
        status: "success",
        message: "User deleted successfully!",
        deletedUser,
      });

      // Invalidate search users query to refresh the list
      utils.searchUsers.invalidate({ email: debouncedDB });
    } catch (error) {
      console.error("Delete user error:", error);
      setDeleteState((prev) => ({
        ...prev,
        status: "error",
        message: `Error: ${error instanceof Error ? error.message : "Failed to delete user"}`,
        deletedUser: null,
      }));
    }
  };

  const handleCheckPassword = async () => {
    const { email, password } = checkPassState;

    if (!email.trim() || !password.trim()) {
      setCheckPassState((prev) => ({
        ...prev,
        result: "Error: Both email and password are required",
      }));
      return;
    }

    setCheckPassState((prev) => ({ ...prev, isLoading: true }));

    try {
      const result = await utils.client.checkPass.query({
        email,
        pass: password,
      });

      setCheckPassState((prev) => ({
        ...prev,
        result:
          typeof result === "object"
            ? JSON.stringify(result, null, 2)
            : String(result),
        isLoading: false,
      }));
    } catch (error) {
      console.error("Check password error:", error);
      setCheckPassState((prev) => ({
        ...prev,
        result: `Error: ${error instanceof Error ? error.message : "Failed to check password"}`,
        isLoading: false,
      }));
    }
  };

  const canSubmitUser =
    userForm.email.length > 0 && userForm.password.length > 0;

  const canDeleteUser = deleteState.email.length > 0;

  const canCheckPassword =
    checkPassState.email.length > 0 && checkPassState.password.length > 0;

  return (
    <div className="home-page">
      <h1>The test home page</h1>

      {/* User Search Section */}
      <section className="user-search-section">
        <h2>Search DB:</h2>
        <input
          type="text"
          value={search.db}
          onChange={(e) => handleInputChange("db", e)}
          placeholder={"Search users by email"}
          className="search-input"
        />
        <p>
          Users:{" "}
          {isUsersLoading ? "Loading..." : JSON.stringify(users, null, 2)}
        </p>
      </section>

      {/* New User Form Section */}
      <section className="new-user-form">
        <h3>Add New User</h3>
        <div className="form-group">
          <input
            type="text"
            value={userForm.email}
            onChange={(e) => handleInputChange("email", e)}
            placeholder="Email"
            className="form-input"
          />
        </div>

        <div className="form-group password-group">
          <input
            type={uiState.showPassword ? "text" : "password"}
            value={userForm.password}
            onChange={(e) => handleInputChange("password", e)}
            placeholder="Password"
            className="form-input"
          />
          <button
            type="button"
            onClick={togglePasswordVisibility}
            className="toggle-password"
          >
            {uiState.showPassword ? "Hide" : "Show"} Password
          </button>
        </div>

        <button
          type="button"
          disabled={!canSubmitUser}
          onClick={handleAddUser}
          className="submit-button"
        >
          Submit user info
        </button>

        {userForm.display && (
          <pre className="user-display">New User: {userForm.display}</pre>
        )}
      </section>

      {/* Delete User Section */}
      <section className="delete-user-section">
        <h3>Delete User</h3>
        <div className="form-group">
          <input
            type="text"
            value={deleteState.email}
            onChange={handleDeleteInputChange}
            placeholder="Enter email to delete"
            className="form-input"
          />
        </div>

        <button
          type="button"
          disabled={!canDeleteUser || deleteUserMutation.isPending}
          onClick={handleDeleteUser}
          className={`delete-button ${deleteUserMutation.isPending ? "loading" : ""}`}
        >
          {deleteUserMutation.isPending ? "Deleting..." : "Delete User"}
        </button>

        {/* Status Messages */}
        {deleteState.status === "success" && (
          <div className="delete-status success">
            <p>{deleteState.message}</p>
            {deleteState.deletedUser && (
              <div className="deleted-user-preview">
                <h4>Deleted User Preview:</h4>
                <pre>{JSON.stringify(deleteState.deletedUser, null, 2)}</pre>
              </div>
            )}
          </div>
        )}

        {deleteState.status === "error" && (
          <div className="delete-status error">
            <p>{deleteState.message}</p>
          </div>
        )}
      </section>

      {/* Check Password Section */}
      <section className="check-password-section">
        <h3>Check a Password</h3>

        <div className="form-group">
          <input
            type="text"
            value={checkPassState.email}
            onChange={(e) => handleCheckPassInputChange("email", e)}
            placeholder="Enter email"
            className="form-input"
          />
        </div>

        <div className="form-group password-group">
          <input
            type={uiState.showCheckPassword ? "text" : "password"}
            value={checkPassState.password}
            onChange={(e) => handleCheckPassInputChange("password", e)}
            placeholder="Enter password to check"
            className="form-input"
          />
          <button
            type="button"
            onClick={toggleCheckPasswordVisibility}
            className="toggle-password"
          >
            {uiState.showCheckPassword ? "Hide" : "Show"} Password
          </button>
        </div>

        <button
          type="button"
          disabled={!canCheckPassword || checkPassState.isLoading}
          onClick={handleCheckPassword}
          className={`check-button ${checkPassState.isLoading ? "loading" : ""}`}
        >
          {checkPassState.isLoading ? "Checking..." : "Check Password"}
        </button>

        {/* Check Password Result */}
        {checkPassState.result && (
          <div
            className={`check-result ${checkPassState.result.includes("Error") ? "error" : "success"}`}
          >
            <h4>Result:</h4>
            <pre>{checkPassState.result}</pre>
          </div>
        )}
      </section>
    </div>
  );
};

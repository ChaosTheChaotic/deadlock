import { useState, type ChangeEvent } from "react";
import { useDebounce } from "../../hooks/useDebounce";
import { trpc } from "../../servs/client";
import "./Home.css";

type UserFormData = {
  email: string;
  password: string;
  display: string;
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

  const [uiState, setUiState] = useState({
    showPassword: false,
  });

  const debouncedText = useDebounce(search.text, 500);
  const debouncedDB = useDebounce(search.db, 500);

  const addUserMutation = trpc.addUser.useMutation();

  const { data: textData, isLoading: isTextLoading } = trpc.hello.useQuery(
    { name: debouncedText },
    {
      enabled: debouncedText.length > 0,
      refetchInterval: 2000,
    },
  );

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

  const togglePasswordVisibility = () => {
    setUiState((prev) => ({ ...prev, showPassword: !prev.showPassword }));
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
    } catch (error) {
      console.error("Add user error:", error);
      setUserForm((prev) => ({ ...prev, display: "Error occurred" }));
    }
  };

  const canSubmitUser =
    userForm.email.length > 0 && userForm.password.length > 0;

  return (
    <div className="home-page">
      <h1>The test home page</h1>

      {/* Text Input Section */}
      <section className="text-input-section">
        <form>
          <label>
            Enter some text:
            <input
              type="text"
              value={search.text}
              onChange={(e) => handleInputChange("text", e)}
              className="text-input"
            />
          </label>
          <p>Text: {search.text}</p>
          <p>Debounced: {debouncedText}</p>
          <p>Resp: {isTextLoading ? "Loading..." : textData}</p>
        </form>
      </section>

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
    </div>
  );
};

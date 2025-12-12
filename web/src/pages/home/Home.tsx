import { useEffect, useState, type ChangeEvent } from "react";
import { useDebounce } from "../../hooks/useDebounce";
import { trpc } from "../../servs/client";
import "./Home.css";

export const HomePage = () => {
  const [text, setText] = useState("");
  const [dbSearch, setDBSearch] = useState("");
  const [isInitialized, setIsInitialized] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [newUserDisplay] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const debouncedText = useDebounce(text, 500);
  const debouncedDB = useDebounce(dbSearch, 500);

  const initQuery = trpc.initDbs.useQuery(undefined, {
    enabled: false,
    retry: 2,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });

  useEffect(() => {
    // Trigger initialization on component mount
    const initDatabase = async () => {
      try {
        await initQuery.refetch();
        setIsInitialized(true);
        setInitError(null);
      } catch (error) {
        setInitError("Failed to initialize database");
        console.error("Database initialization error:", error);
      }
    };

    initDatabase();
  }, []);

  const { data: textData, isLoading: isTextLoading } = trpc.hello.useQuery(
    { name: debouncedText },
    {
      enabled: debouncedText.length > 0,
      refetchInterval: 2000,
    },
  );

  const { data: statusData, isLoading: isStatusLoading } =
    trpc.connectDB.useQuery(undefined, {
      enabled: isInitialized,
      refetchInterval: false,
    });

  const { data: users, isLoading: isUsersLoading } = trpc.searchUsers.useQuery(
    { email: debouncedDB },
    {
      enabled: isInitialized && debouncedDB.length > 0,
    },
  );

  async function changeText(
    callback: React.Dispatch<React.SetStateAction<string>>,
    e: ChangeEvent<HTMLInputElement>,
  ) {
    callback(e.target.value);
  }

  const togglePasswordVisibility = () => {
    setShowPassword(!showPassword);
  };

  async function addNewUser(email: string, pass: string) {
    // TODO: Add linking to the server endpoint for adding a new user
  }

  return (
    <>
      <h1>The test home page</h1>

      <div style={{ marginBottom: "1rem" }}>
        <p>
          Database Status:
          {initQuery.isLoading
            ? "Initializing..."
            : initError
              ? `Error: ${initError}`
              : !isInitialized
                ? "Not Initialized"
                : isStatusLoading
                  ? "Connecting..."
                  : statusData || "Connected"}
        </p>
        {initError && (
          <button
            onClick={() => window.location.reload()}
            style={{ padding: "0.5rem 1rem", marginTop: "0.5rem" }}
          >
            Retry Initialization
          </button>
        )}
      </div>

      <form>
        <label>
          Enter some text:
          <input
            type="text"
            value={text}
            onChange={(e) => changeText(setText, e)}
          />
        </label>
        <p>Text: {text}</p>
        <p>Debounced: {debouncedText}</p>
        <p>Resp: {isTextLoading ? "Loading..." : textData}</p>
      </form>

      <h2>Search DB:</h2>
      <input
        type="text"
        value={dbSearch}
        onChange={(e) => changeText(setDBSearch, e)}
        disabled={!isInitialized}
        placeholder={
          !isInitialized ? "Database initializing..." : "Search users by email"
        }
      />
      <p>
        Users: {isUsersLoading ? "Loading..." : JSON.stringify(users, null, 2)}
      </p>
      <input
	type="text"
	value={newUserEmail}
        onChange={(e) => changeText(setNewUserEmail, e)}
      />
      <input
	type={showPassword ? "text" : "password"}
	value={newUserPassword}
	onChange={(e) => changeText(setNewUserPassword, e)}
      />
      <button type="button" onClick={togglePasswordVisibility}>
        {showPassword ? 'Hide' : 'Show'} Password
      </button>
      <button type="button" onClick={() => addNewUser(newUserEmail, newUserPassword)}>
	Submit user info
      </button>
      <p>New User: {newUserDisplay}</p>
    </>
  );
};

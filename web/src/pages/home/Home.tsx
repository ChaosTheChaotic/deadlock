import { useState, type ChangeEvent } from "react";
import { useDebounce } from "../../hooks/useDebounce";
import { trpc } from "../../servs/client";
import "./Home.css";

export const HomePage = () => {
  const [text, setText] = useState("");
  const [dbSearch, setDBSearch] = useState("");

  const debouncedText = useDebounce(text, 500);
  const debouncedDB = useDebounce(dbSearch, 500);

  trpc.initDbs.useQuery(undefined, {
    enabled: true,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });

  const { data: textData, isLoading: isTextLoading } = trpc.hello.useQuery(
    { name: debouncedText },
    {
      enabled: debouncedText.length > 0,
      refetchInterval: 2000,
    },
  );

  const { data: statusData, isLoading: isStatusLoading } =
    trpc.connectDB.useQuery(undefined, {
      enabled: true,
      refetchInterval: 2000,
    });

  const { data: users, isLoading: isUsersLoading } = trpc.searchUsers.useQuery(
    { email: debouncedDB },
    {
      enabled: debouncedDB.length > 0,
    },
  );

  async function changeText(
    callback: React.Dispatch<React.SetStateAction<string>>,
    e: ChangeEvent<HTMLInputElement>,
  ) {
    callback(e.target.value);
  }

  return (
    <>
      <h1>The test home page</h1>
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
      <p>DB Status: {isStatusLoading ? "Loading..." : statusData}</p>
      <h2>Search DB:</h2>
      <input
        type="text"
        value={dbSearch}
        onChange={(e) => changeText(setDBSearch, e)}
      />
      <p>
        Users: {isUsersLoading ? "Loading..." : JSON.stringify(users, null, 2)}
      </p>
    </>
  );
};

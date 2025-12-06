import { useState, type ChangeEvent } from "react";
import { useDebounce } from "../../hooks/useDebounce";
import { trpc } from "../../servs/client";
import "./Home.css";

export const HomePage = () => {
  const [text, setText] = useState("");

  const debouncedText = useDebounce(text, 500);

  const { data, isLoading } = trpc.hello.useQuery(
    { name: debouncedText },

    {
      enabled: debouncedText.length > 0,
      refetchInterval: 2000,
    },
  );

  async function changeText(e: ChangeEvent<HTMLInputElement>) {
    setText(e.target.value);
  }

  return (
    <form>
      <label>
        Enter some text:
        <input type="text" value={text} onChange={changeText} />
      </label>
      <p>Text: {text}</p>
      <p>Debounced: {debouncedText}</p>
      <p>Resp: {isLoading ? "Loading..." : data}</p>
    </form>
  );
};

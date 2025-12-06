import { useState, type ChangeEvent } from "react";
import { useDebounce } from "../../hooks/useDebounce";
import { trpc } from "../../servs/client";
import "./Home.css";

export const HomePage = () => {
  const [text, setText] = useState("");

  const debouncedText = useDebounce(text, 500);

  const { data: textData, isLoading: isTextLoading } = trpc.hello.useQuery(
    { name: debouncedText },
    {
      enabled: debouncedText.length > 0,
      refetchInterval: 2000,
    },
  );

  const { data: timeDiffData, isLoading: isTimeDiffLoading } =
    trpc.timeDiff.useQuery(
      { msg: "Time" },
      {
        enabled: true,
        refetchInterval: 1000,
      },
    );

  async function changeText(e: ChangeEvent<HTMLInputElement>) {
    setText(e.target.value);
  }

  return (
    <>
      <h1>{isTimeDiffLoading ? "Loading..." : timeDiffData}</h1>
      <form>
        <label>
          Enter some text:
          <input type="text" value={text} onChange={changeText} />
        </label>
        <p>Text: {text}</p>
        <p>Debounced: {debouncedText}</p>
        <p>Resp: {isTextLoading ? "Loading..." : textData}</p>
      </form>
    </>
  );
};

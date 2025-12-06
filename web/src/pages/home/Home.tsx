import { useState, type ChangeEvent } from "react";
import { useDebounce } from "../../hooks/useDebounce";

export const HomePage = () => {
  const [text, setText] = useState("");

  const debouncedText = useDebounce(text, 500);

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
    </form>
  );
};

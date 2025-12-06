import { useState, type ChangeEvent } from "react";

export const HomePage = () => {
  const [text, setText] = useState("");

  async function changeText(e: ChangeEvent<HTMLInputElement>) {
    setText(e.target.value);
  }

  return (
    <form>
      <label>
        Enter some text:
        <input type="text" value={text} onChange={changeText} />
      </label>
      <p>Return: {text}</p>
    </form>
  );
};

import "/workspaces/deadlock/web/src/pages/FrontEndTest/QuestionsPage.css";
import { useEffect, useState } from "react";

type ButtonProps = {
    hex: string;
    text?: string;
    glow?: boolean;
    glow_spread?: number;
    front_offset?: number;
    className?: string;
    onClick?: () => void;
};

export function Button({
    hex,
    text,
    front_offset,
    glow,
    glow_spread,
    className,
    onClick,
}: ButtonProps) {
    const [colour, setColour] = useState<string>(hex ?? "#000000");

    useEffect(() => {
        setColour(hex);
    }, [hex]);

    const isHex = /^#[0-9A-F]{6}$/i.test(colour);
    if (!isHex) {
        return <button className="Pushable">Invalid Colour</button>;
    }

    const clamp = (v: number) => Math.max(0, Math.min(255, v));

    const hexToRgb = (hex: string) => {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result
            ? {
                  r: parseInt(result[1], 16),
                  g: parseInt(result[2], 16),
                  b: parseInt(result[3], 16),
              }
            : { r: 0, g: 0, b: 0 };
    };

    const componentToHex = (c: number) =>
        c.toString(16).padStart(2, "0");

    const rgbToHex = (r: number, g: number, b: number) =>
        `#${componentToHex(r)}${componentToHex(g)}${componentToHex(b)}`;

    const rgb = hexToRgb(colour);

    const darker = rgbToHex(
        clamp(rgb.r - 100),
        clamp(rgb.g - 100),
        clamp(rgb.b - 100),
    );

    const lighter = rgbToHex(
        clamp(rgb.r + 10),
        clamp(rgb.g + 10),
        clamp(rgb.b + 10),
    );

    const lightest = rgbToHex(
        clamp(rgb.r + 40),
        clamp(rgb.g + 40),
        clamp(rgb.b + 40),
    );

    const glowColour = lighter;

    const style = {
        "--top-button-color": colour,
        "--bottom-button-color": darker,
        "--button-hover-color": lighter,
        "--button-active-color": lightest,
        "--glow-color": glowColour,
        "--glow-spread": `${glow_spread ?? 10}px`,
        "--front-offset": `${front_offset ?? 2}px`,
    } as React.CSSProperties;

    return (
        <button className={className} style={style} onClick={onClick}>
            <span className={className + "Front"}>
                {text}
                {glow && <span className="Glow" />}
            </span>
        </button>
    );
}

export function shuffle<T>(array: T[]) {
    let currentIndex = array.length;
    while (currentIndex !== 0) {
        const randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex--;
        [array[currentIndex], array[randomIndex]] = [
            array[randomIndex],
            array[currentIndex],
        ];
    }
}

export function Options({
    choices,
}: {
    choices: string[];
    correct: string;
}) {
    const shuffled = [...choices];
    shuffle(shuffled);

    return (
        <div className="Options">
            {shuffled.map((choice) => (
                <Button
                    key={choice}
                    className="Pushable"
                    hex={`#205d83`}
                    text={choice}
                    glow
                    glow_spread={20}
                    front_offset={4}
                />
            ))}
        </div>
    );
}

export function MultipleChoice({
    question,
    choices,
    correct,
}: {
    question: string;
    choices: string[];
    correct: string;
}) {
    return (
        <div className = "MultipleChoice">
            <div className="Question">{question}</div>
            <Options choices={choices} correct={correct} />
            <div className="BottomBar">
                <Button
                    className="Submit"
                    hex="#008f66"
                    text="Submit"
                    glow
                    glow_spread={20}
                    front_offset={4}
                />
            </div>
        </div>
    );
}
export function TopBar() {
    return (
        <div className="TopBar">
            <div className="ProgressBar">
                <div className="ProgressBarFill" />
            </div>
            <button className="CloseButton">
                <span className="Left"></span>
                <span className="Right"></span>
            </button>
        </div>
    )
}
export function PageBar(set_page : any) {
    return (
        <div className="MainPageBar">
            <button className="MainPageBarLink" onClick = {() => set_page("Assignments")}>Assignments</button>
            <button className="MainPageBarLink">Revision</button>
            <button className="MainPageBarLink">Account</button>
            <button className="MainPageBarLink">Sign Out</button>
        </div>
    )
}
export  function MainPage() {
    return (
        <>
        <PageBar set_page></PageBar>
        <div className="MainPage">
            <div className="MainPageTitle">Welcome to the Quiz App!</div>
        </div>
        </>
        )
}
export function FrontEndQuestions() {   
        return (
            <main>
                <TopBar />
                <MultipleChoice
                question="Example Question"
                choices={["1", "2", "3", "5"]}
                correct="1"
                />
            </main>
    );
}

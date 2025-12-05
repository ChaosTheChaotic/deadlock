// ===============================
// Core data model
// ===============================

// A realised sentence pair in English and German.
export interface Sentence {
    en: string;
    de: string;
}

/**
 * Term:
 * Represents a single atomic piece of language with an
 * English form and a German form.
 */
export class Term {
    en: string;
    de: string;

    constructor(en: string, de: string) {
        this.en = en;
        this.de = de;
    }
}

/**
 * Section:
 * Represents one "slot" in a phrase that can be filled by
 * any of several alternative terms.
 */
export class Section {
    terms: Term[];

    constructor(terms: Term[]) {
        this.terms = terms;
    }
}

/**
 * Phrase:
 * Represents an ordered sequence of sections.
 * To realise a sentence, you pick exactly one term from each section.
 */
export class Phrase {
    sections: Section[];

    constructor(sections: Section[]) {
        this.sections = sections;
    }
}

/**
 * Grid:
 * Represents a teaching grid with a title, description,
 * and several phrases.
 */
export class Grid {
    title: string;
    description: string;
    phrases: Phrase[];

    constructor(title: string, description: string, phrases: Phrase[]) {
        this.title = title;
        this.description = description;
        this.phrases = phrases;
    }
}

// Example grid, slightly cleaned up.
export const Grid_intro_yourself = new Grid(
    "Introduce Yourself",
    "Learn how to introduce yourself",
    [
        // Phrase 1: "Hello"
        new Phrase([
            new Section([
                new Term("Hello", "Hallo")
            ])
        ]),

        // Phrase 2: "My name is <name>"
        new Phrase([
            new Section([
                new Term("My name is", "Ich heiße")
            ]),
            new Section([
                new Term("John", "John"),
                new Term("Mary", "Mary"),
                new Term("Alex", "Alex")
            ])
        ])
    ]
);
export function assembleAllSentencesFromPhrase(phrase: Phrase): Sentence[] {
    console.debug("Assembling sentences from phrase:", phrase);

    let partial: Sentence[] = [
        { en: "", de: "" }
    ]
    phrase.sections.forEach((section, sectionIndex) => {
        console.debug(`Processing section ${sectionIndex}:`, section)
        const newPartial: Sentence[] = [];
        partial.forEach((partialSentence) => {
            

        })
    }
    )
    return partial;
}

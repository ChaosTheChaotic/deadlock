// ===============================
// Core data model
// ===============================

// A realised sentence pair in English and German.
export type Sentence = {
  en: string;
  de: string;
};

/**
 * Term:
 * Represents a single atomic piece of language with an
 * English form and a German form.
 */
export type Term = {
  en: string;
  de: string;
};

/**
 * Section:
 * Represents one "slot" in a phrase that can be filled by
 * any of several alternative terms.
 */
export type Section = {
  terms: Term[];
};

/**
 * Phrase:
 * Represents an ordered sequence of sections.
 * To realise a sentence, you pick exactly one term from each section.
 */
export type Phrase = {
  sections: Section[];
};

/**
 * Grid:
 * Represents a teaching grid with a title, description,
 * and several phrases.
 */
export type Grid = {
  title: string;
  description: string;
  phrases: Phrase[];
};

// Example grid, slightly cleaned up.
export const Grid_intro_yourself: Grid = {
  title: "Introduce Yourself",
  description: "Learn how to introduce yourself",
  phrases: [
    // Phrase 1: "Hello"
    {
      sections: [
        {
          terms: [{ en: "Hello", de: "Hallo" }],
        },
      ],
    },

    // Phrase 2: "My name is <name>"
    {
      sections: [
        {
          terms: [
            { en: "I am called", de: "Ich heiße" },
            { en: "I am", de: "Ich bin" },
          ],
        },
        {
          terms: [
            { en: "John", de: "John" },
            { en: "Mary", de: "Mary" },
            { en: "Alex", de: "Alex" },
          ],
        },
      ],
    },
  ],
};
export function assembleAllSentencesFromPhrase(phrase: Phrase): Sentence[] {
  console.debug("Assembling sentences from phrase:", phrase);

  let partial: Sentence[] = [{ en: "", de: "" }];

  phrase.sections.forEach((section, sectionIndex) => {
    console.debug(`Processing section ${sectionIndex}:`, section);
    const newPartial: Sentence[] = [];

    partial.forEach((partialSentence) => {
      section.terms.forEach((term) => {
        newPartial.push({
          en: partialSentence.en + (partialSentence.en ? " " : "") + term.en,
          de: partialSentence.de + (partialSentence.de ? " " : "") + term.de,
        });
      });
    });

    partial = newPartial;
  });

  return partial;
}

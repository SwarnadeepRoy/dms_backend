import { resolver } from "hono-openapi/zod";
import { z } from "zod";
import "zod-openapi/extend";
import badwords from './data/badwords.json' with { type: "json" };



export const errorSchema = z.object({
    name: z.string().nullable(),
    message: z.string(),
}).openapi({
    title: "Error",
    example: {
        name: "Some error name",
        message: "Some error message",
    },
});


export const error500 = {
    description: "Internal server error",
    content: {
        "application/json": {
            schema: resolver(errorSchema),
            example: {
                name: "Internal server error",
                message: "Some error message",
            },
        },
    },
};



export const error404 = {
    description: "User not found",
    content: {
        "application/json": {
            schema: resolver(errorSchema),
            example: {
                name: "User not found",
                message: "User not found",
            },
        },
    },
};


export const error400 = {
    description: "Bad request",
    content: {
        "application/json": {
            schema: resolver(errorSchema),
            example: {
                name: "Bad request",
                message: "Bad request",
            },
        },
    },
};

export const resp200 = {
    description: "Successful response",
};

export const json200 = (schema: z.ZodType) => {
    return {
        description: "Successful response",
        content: {
            "application/json": {
                schema: resolver(schema),
            },
        },
    };
};



export const checkBadWord = (userInput: string, langCode: string) => {
    const words = badwords[langCode as keyof typeof badwords] as string[];

    if (!words || !Array.isArray(words)) {
        return false;
    }

    const cleanedInput = userInput.trim().toLowerCase();
    return words.includes(cleanedInput);
};

export const filterBadWords = (input: string, langCode: string) => {
    const textTemp = input.replace(/[.',|!|?']/g, '');
    const wordsToFilter = textTemp.toLowerCase().split(/\s+/); // Split the input into an array of words
    const filteredWords = wordsToFilter.map((word: string) => {
        if (checkBadWord(word, langCode)) {
            return `${word[0]}*****${word[word.length - 1]}`; // Replace bad words with *****
        }
        return word;
    });

    return filteredWords.join(' '); // Join the array back into a string
};

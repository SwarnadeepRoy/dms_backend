import { resolver } from "hono-openapi/zod";
import { z } from "zod";
import "zod-openapi/extend";



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

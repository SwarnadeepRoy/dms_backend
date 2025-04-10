import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { Scalar } from "@scalar/hono-api-reference";
import "zod-openapi/extend";
import { z } from "zod";
import { swaggerUI } from "@hono/swagger-ui";
import { describeRoute, openAPISpecs } from "hono-openapi";
import { resolver, validator as zValidator } from "hono-openapi/zod";

// import member from "./member";
// import manager from "./manager";


const app = new Hono();
app.use(logger());

app.get("/swagger", swaggerUI({ url: "/doc" }));

app.get(
  "/ui",
  Scalar({
    url: "/doc",
  }),
);




app.use(cors({
  origin: "*",
  allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowHeaders: [
    "Content-Type",
    "Authorization",
    "X-Requested-With",
    "Accept",
    "*",
  ],
  credentials: true,
}));

const querySchema = z.object({
  name: z.string().optional().openapi({
    title: "Name",
    example: "Hono",
    description: "Name of the user",
  }),
});

app.get(
  "/",
  describeRoute({
    method: "get",
    path: "/",
    description: "Say hello to the user",
    request: {
      query: resolver(querySchema),
    },
    responses: {
      200: {
        description: "Successful response",
        content: {
          "text/plain": {
            schema: resolver(z.string()),
            example: "Hello Hono!",
          },
        },
      },
    },
  }),
  zValidator("query", querySchema),
  (c) => {
    const { name } = c.req.query();
    return c.text(`Hello ${name ?? "Hono"}!`, 200);
  },
);


// app.route("/", member);
// app.route("/", manager);

app.get(
  "/doc",
  openAPISpecs(app, {
    documentation: {
      info: {
        title: "DMS Server",
        version: "1.0.0",
        description: "DMS project API",
      },
      servers: [
        {
          url: "http://localhost:8787",
          description: "Local server",
        },
        {
          url: "https://dms_backend.rony000013.workers.dev",
          description: "Production server",
        },
      ],
    },
  }),
);

export default app;

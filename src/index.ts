import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { Scalar } from "@scalar/hono-api-reference";
import "zod-openapi/extend";
import { z } from "zod";
import { swaggerUI } from "@hono/swagger-ui";
import { describeRoute, openAPISpecs } from "hono-openapi";
import { resolver } from "hono-openapi/zod";
import { HTTPException } from "hono/http-exception";
import { serve } from "@hono/node-server";
import dotenv from "dotenv";
import { blobMiddleware, dbMiddleware } from "./middlewares.js";
dotenv.config();

import files from "./files.js";
import members from "./members.js";
import workspace from "./workspace.js";
import permission from "./permission.js";

const app = new Hono();

app.use(blobMiddleware);
app.use(dbMiddleware);

app.use(logger());

app.get("/swagger", swaggerUI({ url: "/doc" }));

app.get(
	"/docs",
	Scalar({
		url: "/doc",
	}),
);

app.use(
	cors({
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
	}),
);

app.onError((error, c) => {
	if (error instanceof HTTPException) {
		const err = error as HTTPException;
		return c.json(
			{
				name: err.name,
				message: err.message,
			},
			err.status ?? 500,
		);
	}
	return c.json(
		{
			name: error.name,
			message: error.message,
		},
		500,
	);
});

app.get(
	"/health",
	describeRoute({
		tags: ["default"],
		description: "Health check",
		responses: {
			200: {
				description: "Successful response",
				content: {
					"text/plain": {
						schema: resolver(z.string()),
						example: "OK",
					},
				},
			},
		},
	}),
	async (c) => {
		return c.text("OK", 200);
	},
);

app.get(
	"/doc",
	openAPISpecs(app, {
		documentation: {
			info: {
				title: "DMS Backend API",
				version: "1.0.0",
				description: "Document Management System API",
			},
			servers: [
				{
					url: "http://localhost:8000",
					description: "Local server",
				},
				{
					url: "https://dms-backend-axc5efgse0d5bxan.canadacentral-01.azurewebsites.net",
					description: "Production server",
				}
			],
			tags: [
				{
					name: "default",
					description: "Default routes",
				},
			],
		},
	}),
);

app.route("/", files);
app.route("/", members);
app.route("/", workspace);
app.route("/", permission);

serve({
	fetch: app.fetch,
	port: Number(process.env.PORT) || 8000,
});

import { HTTPException } from "hono/http-exception";
import "zod-openapi/extend";
import { Hono } from "hono";
import { describeRoute } from "hono-openapi";
import { resolver, validator } from "hono-openapi/zod";
import z from "zod";
import type { AppContext } from "./middlewares.js";
import { users, filePermissions } from "../db/schema.js";
import { eq } from "drizzle-orm";

import { error400, error404, error500, json200 } from "./utils.js";

const app = new Hono();

// CREATE TABLE users (
//     user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
//     username VARCHAR(100) UNIQUE NOT NULL,
//     email VARCHAR(255) UNIQUE NOT NULL,
//     password_hash VARCHAR(255) NOT NULL, -- Store securely hashed passwords
//     first_name VARCHAR(100),
//     last_name VARCHAR(100),
//     is_active BOOLEAN DEFAULT TRUE,
//     manager_id UUID REFERENCES users(user_id) ON DELETE SET NULL ON UPDATE CASCADE, -- For general user hierarchy (optional, ensure type matches user_id if UUID)
//     created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
//     updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
// );

const userSchema = z.object({
	user_id: z.string().optional(),
	username: z.string(),
	email: z.string(),
	first_name: z.string(),
	last_name: z.string(),
	is_active: z.boolean(),
	is_manager: z.boolean().optional(),
	created_at: z.string().optional(),
	updated_at: z.string().optional(),
});

app.get(
	"/members",
	describeRoute({
		tags: ["members"],
		description: "Get all members",
		responses: {
			200: json200(z.array(userSchema)),
			500: error500,
		},
	}),
	async (c: AppContext) => {
		const db = c.get("db");
		const members = await db.select().from(users);
		return c.json(members);
	},
);

app.get(
	"/members/:id",
	describeRoute({
		tags: ["members"],
		description: "Get a specific member",
		parameters: [
			{
				name: "id",
				in: "path",
				required: true,
				schema: resolver(z.string()),
			},
		],
		responses: {
			200: json200(userSchema),
			404: error404,
			500: error500,
		},
	}),
	async (c: AppContext) => {
		const id = c.req.param("id");
		const db = c.get("db");
		const member = await db.select().from(users).where(eq(users.user_id, id));
		if (!member) {
			throw new HTTPException(404, { message: "Member not found" });
		}
		return c.json(member);
	},
);

app.post(
	"/members",
	describeRoute({
		tags: ["members"],
		description: "Create a new member",
		requestBody: {
			required: true,
			content: {
				"application/json": {
					schema: (await resolver(userSchema).builder()).schema,
				},
			},
		},
		responses: {
			200: json200(userSchema),
			500: error500,
		},
	}),
	validator("json", userSchema),
	async (c: AppContext) => {
		const body = await c.req.json();
		const db = c.get("db");
		console.log(body);
		const member = await db.insert(users).values(body).returning();
		if (member[0].is_manager) {
			await db.update(filePermissions).set({ can_view: true, can_edit: true, can_delete: true, can_share: true, can_download: true }).where(eq(filePermissions.user_id, member[0].user_id));
		}
		return c.json(member[0]);
	},
);

app.delete(
	"/members/:id",
	describeRoute({
		tags: ["members"],
		description: "Delete a member",
		parameters: [
			{
				name: "id",
				in: "path",
				required: true,
				schema: resolver(z.string()),
			},
		],
		responses: {
			200: json200(userSchema),
			404: error404,
			500: error500,
		},
	}),
	async (c: AppContext) => {
		const id = c.req.param("id");
		const db = c.get("db");
		const existingUser = await db.select().from(users).where(eq(users.user_id, id));
		if (existingUser.length === 0) {
			throw new HTTPException(404, { message: "Member not found" });
		}
		const member = await db.delete(users).where(eq(users.user_id, id)).returning();
		return c.json(member);
	},
);

app.post(
	"/members/manager/:id",
	describeRoute({
		tags: ["members"],
		description: "Set a member as manager",
		parameters: [
			{
				name: "id",
				in: "path",
				required: true,
				schema: resolver(z.string()),
			},
		],
		responses: {
			200: json200(userSchema),
			500: error500,
		},
	}),
	async (c: AppContext) => {
		const id = c.req.param("id");
		const db = c.get("db");
		const member = await db
			.update(users)
			.set({ is_manager: true })
			.where(eq(users.user_id, id))
			.returning();
		await db.update(filePermissions).set({ can_view: true, can_edit: true, can_delete: true, can_share: true, can_download: true }).where(eq(filePermissions.user_id, id));
		return c.json(member);
	},
);

app.delete(
	"/members/manager/:id",
	describeRoute({
		tags: ["members"],
		description: "Remove a member as manager",
		parameters: [
			{
				name: "id",
				in: "path",
				required: true,
				schema: resolver(z.string()),
			},
		],
		responses: {
			200: json200(userSchema),
			500: error500,
		},
	}),
	async (c: AppContext) => {
		const id = c.req.param("id");
		const db = c.get("db");
		const member = await db
			.update(users)
			.set({ is_manager: false })
			.where(eq(users.user_id, id))
			.returning();
		await db.update(filePermissions).set({ can_view: false, can_edit: false, can_delete: false, can_share: false, can_download: false }).where(eq(filePermissions.user_id, id));
		return c.json(member);
	},
);

export default app;

import { HTTPException } from "hono/http-exception";
import "zod-openapi/extend";
import { Hono } from "hono";
import { describeRoute } from "hono-openapi";
import { resolver } from "hono-openapi/zod";
import { z } from "zod";
import type { AppContext } from "./middlewares.js";
import { workspaces, workspaceMembers, users } from "../db/schema.js";
import { and, eq } from "drizzle-orm";

import { error400, error404, error500, json200 } from "./utils.js";

// CREATE TABLE workspaces (
//     workspace_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
//     name VARCHAR(255) NOT NULL,
//     description TEXT,
//     workspace_manager_id UUID NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT ON UPDATE CASCADE, -- Each workspace must have a manager
//     created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
//     updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
// );

// CREATE TABLE workspace_members (
//     workspace_member_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), -- Changed to UUID
//     user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE ON UPDATE CASCADE,
//     workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE ON UPDATE CASCADE,
//     joined_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
//     role VARCHAR(50) DEFAULT 'member', -- e.g., 'editor', 'viewer'
//     UNIQUE (user_id, workspace_id) -- A user can only be a member of a workspace once
// );

const workspaceSchema = z.object({
	workspace_id: z.string().optional(),
	name: z.string(),
	description: z.string(),
	workspace_manager_id: z.string(),
	created_at: z.string().optional(),
	updated_at: z.string().optional(),
});

const app = new Hono();

app.get(
	"/workspaces",
	describeRoute({
		tags: ["workspaces"],
		description: "Get all workspaces",
		responses: {
			200: json200(z.array(workspaceSchema)),
			500: error500,
		},
	}),
	async (c: AppContext) => {
		const db = c.get("db");
		const res = await db.select().from(workspaces);
		return c.json(res, 200);
	},
);

app.get(
	"/workspaces/:id",
	describeRoute({
		tags: ["workspaces"],
		description: "Get a specific workspace",
		parameters: [
			{
				name: "id",
				in: "path",
				required: true,
				schema: resolver(z.string()),
			},
		],
		responses: {
			200: json200(workspaceSchema),
			404: error404,
			500: error500,
		},
	}),
	async (c: AppContext) => {
		const id = c.req.param("id");
		const db = c.get("db");
		const workspace = await db
			.select()
			.from(workspaces)
			.where(eq(workspaces.workspaceId, id))
			.limit(1);
		if (workspace.length === 0) {
			throw new HTTPException(404, { message: "Workspace not found" });
		}
		return c.json(workspace[0]);
	},
);

app.post(
	"/workspaces/:userId",
	describeRoute({
		tags: ["workspaces"],
		description: "Create a new workspace",
		parameters: [
			{
				name: "userId",
				in: "path",
				required: true,
				schema: resolver(z.string()),
			}
		],
		requestBody: {
			required: true,
			content: {
				"application/json": {
					schema: (await resolver(workspaceSchema).builder()).schema,
				}
			}
		},
		responses: {
			200: json200(workspaceSchema),
			400: error400,
			404: error404,
			500: error500,
		},
	}),
	async (c: AppContext) => {
		const body = await c.req.json();
		const userId = c.req.param("userId");
		const db = c.get("db");
		const user = await db.select().from(users).where(eq(users.userId, userId));
		if (user.length === 0) {
			throw new HTTPException(404, { message: "User not found" });
		}
		if (!user[0].isManager) {
			throw new HTTPException(400, { message: "User is not a manager" });
		}
		const workspace = await db.insert(workspaces).values(body).returning();
		if (workspace.length === 0) {
			throw new HTTPException(500, { message: "Failed to create workspace" });
		}
		return c.json(workspace[0]);
	},
);

const memberAddSchema = z.object({
	workspace_id: z.string(),
	user_id: z.string(),
	grantedById: z.string(),
});

app.post(
	"/workspaces/member",
	describeRoute({
		tags: ["workspaces"],
		description: "Add a member to a workspace",
		requestBody: {
			required: true,
			content: {
				"application/json": {
					schema: (await resolver(memberAddSchema).builder()).schema,
				},
			},
		},
		responses: {
			200: json200(workspaceSchema),
			400: error400,
			404: error404,
			500: error500,
		},
	}),
	async (c: AppContext) => {
		const body = await c.req.json();
		const db = c.get("db");
		const user = await db.select().from(users).where(eq(users.userId, body.grantedById));
		if (user.length === 0) {
			throw new HTTPException(404, { message: "User not found" });
		}
		if (!user[0].isManager) {
			throw new HTTPException(400, { message: "User is not a manager" });
		}
		const workspace = await db
			.insert(workspaceMembers)
			.values({ workspaceId: body.workspaceId, userId: body.userId })
			.returning();
		return c.json(workspace);
	},
);

const memberRemoveSchema = z.object({
	workspace_id: z.string(),
	user_id: z.string(),
	grantedById: z.string(),
});

app.delete(
	"/workspaces/member",
	describeRoute({
		tags: ["workspaces"],
		description: "Remove a member from a workspace",
		requestBody: {
			required: true,
			content: {
				"application/json": {
					schema: (await resolver(memberRemoveSchema).builder()).schema,
				},
			},
		},
		responses: {
			200: json200(workspaceSchema),
			400: error400,
			404: error404,
			500: error500,
		},
	}),
	async (c: AppContext) => {
		const body = await c.req.json();
		const db = c.get("db");
		const user = await db.select().from(users).where(eq(users.userId, body.grantedById));
		if (user.length === 0) {
			throw new HTTPException(404, { message: "User not found" });
		}
		if (!user[0].isManager) {
			throw new HTTPException(400, { message: "User is not a manager" });
		}
		const workspace = await db
			.delete(workspaceMembers)
			.where(
				and(
					eq(workspaceMembers.workspaceId, body.workspaceId),
					eq(workspaceMembers.userId, body.userId),
				),
			)
			.returning();
		return c.json(workspace);
	},
);

export default app;

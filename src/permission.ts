import { HTTPException } from "hono/http-exception";
import "zod-openapi/extend";
import { Hono } from "hono";
import { describeRoute } from "hono-openapi";
import { resolver, validator } from "hono-openapi/zod";
import { env } from "hono/adapter";
import z from "zod";

import { error400, error404, error500, json200 } from "./utils.js";
import { filePermissions, users } from "../db/schema.js";
import type { AppContext } from "./middlewares.js";
import { eq } from "drizzle-orm";

const app = new Hono();

const permissionSchema = z.object({
	permission_id: z.string().optional(),
	file_id: z.string(),
	user_id: z.string(),
	workspace_id: z.string(),
	can_view: z.boolean().optional(),
	can_edit: z.boolean().optional(),
	can_delete: z.boolean().optional(),
	can_share: z.boolean().optional(),
	can_download: z.boolean().optional(),
	granted_by_id: z.string(),
	granted_at: z.date().optional(),
});

app.get(
	"/permissions",
	describeRoute({
		tags: ["permissions"],
		description: "Get all permissions",
		responses: {
			200: json200(z.array(permissionSchema)),
			404: error404,
			500: error500,
		},
	}),
	async (c: AppContext) => {
		const db = c.get("db");
		const res = await db.select().from(filePermissions);
		return c.json(res, 200);
	},
);

app.post(
	"/permissions",
	describeRoute({
		tags: ["permissions"],
		description: "Create a new permission",
		requestBody: {
			required: true,
			content: {
				"application/json": {
					schema: (await resolver(permissionSchema).builder()).schema,
				},
			},
		},
		responses: {
			200: json200(permissionSchema),
			400: error400,
			404: error404,
			500: error500,
		},
	}),
	validator("json", permissionSchema),
	async (c: AppContext) => {
		const body = await c.req.json<z.infer<typeof permissionSchema>>();
		const db = c.get("db");
		const user = await db
			.select()
			.from(users)
			.where(eq(users.user_id, body.granted_by_id))
			.limit(1);
		if (!user) {
			throw new HTTPException(404, { message: "User not found" });
		}
		if (!user[0].is_manager) {
			throw new HTTPException(400, { message: "User is not a manager" });
		}
		const {
			file_id,
			user_id,
			workspace_id,
			can_view,
			can_edit,
			can_delete,
			can_share,
			can_download,
			granted_by_id,
		} = body;
		const permission = await db
			.insert(filePermissions)
			.values({
				file_id,
				user_id,
				workspace_id,
				can_view,
				can_edit,
				can_delete,
				can_share,
				can_download,
				granted_by_id,
			})
			.returning();
		if (!permission) {
			throw new HTTPException(404, { message: "Permission not found" });
		}
		return c.json(permission);
	},
);

app.put(
	"/permissions",
	describeRoute({
		tags: ["permissions"],
		description: "Update a permission",
		requestBody: {
			required: true,
			content: {
				"application/json": {
					schema: (await resolver(permissionSchema).builder()).schema,
				},
			},
		},
		responses: {
			200: json200(permissionSchema),
			400: error400,
			404: error404,
			500: error500,
		},
	}),
	async (c: AppContext) => {
		const body = await c.req.json<z.infer<typeof permissionSchema>>();
		const db = c.get("db");
		const user = await db
			.select()
			.from(users)
			.where(eq(users.user_id, body.granted_by_id))
			.limit(1);
		if (!user) {
			throw new HTTPException(404, { message: "User not found" });
		}
		if (!user[0].is_manager) {
			throw new HTTPException(400, { message: "User is not a manager" });
		}
		const permission = await db
			.update(filePermissions)
			.set(body)
			.where(eq(filePermissions.permission_id, body.permission_id || ""))
			.returning();
		if (!permission) {
			throw new HTTPException(404, { message: "Permission not found" });
		}
		return c.json(permission);
	},
);

app.delete(
	"/permissions/:id",
	describeRoute({
		tags: ["permissions"],
		description: "Delete a permission",
		parameters: [
			{
				name: "id",
				in: "path",
				required: true,
				schema: resolver(z.string()),
			},
		],
		responses: {
			200: json200(permissionSchema),
			404: error404,
			500: error500,
		},
	}),
	async (c: AppContext) => {
		const id = c.req.param("id");
		const db = c.get("db");
		const user = await db
			.select()
			.from(users)
			.where(eq(users.user_id, id))
			.limit(1);
		if (!user) {
			throw new HTTPException(404, { message: "User not found" });
		}
		if (!user[0].is_manager) {
			throw new HTTPException(400, { message: "User is not a manager" });
		}
		const permission = await db
			.delete(filePermissions)
			.where(eq(filePermissions.permission_id, id))
			.returning();
		if (!permission) {
			throw new HTTPException(404, { message: "Permission not found" });
		}
		return c.json(permission);
	},
);

export default app;

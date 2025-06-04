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
	permissionId: z.string().optional(),
	fileId: z.string(),
	userId: z.string(),
	workspaceId: z.string(),
	canView: z.boolean().optional(),
	canEdit: z.boolean().optional(),
	canDelete: z.boolean().optional(),
	canShare: z.boolean().optional(),
	canDownload: z.boolean().optional(),
	grantedById: z.string(),
	grantedAt: z.date().optional(),
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
	async (c: AppContext) => {
		const body = await c.req.json<z.infer<typeof permissionSchema>>();
		const db = c.get("db");
		const user = await db
			.select()
			.from(users)
			.where(eq(users.userId, body.grantedById))
			.limit(1);
		if (!user) {
			throw new HTTPException(404, { message: "User not found" });
		}
		if (!user[0].isManager) {
			throw new HTTPException(400, { message: "User is not a manager" });
		}
		const {
			fileId,
			userId,
			workspaceId,
			canView,
			canEdit,
			canDelete,
			canShare,
			canDownload,
			grantedById,
		} = body;
		const permission = await db
			.insert(filePermissions)
			.values({
				fileId,
				userId,
				workspaceId,
				canView,
				canEdit,
				canDelete,
				canShare,
				canDownload,
				grantedById,
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
		const permission = await db
			.update(filePermissions)
			.set(body)
			.where(eq(filePermissions.permissionId, body.permissionId || ""))
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
		const permission = await db
			.delete(filePermissions)
			.where(eq(filePermissions.permissionId, id))
			.returning();
		if (!permission) {
			throw new HTTPException(404, { message: "Permission not found" });
		}
		return c.json(permission);
	},
);

export default app;

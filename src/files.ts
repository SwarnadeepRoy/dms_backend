import { type Context, Hono, type Next } from "hono";
import { HTTPException } from "hono/http-exception";
import "zod-openapi/extend";
import { describeRoute } from "hono-openapi";
import { resolver, validator } from "hono-openapi/zod";
import { BlobServiceClient, type ContainerClient } from "@azure/storage-blob";
import { env } from "hono/adapter";
import z from "zod";
import type { AppContext } from "./middlewares.js";
import { error400, error404, error500, json200, resp200 } from "./utils.js";
import { users, files, filePermissions } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";

const app = new Hono();

const fileSchema = z.object({
	fileId: z.string().uuid().nullable(),
	workspaceId: z.string().uuid().nullable(),
	uploaderId: z.string().uuid().nullable(),
	fileName: z.string(),
	filePath: z.string(),
	fileType: z.string().nullable(),
	fileSizeBytes: z.number().nullable(),
	version: z.number().int().nullable(),
	description: z.string().nullable(),
	createdAt: z.date().nullable(),
	updatedAt: z.date().nullable(),
});

app.post(
	"/upload/:userId/:workspaceId",
	describeRoute({
		tags: ["files"],
		description: "Upload a file to Azure Blob Storage",
		parameters: [
			{
				name: "userId",
				in: "path",
				required: true,
				schema: resolver(z.string()),
			},
			{
				name: "workspaceId",
				in: "path",
				required: true,
				schema: resolver(z.string()),
			},
		],
		requestBody: {
			content: {
				"application/octet-stream": {
					schema: {
						type: "string",
						format: "binary",
					},
				},
			},
		},
		responses: {
			200: json200(fileSchema),
			400: error400,
			404: error404,
			500: error500,
		},
	}),
	async (c: AppContext) => {
		const userId = c.req.param("userId");
		const workspaceId = c.req.param("workspaceId");
		const body = await c.req.blob();
		const filename = c.req.header("x-filename") || "uploaded_file"; // Get filename from header or use default
		const contentType =
			c.req.header("content-type") || "application/octet-stream";

		const db = c.get("db");
		const user = await db.select().from(users).where(eq(users.userId, userId));
		if (user.length === 0) {
			throw new HTTPException(404, { message: "User not found" });
		}

		const blobDb = c.get("blob") as ContainerClient;
		const blockBlobClient = blobDb.getBlockBlobClient(filename);

		const arrayBuffer = await body.arrayBuffer();
		const bytes = new Uint8Array(arrayBuffer);

		await blockBlobClient.upload(bytes, bytes.byteLength, {
			blobHTTPHeaders: {
				blobContentType: contentType,
			},
		});

		const file = await db
			.insert(files)
			.values({
				fileId: uuidv4(),
				fileName: filename,
				filePath: blockBlobClient.url,
				uploaderId: userId,
				workspaceId: workspaceId,
				version: 1,
			})
			.returning();

		return c.json(file, 200);
	},
);

app.get(
	"/files",
	describeRoute({
		tags: ["files"],
		description: "Get a specific file from the container",
		responses: {
			200: json200(z.array(fileSchema)),
			500: error500,
		},
	}),
	async (c: AppContext) => {
		const db = c.get("db");
		const filesList = await db.select().from(files);

		return c.json(filesList, 200);
	},
);

app.get(
	"/file/:fileId/:userId",
	describeRoute({
		tags: ["files"],
		description: "Get a specific blob from the container",
		parameters: [
			{
				name: "fileId",
				in: "path",
				required: true,
				schema: resolver(z.string()),
			},
			{
				name: "userId",
				in: "path",
				required: true,
				schema: resolver(z.string()),
			},
		],
		responses: {
			200: resp200,
			404: error404,
			500: error500,
		},
	}),
	async (c: AppContext) => {
		const file_id = c.req.param("fileId");
		const user_id = c.req.param("userId");
		const db = c.get("db");
		const user = await db
			.select()
			.from(users)
			.where(eq(users.userId, user_id))
			.limit(1);
		if (!user[0]) {
			throw new HTTPException(404, { message: "User not found" });
		}
		const permissions = await db
			.select()
			.from(filePermissions)
			.where(eq(filePermissions.userId, user_id))
			.limit(1);
		if (permissions.length === 0 || !permissions[0].canView) {
			throw new HTTPException(403, {
				message: "User does not have permission to view files",
			});
		}

		const file = await db
			.select()
			.from(files)
			.where(eq(files.fileId, file_id))
			.limit(1);
		if (file.length === 0) {
			throw new HTTPException(404, { message: "File not found" });
		}
		return c.text(file[0].filePath);
	},
);

app.get(
	"/file/:fileId/versions",
	describeRoute({
		tags: ["files"],
		description: "Get all versions of a specific blob",
		parameters: [
			{
				name: "fileId",
				in: "path",
				required: true,
				schema: resolver(z.string()),
			},
		],
		responses: {
			200: json200(z.array(z.string())),
			404: error404,
			500: error500,
		},
	}),
	async (c: AppContext) => {
		const blobDb = c.get("blob") as ContainerClient;
		const fileId = c.req.param("fileId");
		const db = c.get("db");
		const file = await db
			.select()
			.from(files)
			.where(eq(files.fileId, fileId))
			.limit(1);
		if (file.length === 0) {
			throw new HTTPException(404, { message: "File not found" });
		}
		const filename = file[0].fileName;

		const versions = [];
		for await (const blob of blobDb.listBlobsFlat({ includeVersions: true })) {
			if (blob.name === filename) {
				versions.push(blob.versionId);
			}
		}

		if (versions.length === 0) {
			throw new HTTPException(404, {
				message: "Blob not found or no versions available",
			});
		}

		return c.json(versions, 200);
	},
);

app.get(
	"/file/:fileId/version/:versionId",
	describeRoute({
		tags: ["files"],
		description: "Get a specific version of a blob",
		parameters: [
			{
				name: "fileId",
				in: "path",
				required: true,
				schema: resolver(z.string()),
			},
			{
				name: "versionId",
				in: "path",
				required: true,
				schema: resolver(z.string()),
			},
		],
		responses: {
			200: resp200,
			404: error404,
			500: error500,
		},
	}),
	async (c: AppContext) => {
		const blobDb = c.get("blob") as ContainerClient;
		const fileId = c.req.param("fileId");
		const versionId = c.req.param("versionId");

		const db = c.get("db");
		const file = await db
			.select()
			.from(files)
			.where(eq(files.fileId, fileId))
			.limit(1);
		if (file.length === 0) {
			throw new HTTPException(404, { message: "File not found" });
		}

		const blob = blobDb.getBlobClient(file[0].fileName);
		if (!blob.exists()) {
			throw new HTTPException(404, {
				message: "Blob not found or version not available",
			});
		}

		const versionedBlob = blob.withVersion(versionId);

		return c.text(versionedBlob.url);
	},
);

export default app;

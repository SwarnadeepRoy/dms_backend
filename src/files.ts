import { type Context, Hono, type Next } from "hono";
import { HTTPException } from "hono/http-exception";
import "zod-openapi/extend";
import { describeRoute } from "hono-openapi";
import { resolver, validator } from "hono-openapi/zod";
import { BlobServiceClient, type ContainerClient } from "@azure/storage-blob";
import z from "zod";
import type { AppContext } from "./middlewares.js";
import { error400, error404, error500, json200, resp200, filterBadWords } from "./utils.js";
import { users, files, filePermissions } from "../db/schema.js";
import { eq } from "drizzle-orm";

const app = new Hono();

const fileSchema = z.object({
	file_id: z.string().uuid().nullable(),
	workspace_id: z.string().uuid().nullable(),
	uploader_id: z.string().uuid().nullable(),
	file_name: z.string(),
	file_path: z.string(),
	file_type: z.string().nullable(),
	file_size_bytes: z.number().nullable(),
	version: z.number().int().nullable(),
	description: z.string().nullable(),
	created_at: z.date().nullable(),
	updated_at: z.date().nullable(),
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
			{
				name: "filename",
				in: "query",
				required: true,
				schema: resolver(z.string()),
			},
			{
				name: "fileId",
				in: "query",
				required: false,
				schema: resolver(z.string().uuid()),
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
		const user_id = c.req.param("userId");
		const workspace_id = c.req.param("workspaceId");
		const body = await c.req.blob();
		const filename = c.req.query("filename") || "uploaded_file"; // Get filename from header or use default
		const file_id = c.req.query("fileId");
		const contentType =
			c.req.header("content-type") || "application/octet-stream";

		const db = c.get("db");
		const user = await db.select().from(users).where(eq(users.user_id, user_id));
		if (user.length === 0) {
			throw new HTTPException(404, { message: "User not found" });
		}

		const blobDb = c.get("blob") as ContainerClient;
		const blockBlobClient = blobDb.getBlockBlobClient(filename);

		const arrayBuffer = await body.arrayBuffer();
		let bytes = new Uint8Array(arrayBuffer);
		const bytes_length = bytes.length;

		if (contentType === "text/plain" || contentType === "application/json" || contentType === "application/xml" || contentType === "application/rtf" || contentType === "application/msword") {
			const text = new TextDecoder().decode(bytes);
			const filteredText = filterBadWords(text, "en");
			bytes = new TextEncoder().encode(filteredText);
		}

		await blockBlobClient.upload(bytes, bytes.byteLength, {
			blobHTTPHeaders: {
				blobContentType: contentType,
			},
		});

		if (file_id) {
			const file = await db.select().from(files).where(eq(files.file_id, file_id));
			if (file.length === 0) {
				throw new HTTPException(404, { message: "File not found" });
			}
			const newFile = await db
				.update(files)
				.set({
					file_name: filename,
					file_path: blockBlobClient.url,
					file_type: contentType,
					file_size_bytes: bytes_length,
					uploader_id: user_id,
					workspace_id: workspace_id,
					version: file[0].version || 0 + 1,
				})
				.where(eq(files.file_id, file_id))
				.returning();
			return c.json(newFile[0], 200);
		}

		const file = await db
			.insert(files)
			.values({
				file_name: filename,
				file_path: blockBlobClient.url,
				file_type: contentType,
				file_size_bytes: bytes_length,
				uploader_id: user_id,
				workspace_id: workspace_id,
				version: 1,
			})
			.returning();
		return c.json(file[0], 200);
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

const fileQuery = z.object({
	file_id: z.string().uuid(),
	user_id: z.string().uuid(),
});

app.get(
	"/file",
	describeRoute({
		tags: ["files"],
		description: "Get a specific blob from the container",
		parameters: [
			{
				name: "file_id",
				in: "query",
				required: true,
				schema: resolver(z.string().uuid()),
			},
			{
				name: "user_id",
				in: "query",
				required: true,
				schema: resolver(z.string().uuid()),
			},
		],
		responses: {
			200: resp200,
			400: error400,
			404: error404,
			500: error500,
		},
	}),
	validator("query", fileQuery),
	async (c: AppContext) => {
		const { file_id, user_id } = c.req.query();
		const db = c.get("db");
		const user = await db
			.select()
			.from(users)
			.where(eq(users.user_id, user_id))
			.limit(1);
		if (!user[0]) {
			throw new HTTPException(404, { message: "User not found" });
		}
		const permissions = await db
			.select()
			.from(filePermissions)
			.where(eq(filePermissions.user_id, user_id))
			.limit(1);
		if (permissions.length === 0 || !permissions[0].can_view) {
			throw new HTTPException(403, {
				message: "User does not have permission to view files",
			});
		}

		const file = await db
			.select()
			.from(files)
			.where(eq(files.file_id, file_id))
			.limit(1);
		if (file.length === 0) {
			throw new HTTPException(404, { message: "File not found" });
		}
		return c.text(file[0].file_path);
	},
);

app.get(
	"/file/versions/:fileId",
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
			.where(eq(files.file_id, fileId))
			.limit(1);
		if (file.length === 0) {
			throw new HTTPException(404, { message: "File not found" });
		}
		const filename = file[0].file_name;

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
	"/file/versions/:fileId/:versionId",
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
			.where(eq(files.file_id, fileId))
			.limit(1);
		if (file.length === 0) {
			throw new HTTPException(404, { message: "File not found" });
		}

		const blob = blobDb.getBlobClient(file[0].file_name);
		if (!blob.exists()) {
			throw new HTTPException(404, {
				message: "Blob not found or version not available",
			});
		}

		const versionedBlob = blob.withVersion(versionId);

		console.log(versionedBlob);
		return c.text(versionedBlob.url);
	},
);

app.delete("/file/:fileId",
	describeRoute({
		tags: ["files"],
		description: "Delete a file",
		parameters: [
			{
				name: "fileId",
				in: "path",
				required: true,
				schema: resolver(z.string().uuid()),
			},
		],
		responses: {
			200: json200(fileSchema),
			404: error404,
			500: error500,
		},
	}),
	async (c: AppContext) => {
		const fileId = c.req.param("fileId");
		const db = c.get("db");
		const file = await db
			.delete(files)
			.where(eq(files.file_id, fileId))
			.returning();
		if (!file) {
			throw new HTTPException(404, { message: "File not found" });
		}
		return c.json(file);
	},
);

export default app;

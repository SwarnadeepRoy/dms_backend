import { type ContainerClient, BlobServiceClient } from "@azure/storage-blob";
import { neon } from '@neondatabase/serverless';
import type { Next, Context } from "hono";
import { drizzle, type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { env } from 'hono/adapter'



export async function blobMiddleware(c: AppContext, next: Next) {
    if (
        !env<{ AZURE_STORAGE_CONNECTION_STRING: string }>(c).AZURE_STORAGE_CONNECTION_STRING ||
        !env<{ AZURE_STORAGE_CONTAINER_NAME: string }>(c).AZURE_STORAGE_CONTAINER_NAME
    ) {
        throw new Error("Azure Storage configuration is missing");
    }
    const blobServiceClient = BlobServiceClient.fromConnectionString(
        env<{ AZURE_STORAGE_CONNECTION_STRING: string }>(c).AZURE_STORAGE_CONNECTION_STRING || "",
    );
    const containerClient = blobServiceClient.getContainerClient(env<{ AZURE_STORAGE_CONTAINER_NAME: string }>(c).AZURE_STORAGE_CONTAINER_NAME || "");

    await containerClient.createIfNotExists();

    c.set('blob', containerClient);

    await next();
}

export async function dbMiddleware(c: AppContext, next: Next) {
    if (
        !env<{ DATABASE_URL: string }>(c).DATABASE_URL
    ) {
        throw new Error("Azure Storage configuration is missing");
    }
    const sql = neon(env<{ DATABASE_URL: string }>(c).DATABASE_URL);
    const db = drizzle({ client: sql });

    c.set('db', db);
    await next();
}

type Variables = {
    blob: ContainerClient;
    db: NeonHttpDatabase;
};

export type AppContext = Context<{
    Variables: Variables,
    env: {
        AZURE_STORAGE_CONNECTION_STRING: string,
        AZURE_STORAGE_CONTAINER_NAME: string,
        DATABASE_URL: string
    }
}>;

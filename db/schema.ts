import {
	pgTable,
	pgSchema,
	uuid,
	varchar,
	text,
	timestamp,
	boolean,
	bigint,
	integer,
	jsonb,
	pgEnum,
	unique,
	type PgTable,
} from "drizzle-orm/pg-core";

import { relations } from "drizzle-orm";

// Enums for user roles and permissions
export const userRoleEnum = pgEnum("user_role", ["member", "editor", "viewer"]);
export const actionTypeEnum = pgEnum("action_type", [
	"FILE_UPLOAD",
	"FILE_VIEW",
	"FILE_EDIT",
	"FILE_DELETE",
	"PERMISSION_GRANT",
	"PERMISSION_REVOKE",
	"USER_LOGIN",
	"USER_LOGOUT",
	"WORKSPACE_CREATE",
	"WORKSPACE_UPDATE",
	"WORKSPACE_DELETE",
]);

export const targetEntityTypeEnum = pgEnum("target_entity_type", [
	"FILE",
	"USER",
	"WORKSPACE",
	"PERMISSION",
]);

// Users Table
export const users = pgTable("users", {
	userId: uuid("user_id").primaryKey().defaultRandom(),
	username: varchar("username", { length: 100 }).notNull().unique(),
	email: varchar("email", { length: 255 }).notNull().unique(),
	passwordHash: varchar("password_hash", { length: 255 }).notNull(),
	firstName: varchar("first_name", { length: 100 }),
	lastName: varchar("last_name", { length: 100 }),
	isActive: boolean("is_active").default(true),
	isManager: boolean("is_manager").default(false),
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// Workspaces Table
export const workspaces = pgTable("workspaces", {
	workspaceId: uuid("workspace_id").primaryKey().defaultRandom(),
	name: varchar("name", { length: 255 }).notNull(),
	description: text("description"),
	workspaceManagerId: uuid("workspace_manager_id")
		.notNull()
		.references(() => users.userId, {
			onDelete: "restrict",
			onUpdate: "cascade",
		}),
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// Workspace Members Table
export const workspaceMembers = pgTable(
	"workspace_members",
	{
		workspaceMemberId: uuid("workspace_member_id").primaryKey().defaultRandom(),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.userId, {
				onDelete: "cascade",
				onUpdate: "cascade",
			}),
		workspaceId: uuid("workspace_id")
			.notNull()
			.references(() => workspaces.workspaceId, {
				onDelete: "cascade",
				onUpdate: "cascade",
			}),
		joinedAt: timestamp("joined_at", { withTimezone: true }).defaultNow(),
		role: userRoleEnum("role").default("member"),
	},
	(table) => ({
		// Composite unique constraint
		userWorkspaceUnique: unique("user_workspace_unique").on(
			table.userId,
			table.workspaceId,
		),
	}),
);

// Files Table
export const files = pgTable(
	"files",
	{
		fileId: uuid("file_id").primaryKey().defaultRandom(),
		workspaceId: uuid("workspace_id")
			.notNull()
			.references(() => workspaces.workspaceId, {
				onDelete: "cascade",
				onUpdate: "cascade",
			}),
		uploaderId: uuid("uploader_id")
			.notNull()
			.references(() => users.userId, {
				onDelete: "restrict",
				onUpdate: "cascade",
			}),
		fileName: varchar("file_name", { length: 1024 }).notNull(),
		filePath: varchar("file_path", { length: 1024 }).notNull(),
		fileType: varchar("file_type", { length: 100 }),
		fileSizeBytes: bigint("file_size_bytes", { mode: "number" }),
		version: integer("version").default(1),
		description: text("description"),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
	},
	(table) => ({
		// Composite unique constraint for filename within workspace
		fileNameWorkspaceUnique: unique("file_name_workspace_unique").on(
			table.workspaceId,
			table.fileName,
		),
	}),
);

// File Permissions Table
export const filePermissions = pgTable(
	"file_permissions",
	{
		permissionId: uuid("permission_id").primaryKey().defaultRandom(),
		fileId: uuid("file_id")
			.notNull()
			.references(() => files.fileId, {
				onDelete: "cascade",
				onUpdate: "cascade",
			}),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.userId, {
				onDelete: "cascade",
				onUpdate: "cascade",
			}),
		workspaceId: uuid("workspace_id")
			.notNull()
			.references(() => workspaces.workspaceId, {
				onDelete: "cascade",
				onUpdate: "cascade",
			}),
		canView: boolean("can_view").default(false),
		canEdit: boolean("can_edit").default(false),
		canDelete: boolean("can_delete").default(false),
		canShare: boolean("can_share").default(false),
		canDownload: boolean("can_download").default(false),
		grantedById: uuid("granted_by_id")
			.notNull()
			.references(() => users.userId, {
				onDelete: "restrict",
				onUpdate: "cascade",
			}),
		grantedAt: timestamp("granted_at", { withTimezone: true }).defaultNow(),
	},
	(table) => ({
		// Composite unique constraint for file-user permissions
		fileUserUnique: unique("file_user_permission_unique").on(
			table.fileId,
			table.userId,
		),
	}),
);

// Audit Logs Table
export const auditLogs = pgTable("audit_logs", {
	logId: uuid("log_id").primaryKey().defaultRandom(),
	userId: uuid("user_id").references(() => users.userId, {
		onDelete: "set null",
		onUpdate: "cascade",
	}),
	actionType: actionTypeEnum("action_type").notNull(),
	targetEntityType: targetEntityTypeEnum("target_entity_type"),
	targetEntityId: varchar("target_entity_id", { length: 255 }),
	workspaceId: uuid("workspace_id").references(() => workspaces.workspaceId, {
		onDelete: "set null",
		onUpdate: "cascade",
	}),
	details: jsonb("details"),
	ipAddress: varchar("ip_address", { length: 45 }),
	userAgent: text("user_agent"),
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// Relations and types
export const usersRelations = relations(users, ({ many }) => ({
	workspaces: many(workspaces, { relationName: "workspaceManager" }),
	workspaceMemberships: many(workspaceMembers),
	uploadedFiles: many(files, { relationName: "uploader" }),
	grantedPermissions: many(filePermissions, { relationName: "grantedBy" }),
	auditLogs: many(auditLogs),
}));

export const workspacesRelations = relations(workspaces, ({ one, many }) => ({
	manager: one(users, {
		fields: [workspaces.workspaceManagerId],
		references: [users.userId],
		relationName: "workspaceManager",
	}),
	members: many(workspaceMembers),
	files: many(files),
	filePermissions: many(filePermissions),
	auditLogs: many(auditLogs),
}));

export const workspaceMembersRelations = relations(
	workspaceMembers,
	({ one }) => ({
		user: one(users, {
			fields: [workspaceMembers.userId],
			references: [users.userId],
		}),
		workspace: one(workspaces, {
			fields: [workspaceMembers.workspaceId],
			references: [workspaces.workspaceId],
		}),
	}),
);

export const filesRelations = relations(files, ({ one, many }) => ({
	workspace: one(workspaces, {
		fields: [files.workspaceId],
		references: [workspaces.workspaceId],
	}),
	uploader: one(users, {
		fields: [files.uploaderId],
		references: [users.userId],
		relationName: "uploader",
	}),
	permissions: many(filePermissions),
}));

export const filePermissionsRelations = relations(
	filePermissions,
	({ one }) => ({
		file: one(files, {
			fields: [filePermissions.fileId],
			references: [files.fileId],
		}),
		user: one(users, {
			fields: [filePermissions.userId],
			references: [users.userId],
		}),
		workspace: one(workspaces, {
			fields: [filePermissions.workspaceId],
			references: [workspaces.workspaceId],
		}),
		grantedBy: one(users, {
			fields: [filePermissions.grantedById],
			references: [users.userId],
			relationName: "grantedBy",
		}),
	}),
);

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
	user: one(users, {
		fields: [auditLogs.userId],
		references: [users.userId],
	}),
	workspace: one(workspaces, {
		fields: [auditLogs.workspaceId],
		references: [workspaces.workspaceId],
	}),
}));

// Export types
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type Workspace = typeof workspaces.$inferSelect;
export type NewWorkspace = typeof workspaces.$inferInsert;

export type WorkspaceMember = typeof workspaceMembers.$inferSelect;
export type NewWorkspaceMember = typeof workspaceMembers.$inferInsert;

export type File = typeof files.$inferSelect;
export type NewFile = typeof files.$inferInsert;

export type FilePermission = typeof filePermissions.$inferSelect;
export type NewFilePermission = typeof filePermissions.$inferInsert;

export type AuditLog = typeof auditLogs.$inferSelect;
export type NewAuditLog = typeof auditLogs.$inferInsert;

// Export all tables for use in drizzle-kit
export const schema = {
	users,
	workspaces,
	workspaceMembers,
	files,
	filePermissions,
	auditLogs,
	// Enums
	userRoleEnum,
	actionTypeEnum,
	targetEntityTypeEnum,
};

// For Drizzle Kit

// This is a workaround for the circular dependency issue
// It needs to be at the bottom of the file
Object.assign(schema, {
	users: users,
	workspaces: workspaces,
	workspaceMembers: workspaceMembers,
	files: files,
	filePermissions: filePermissions,
	auditLogs: auditLogs,
	userRoleEnum: userRoleEnum,
	actionTypeEnum: actionTypeEnum,
	targetEntityTypeEnum: targetEntityTypeEnum,
});

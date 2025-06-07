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
	user_id: uuid("user_id").primaryKey().defaultRandom(),
	username: varchar("username", { length: 100 }).notNull().unique(),
	email: varchar("email", { length: 255 }).notNull().unique(),
	first_name: varchar("first_name", { length: 100 }),
	last_name: varchar("last_name", { length: 100 }),
	is_active: boolean("is_active").default(true),
	is_manager: boolean("is_manager").default(false),
	created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
	updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// Workspaces Table
export const workspaces = pgTable("workspaces", {
	workspace_id: uuid("workspace_id").primaryKey().defaultRandom(),
	name: varchar("name", { length: 255 }).notNull(),
	description: text("description"),
	workspace_manager_id: uuid("workspace_manager_id")
		.notNull()
		.references(() => users.user_id, {
			onDelete: "restrict",
			onUpdate: "cascade",
		}),
	created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
	updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// Workspace Members Table
export const workspaceMembers = pgTable(
	"workspace_members",
	{
		workspace_member_id: uuid("workspace_member_id").primaryKey().defaultRandom(),
		user_id: uuid("user_id")
			.notNull()
			.references(() => users.user_id, {
				onDelete: "cascade",
				onUpdate: "cascade",
			}),
		workspace_id: uuid("workspace_id")
			.notNull()
			.references(() => workspaces.workspace_id, {
				onDelete: "cascade",
				onUpdate: "cascade",
			}),
		joined_at: timestamp("joined_at", { withTimezone: true }).defaultNow(),
		role: userRoleEnum("role").default("member"),
	},
	(table) => ({
		// Composite unique constraint
		userWorkspaceUnique: unique("user_workspace_unique").on(
			table.user_id,
			table.workspace_id,
		),
	}),
);

// Files Table
export const files = pgTable(
	"files",
	{
		file_id: uuid("file_id").primaryKey().defaultRandom(),
		workspace_id: uuid("workspace_id")
			.notNull()
			.references(() => workspaces.workspace_id, {
				onDelete: "cascade",
				onUpdate: "cascade",
			}),
		uploader_id: uuid("uploader_id")
			.notNull()
			.references(() => users.user_id, {
				onDelete: "restrict",
				onUpdate: "cascade",
			}),
		file_name: varchar("file_name", { length: 1024 }).notNull(),
		file_path: varchar("file_path", { length: 1024 }).notNull(),
		file_type: varchar("file_type", { length: 100 }),
		file_size_bytes: bigint("file_size_bytes", { mode: "number" }),
		version: integer("version").default(1),
		description: text("description"),
		created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
		updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
	},
	(table) => ({
		// Composite unique constraint for filename within workspace
		file_name_workspace_unique: unique("file_name_workspace_unique").on(
			table.workspace_id,
			table.file_name,
		),
	}),
);

// File Permissions Table
export const filePermissions = pgTable(
	"file_permissions",
	{
		permission_id: uuid("permission_id").primaryKey().defaultRandom(),
		file_id: uuid("file_id")
			.notNull()
			.references(() => files.file_id, {
				onDelete: "cascade",
				onUpdate: "cascade",
			}),
		user_id: uuid("user_id")
			.notNull()
			.references(() => users.user_id, {
				onDelete: "cascade",
				onUpdate: "cascade",
			}),
		workspace_id: uuid("workspace_id")
			.notNull()
			.references(() => workspaces.workspace_id, {
				onDelete: "cascade",
				onUpdate: "cascade",
			}),
		can_view: boolean("can_view").default(false),
		can_edit: boolean("can_edit").default(false),
		can_delete: boolean("can_delete").default(false),
		can_share: boolean("can_share").default(false),
		can_download: boolean("can_download").default(false),
		granted_by_id: uuid("granted_by_id")
			.notNull()
			.references(() => users.user_id, {
				onDelete: "restrict",
				onUpdate: "cascade",
			}),
		granted_at: timestamp("granted_at", { withTimezone: true }).defaultNow(),
	},
	(table) => ({
		// Composite unique constraint for file-user permissions
		file_user_permission_unique: unique("file_user_permission_unique").on(
			table.file_id,
			table.user_id,
		),
	}),
);

// Audit Logs Table
export const auditLogs = pgTable("audit_logs", {
	log_id: uuid("log_id").primaryKey().defaultRandom(),
	user_id: uuid("user_id").references(() => users.user_id, {
		onDelete: "set null",
		onUpdate: "cascade",
	}),
	action_type: actionTypeEnum("action_type").notNull(),
	target_entity_type: targetEntityTypeEnum("target_entity_type"),
	target_entity_id: varchar("target_entity_id", { length: 255 }),
	workspace_id: uuid("workspace_id").references(() => workspaces.workspace_id, {
		onDelete: "set null",
		onUpdate: "cascade",
	}),
	details: jsonb("details"),
	ip_address: varchar("ip_address", { length: 45 }),
	user_agent: text("user_agent"),
	created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// Relations and types
export const usersRelations = relations(users, ({ many }) => ({
	workspaces: many(workspaces, { relationName: "workspaceManager" }),
	workspace_memberships: many(workspaceMembers),
	uploaded_files: many(files, { relationName: "uploader" }),
	granted_permissions: many(filePermissions, { relationName: "grantedBy" }),
	audit_logs: many(auditLogs),
}));

export const workspacesRelations = relations(workspaces, ({ one, many }) => ({
	manager: one(users, {
		fields: [workspaces.workspace_manager_id],
		references: [users.user_id],
		relationName: "workspaceManager",
	}),
	members: many(workspaceMembers),
	files: many(files),
	file_permissions: many(filePermissions),
	audit_logs: many(auditLogs),
}));

export const workspaceMembersRelations = relations(
	workspaceMembers,
	({ one }) => ({
		user: one(users, {
			fields: [workspaceMembers.user_id],
			references: [users.user_id],
		}),
		workspace: one(workspaces, {
			fields: [workspaceMembers.workspace_id],
			references: [workspaces.workspace_id],
		}),
	}),
);

export const filesRelations = relations(files, ({ one, many }) => ({
	workspace: one(workspaces, {
		fields: [files.workspace_id],
		references: [workspaces.workspace_id],
	}),
	uploader: one(users, {
		fields: [files.uploader_id],
		references: [users.user_id],
		relationName: "uploader",
	}),
	permissions: many(filePermissions),
}));

export const filePermissionsRelations = relations(
	filePermissions,
	({ one }) => ({
		file: one(files, {
			fields: [filePermissions.file_id],
			references: [files.file_id],
		}),
		user: one(users, {
			fields: [filePermissions.user_id],
			references: [users.user_id],
		}),
		workspace: one(workspaces, {
			fields: [filePermissions.workspace_id],
			references: [workspaces.workspace_id],
		}),
		grantedBy: one(users, {
			fields: [filePermissions.granted_by_id],
			references: [users.user_id],
			relationName: "grantedBy",
		}),
	}),
);

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
	user: one(users, {
		fields: [auditLogs.user_id],
		references: [users.user_id],
	}),
	workspace: one(workspaces, {
		fields: [auditLogs.workspace_id],
		references: [workspaces.workspace_id],
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

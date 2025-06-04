
-- Enable pgcrypto for UUID generation if you choose to use UUIDs for PKs
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Users Table: Stores information about individual users
CREATE TABLE users (
    user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(100) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL, -- Store securely hashed passwords
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    is_active BOOLEAN DEFAULT TRUE,
    manager_id UUID REFERENCES users(user_id) ON DELETE SET NULL ON UPDATE CASCADE, -- For general user hierarchy (optional, ensure type matches user_id if UUID)
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE users IS 'Stores information about individual users.';
-- COMMENT ON COLUMN users.manager_id IS 'ID of the user''s direct manager (for general organizational hierarchy, not workspace specific). Ensure type matches users.user_id if using UUIDs.';

-- Workspaces Table: Represents a collaborative space for documents
CREATE TABLE workspaces (
    workspace_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    workspace_manager_id UUID NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT ON UPDATE CASCADE, -- Each workspace must have a manager
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE workspaces IS 'Represents a collaborative space for documents.';
COMMENT ON COLUMN workspaces.workspace_manager_id IS 'The user who manages this workspace and its top-level permissions.';

-- Workspace Members Table: Links users to workspaces (many-to-many relationship)
CREATE TABLE workspace_members (
    workspace_member_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), -- Changed to UUID
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE ON UPDATE CASCADE,
    workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE ON UPDATE CASCADE,
    joined_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    role VARCHAR(50) DEFAULT 'member', -- e.g., 'editor', 'viewer'
    UNIQUE (user_id, workspace_id) -- A user can only be a member of a workspace once
);

COMMENT ON TABLE workspace_members IS 'Links users to workspaces, establishing membership.';
COMMENT ON COLUMN workspace_members.role IS 'Role of the user within the workspace, e.g., editor, viewer. Workspace manager is defined in workspaces table.';

-- Files Table: Stores metadata about each file
CREATE TABLE files (
    file_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE ON UPDATE CASCADE,
    uploader_id UUID NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT ON UPDATE CASCADE, -- User who uploaded the file
    file_name VARCHAR(255) NOT NULL,
    file_path VARCHAR(1024) NOT NULL, -- Actual storage path (e.g., S3 key, local path)
    file_type VARCHAR(100), -- MIME type or extension (e.g., 'application/pdf', 'image/jpeg')
    file_size_bytes BIGINT,
    version INTEGER DEFAULT 1, -- Simple version number, could be expanded to a separate versions table
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_file_name_workspace UNIQUE (workspace_id, file_name) -- File names should be unique within the same workspace
);

COMMENT ON TABLE files IS 'Stores metadata about each file managed by the DMS. Files reside directly in a workspace.';
COMMENT ON COLUMN files.file_path IS 'Path to the file in the actual storage system (e.g., S3 bucket key, local filesystem path).';
COMMENT ON COLUMN files.version IS 'Simple version number. For full history, a separate file_versions table would be needed.';

-- File Permissions Table: Manages per-file access control for users
CREATE TABLE file_permissions (
    permission_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    file_id UUID NOT NULL REFERENCES files(file_id) ON DELETE CASCADE ON UPDATE CASCADE,
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE ON UPDATE CASCADE,
    workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE ON UPDATE CASCADE, -- For context and easier querying
    can_view BOOLEAN DEFAULT FALSE,
    can_edit BOOLEAN DEFAULT FALSE,
    can_delete BOOLEAN DEFAULT FALSE,
    can_share BOOLEAN DEFAULT FALSE, -- Ability to manage permissions for this file for other users
    can_download BOOLEAN DEFAULT FALSE,
    granted_by_id UUID NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT ON UPDATE CASCADE, -- User who granted these permissions
    granted_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (file_id, user_id) -- Each user has one set of permissions per file
);

COMMENT ON TABLE file_permissions IS 'Manages per-file access control for specific users.';
COMMENT ON COLUMN file_permissions.workspace_id IS 'Denormalized workspace_id for context; ensures permission is relevant to the file''s workspace.';
COMMENT ON COLUMN file_permissions.can_share IS 'Indicates if the user can grant/revoke permissions for this file to/from other users.';

-- Audit Logs Table: Tracks actions performed within the system (optional but recommended)
CREATE TABLE audit_logs (
    log_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(user_id) ON DELETE SET NULL ON UPDATE CASCADE, -- User who performed the action (NULL for system actions)
    action_type VARCHAR(100) NOT NULL, -- e.g., 'FILE_UPLOAD', 'FILE_VIEW', 'PERMISSION_GRANT', 'USER_LOGIN'
    target_entity_type VARCHAR(50), -- e.g., 'FILE', 'USER', 'WORKSPACE', 'PERMISSION'
    target_entity_id VARCHAR(255), -- ID of the entity affected (can be file_id, user_id, etc.)
    workspace_id UUID REFERENCES workspaces(workspace_id) ON DELETE SET NULL ON UPDATE CASCADE, -- Contextual workspace if applicable
    details JSONB, -- Additional details about the action (e.g., old/new values for a change)
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE audit_logs IS 'Tracks actions performed within the system for security and monitoring.';
COMMENT ON COLUMN audit_logs.target_entity_id IS 'ID of the entity affected by the action (e.g., file_id as string).';
COMMENT ON COLUMN audit_logs.details IS 'JSON object storing specific details of the logged action.';

-- Indexes for performance
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_workspaces_manager_id ON workspaces(workspace_manager_id);
CREATE INDEX idx_workspace_members_user_workspace ON workspace_members(user_id, workspace_id);
CREATE INDEX idx_files_workspace_filename ON files(workspace_id, file_name); -- Updated index
CREATE INDEX idx_files_uploader_id ON files(uploader_id);
CREATE INDEX idx_file_permissions_file_user ON file_permissions(file_id, user_id);
CREATE INDEX idx_file_permissions_user_id ON file_permissions(user_id);
CREATE INDEX idx_audit_logs_user_action_time ON audit_logs(user_id, action_type, created_at);
CREATE INDEX idx_audit_logs_target_entity ON audit_logs(target_entity_type, target_entity_id);

-- Optional: Functions to update `updated_at` timestamps automatically
CREATE OR REPLACE FUNCTION trigger_set_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply the trigger to tables with `updated_at`
CREATE TRIGGER set_timestamp_users
BEFORE UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION trigger_set_timestamp();

CREATE TRIGGER set_timestamp_workspaces
BEFORE UPDATE ON workspaces
FOR EACH ROW
EXECUTE FUNCTION trigger_set_timestamp();

-- Removed trigger for folders table

CREATE TRIGGER set_timestamp_files
BEFORE UPDATE ON files
FOR EACH ROW
EXECUTE FUNCTION trigger_set_timestamp();

/*
Considerations for ON DELETE / ON UPDATE policies:
- `users.manager_id`: `ON DELETE SET NULL` - If a manager is deleted, managed users no longer have that manager. (Note: manager_id type should be UUID if users.user_id is UUID)
- `workspaces.workspace_manager_id`: `ON DELETE RESTRICT` - A workspace cannot exist without a manager. Deletion of manager user must be handled (e.g., assign new manager or delete workspace).
- `workspace_members`: `ON DELETE CASCADE` for both FKs - If user or workspace is deleted, membership is removed.
- `files.workspace_id`: `ON DELETE CASCADE` - Files are part of a workspace. If workspace is deleted, its files are deleted.
- `files.uploader_id`: `ON DELETE RESTRICT` - Prevent user deletion if they uploaded files, or change to SET NULL/reassign.
- `file_permissions`: `ON DELETE CASCADE` for all FKs - Permissions are removed if file, user, or workspace is deleted.
- `file_permissions.granted_by_id`: `ON DELETE RESTRICT` - Prevent user deletion if they granted permissions, or change to SET NULL.
- `audit_logs`: `ON DELETE SET NULL` for `user_id` and `workspace_id` - Keep logs even if related entities are removed.

These policies can be adjusted based on specific business rules.
For example, `RESTRICT` is safer for critical data to prevent accidental mass deletions.
All primary keys and foreign keys referencing them have been updated to UUID where applicable for consistency.
The `users.manager_id` was previously INTEGER; if you intend to use this general manager hierarchy, ensure its type matches `users.user_id` (i.e., UUID). I've commented it out and added a note. If you don't need this general manager hierarchy, you can remove the `manager_id` column from the `users` table entirely.
*/

-- Seeded ADMIN and RECEPTIONIST accounts.
-- Passwords intentionally use a non-BCrypt locked sentinel so no predictable
-- credentials exist in source control or migrations. Set credentials via
-- CARESYNC_ADMIN_PASSWORD and CARESYNC_RECEPTIONIST_PASSWORD on first startup.
INSERT INTO users (id, email, password_hash, full_name, role) VALUES
    ('00000000-0000-4000-8000-000000000001', 'admin@caresync.local', '!LOCKED_REQUIRES_BOOTSTRAP!', 'System Administrator', 'ADMIN'),
    ('00000000-0000-4000-8000-000000000002', 'reception@caresync.local', '!LOCKED_REQUIRES_BOOTSTRAP!', 'Front Desk Receptionist', 'RECEPTIONIST');

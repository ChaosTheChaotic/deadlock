#!/usr/bin/env bash
set -e

POSTGRES_USER="${POSTGRES_USER:-postgres}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-}"
POSTGRES_DB="${POSTGRES_DB:-postgres}"

echo "Waiting for PostgreSQL to be ready..."

# Use the postgres default database for initial connection
until psql -h /var/run/postgresql -U "$POSTGRES_USER" -d "postgres" -c '\q' 2>/dev/null; do
  echo "PostgreSQL is unavailable - sleeping"
  sleep 1
done

echo "PostgreSQL is ready"

# Create UIDB if it doesn't exist
echo "Checking if UIDB database exists..."
if ! psql -h /var/run/postgresql -U "$POSTGRES_USER" -d "postgres" -tAc "SELECT 1 FROM pg_database WHERE datname='uidb';" | grep -q 1; then
    echo "Creating UIDB database..."
    psql -h /var/run/postgresql -U "$POSTGRES_USER" -d "postgres" -c "CREATE DATABASE uidb;"
else
    echo "UIDB database already exists"
fi

# Create GRIDS if it doesn't exist
echo "Checking if GRIDS database exists..."
if ! psql -h /var/run/postgresql -U "$POSTGRES_USER" -d "postgres" -tAc "SELECT 1 FROM pg_database WHERE datname='grids';" | grep -q 1; then
    echo "Creating GRIDS database..."
    psql -h /var/run/postgresql -U "$POSTGRES_USER" -d "postgres" -c "CREATE DATABASE grids;"
else
    echo "GRIDS database already exists"
fi

# Configure UIDB
echo "Configuring UIDB database..."
psql -h /var/run/postgresql -U "$POSTGRES_USER" -d "uidb" <<EOF
-- Create extension if not exists
CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE IF NOT EXISTS public.Perms (
  perm_id INT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  perm VARCHAR(50) UNIQUE NOT NULL,
  description TEXT
);

CREATE TABLE IF NOT EXISTS public.Roles (
  role_id INT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  role_name VARCHAR(50) UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS public.Role_Perms (
  role_id INT REFERENCES public.Roles(role_id) ON DELETE CASCADE,
  perm_id INT REFERENCES public.Perms(perm_id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, perm_id)
);

-- Create Users table if not exists
CREATE TABLE IF NOT EXISTS public.Users (
  uid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  Email CITEXT UNIQUE NOT NULL,
  Password_Hash TEXT NULL,
  OAuth_Provider VARCHAR(50) NULL,
  OAuth_Provider_ID VARCHAR(255) NULL, -- Unique ID from OAuth provider
  Creation_Time TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT first_email_check CHECK (
    Email ~* '^[^[:space:]]+@[^[:space:]]+\.[^[:space:]]+$'
  ),
  CONSTRAINT oauth_unique_per_provider UNIQUE (OAuth_Provider, OAuth_Provider_ID)
);

-- Link users to roles
CREATE TABLE IF NOT EXISTS public.User_Roles (
  user_uid UUID REFERENCES public.Users(uid) ON DELETE CASCADE,
  role_id INT REFERENCES public.Roles(role_id) ON DELETE CASCADE,
  PRIMARY KEY (user_uid, role_id)
);

-- Allow directly providing permissions to users
CREATE TABLE IF NOT EXISTS public.User_Perms (
  user_uid UUID REFERENCES public.Users(uid) ON DELETE CASCADE,
  perm_id INT REFERENCES public.Perms(perm_id) ON DELETE CASCADE,
  PRIMARY KEY (user_uid, perm_id)
);

INSERT INTO public.Roles (role_name) VALUES 
('admin'),
('mod'),
('user')
ON CONFLICT (role_name) DO NOTHING;

INSERT INTO public.Perms (perm, description) VALUES
('admin:access', 'Can manage users, access admin panel'),
('users:manage', 'Can create, edit, search, and delete users'),
('users:create', 'Can create users'),
('users:edit', 'Can edit users'),
('users:delete', 'Can delete users'),
('users:search', 'Can search through users')
ON CONFLICT (perm) DO NOTHING;

-- Give admin role permissions
INSERT INTO public.Role_Perms (role_id, perm_id)
SELECT r.role_id, p.perm_id
FROM public.Roles r, public.Perms p
WHERE r.role_name = 'admin'
ON CONFLICT DO NOTHING;

-- Give mod role permissions
INSERT INTO public.Role_Perms (role_id, perm_id)
SELECT r.role_id, p.perm_id
FROM public.Roles r, public.Perms p
WHERE r.role_name = 'mod' 
AND p.perm IN ('users:search', 'users:edit')
ON CONFLICT DO NOTHING;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_users_oauth ON public.Users(OAuth_Provider, OAuth_Provider_ID);
CREATE INDEX IF NOT EXISTS idx_users_email ON public.Users(Email);
CREATE INDEX IF NOT EXISTS idx_users_role ON public.User_Roles(role_id);
CREATE INDEX IF NOT EXISTS idx_user_perms_user ON public.User_Perms(user_uid);
EOF

# Configure GRIDS
echo "Configuring GRIDS database..."
psql -h /var/run/postgresql -U "$POSTGRES_USER" -d "grids" <<EOF
-- Create tables if not exists
CREATE TABLE IF NOT EXISTS public.GRIDS (
  Grid_ID INT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  Grid_Name VARCHAR(128),
  Grid_Desc VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS public.Phrases (
  Phrase_ID INT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  Grid_ID INT NOT NULL REFERENCES public.Grids(Grid_ID) ON DELETE CASCADE,
  Phrase_Order INT NOT NULL -- Store order of phrase within grid
);

CREATE TABLE IF NOT EXISTS public.Sections (
  Section_ID INT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  Phrase_ID INT NOT NULL REFERENCES public.Phrases(Phrase_ID) ON DELETE CASCADE,
  Section_Order INT NOT NULL -- Section within phrase
);

CREATE TABLE IF NOT EXISTS public.Terms (
  Term_ID INT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  Section_ID INT NOT NULL REFERENCES public.Sections(Section_ID) ON DELETE CASCADE,
  En_Text TEXT NOT NULL,
  De_Text TEXT NOT NULL
);

-- Create indexes if not exists
DO \$\$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_terms_en') THEN
        CREATE INDEX idx_terms_en ON public.Terms(En_Text);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_terms_de') THEN
        CREATE INDEX idx_terms_de ON public.Terms(De_Text);
    END IF;
END
\$\$;
EOF

echo "Database initialization completed successfully!"

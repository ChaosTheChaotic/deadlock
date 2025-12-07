#!/usr/bin/env bash
set -e

POSTGRES_USER="${POSTGRES_USER:-postgres}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-}"
POSTGRES_DB="${POSTGRES_DB:-postgres}"

SOCKET_DIR="/var/run/postgresql"

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

-- Create Users table if not exists
CREATE TABLE IF NOT EXISTS public.Users (
  UserID UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  Email CITEXT UNIQUE NOT NULL,
  PasswordHash TEXT NULL,
  OAuthProvider VARCHAR(50) NULL,
  CreationTime TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT first_email_check CHECK (
    -- Basic email validation where "@" must not be surrounded with whitespace and there must be a dot in the domain part
    Email ~* '^[^[:space:]]+@[^[:space:]]+\.[^[:space:]]+$'
  )
);
EOF

# Configure GRIDS
echo "Configuring GRIDS database..."
psql -h /var/run/postgresql -U "$POSTGRES_USER" -d "grids" <<EOF
-- Create tables if not exists
CREATE TABLE IF NOT EXISTS public.GRIDS (
  GridID INT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  GridName VARCHAR(128),
  GridDesc VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS public.Phrases (
  PhraseID INT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  GridID INT NOT NULL REFERENCES public.Grids(GridID) ON DELETE CASCADE,
  PhraseOrder INT NOT NULL -- Store order of phrase within grid
);

CREATE TABLE IF NOT EXISTS public.Sections (
  SectionID INT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  PhraseID INT NOT NULL REFERENCES public.Phrases(PhraseID) ON DELETE CASCADE,
  SectionOrder INT NOT NULL -- Section within phrase
);

CREATE TABLE IF NOT EXISTS public.Terms (
  TermID INT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  SectionID INT NOT NULL REFERENCES public.Sections(SectionID) ON DELETE CASCADE,
  EnText TEXT NOT NULL,
  DeText TEXT NOT NULL
);

-- Create indexes if not exists
DO \$\$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_terms_en') THEN
        CREATE INDEX idx_terms_en ON public.Terms(EnText);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_terms_de') THEN
        CREATE INDEX idx_terms_de ON public.Terms(DeText);
    END IF;
END
\$\$;
EOF

echo "Database initialization completed successfully!"

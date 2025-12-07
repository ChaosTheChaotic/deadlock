-- Create the databases if not exists
SELECT 'CREATE DATABASE UIDB'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'UIDB')\gexec

SELECT 'CREATE DATABASE GRIDS'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'GRIDS')\gexec

-- Configure UIDB initial settings
\connect UIDB;

CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE IF NOT EXISTS public.Users (
  UserID UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  Email CITEXT UNIQUE NOT NULL,
  PasswordHash TEXT NULL,
  OAuthProvider VARCHAR(50) NULL,
  CreationTime TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP

  CONSTRAINT first_email_check CHECK (
    -- Basic email validation where "@" must not be surrounded with whitespace and there must be a dot in the domain part
    Email ~* '^[^[:space:]]+@[^[:space:]]+\.[^[:space:]]+$'
  )
);

-- Configure GRIDS database initial settings
\connect GRIDS;

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

CREATE INDEX idx_terms_en ON public.Terms(EnText);
CREATE INDEX idx_terms_de ON public.Terms(DeText);

-- =============================================================================
-- ESQUEMA COMPLETO DO BANCO DE DADOS: TERRITÓRIOS / MAP MY CONQUESTS
-- Execute este script no SQL Editor do seu projeto Supabase para criar ou validar
-- todas as tabelas, enums, índices e políticas de segurança RLS.
-- =============================================================================

-- 1. ENUMS
DO $$ BEGIN
    CREATE TYPE public.territory_status AS ENUM ('pendente', 'andamento', 'concluido');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE public.lead_status AS ENUM ('pendente', 'contatado', 'ignorado');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. FUNÇÃO TRIGGER DE UPDATED_AT
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- 3. TABELA DE PASTAS DE TERRITÓRIOS
CREATE TABLE IF NOT EXISTS public.territory_folders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS territory_folders_user_id_idx ON public.territory_folders(user_id);

-- 4. TABELA DE TERRITÓRIOS / REGIÕES
CREATE TABLE IF NOT EXISTS public.territories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  folder_id UUID REFERENCES public.territory_folders(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  status public.territory_status NOT NULL DEFAULT 'pendente',
  notes TEXT,
  path JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS territories_user_id_idx ON public.territories(user_id);
CREATE INDEX IF NOT EXISTS territories_folder_id_idx ON public.territories(folder_id);

DROP TRIGGER IF EXISTS update_territories_updated_at ON public.territories;
CREATE TRIGGER update_territories_updated_at
BEFORE UPDATE ON public.territories
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5. TABELA DE PRESETS DE CATEGORIAS
CREATE TABLE IF NOT EXISTS public.category_presets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  categories TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, name)
);
CREATE INDEX IF NOT EXISTS category_presets_user_id_idx ON public.category_presets(user_id);

DROP TRIGGER IF EXISTS update_category_presets_updated_at ON public.category_presets;
CREATE TRIGGER update_category_presets_updated_at
BEFORE UPDATE ON public.category_presets
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 6. TABELA DE COMPARTILHAMENTO DE PASTAS
CREATE TABLE IF NOT EXISTS public.folder_shares (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  folder_id UUID NOT NULL REFERENCES public.territory_folders(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  shared_with UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  shared_with_email TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(folder_id, shared_with)
);
CREATE INDEX IF NOT EXISTS folder_shares_owner_id_idx ON public.folder_shares(owner_id);
CREATE INDEX IF NOT EXISTS folder_shares_shared_with_idx ON public.folder_shares(shared_with);

-- 7. TABELA DE COMPARTILHAMENTO DE PRESETS
CREATE TABLE IF NOT EXISTS public.preset_shares (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  preset_id UUID NOT NULL REFERENCES public.category_presets(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  shared_with UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  shared_with_email TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(preset_id, shared_with)
);
CREATE INDEX IF NOT EXISTS preset_shares_owner_id_idx ON public.preset_shares(owner_id);
CREATE INDEX IF NOT EXISTS preset_shares_shared_with_idx ON public.preset_shares(shared_with);

-- 8. TABELA DE LEADS
CREATE TABLE IF NOT EXISTS public.leads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  place_id TEXT NOT NULL,
  name TEXT NOT NULL,
  address TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  area_name TEXT NOT NULL DEFAULT '',
  categories TEXT[] NOT NULL DEFAULT '{}',
  phone TEXT,
  website TEXT,
  instagram TEXT,
  rating NUMERIC(3, 2),
  reviews INTEGER,
  status public.lead_status NOT NULL DEFAULT 'pendente',
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  maps_opened_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, place_id)
);
CREATE INDEX IF NOT EXISTS leads_user_id_idx ON public.leads(user_id);
CREATE INDEX IF NOT EXISTS leads_place_id_idx ON public.leads(place_id);

DROP TRIGGER IF EXISTS update_leads_updated_at ON public.leads;
CREATE TRIGGER update_leads_updated_at
BEFORE UPDATE ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 9. SCHEMA PRIVADO PARA FUNÇÕES DE POLÍTICA RLS
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM public, anon, authenticated;

CREATE OR REPLACE FUNCTION private.can_view_folder(_folder_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.folder_shares AS share
    JOIN public.territory_folders AS folder
      ON folder.id = share.folder_id
     AND folder.user_id = share.owner_id
    WHERE share.folder_id = _folder_id
      AND share.shared_with = (SELECT auth.uid())
  );
$$;

CREATE OR REPLACE FUNCTION private.can_view_preset(_preset_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.preset_shares AS share
    JOIN public.category_presets AS preset
      ON preset.id = share.preset_id
     AND preset.user_id = share.owner_id
    WHERE share.preset_id = _preset_id
      AND share.shared_with = (SELECT auth.uid())
  );
$$;

REVOKE EXECUTE ON FUNCTION private.can_view_folder(UUID) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION private.can_view_preset(UUID) FROM public, anon, authenticated;

-- 10. HABILITAR ROW LEVEL SECURITY (RLS)
ALTER TABLE public.territory_folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.territories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.category_presets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.folder_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.preset_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

-- 11. POLÍTICAS DE ACESSO (RLS)

-- Pastas de Territórios
DROP POLICY IF EXISTS "Users manage own folders" ON public.territory_folders;
DROP POLICY IF EXISTS "Shared folders are viewable" ON public.territory_folders;
CREATE POLICY "Users manage own folders" ON public.territory_folders
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Shared folders are viewable" ON public.territory_folders
  FOR SELECT TO authenticated
  USING (private.can_view_folder(id));

-- Territórios
DROP POLICY IF EXISTS "Users read own territories" ON public.territories;
DROP POLICY IF EXISTS "Users create own territories" ON public.territories;
DROP POLICY IF EXISTS "Users update own territories" ON public.territories;
DROP POLICY IF EXISTS "Users delete own territories" ON public.territories;
DROP POLICY IF EXISTS "Areas in shared folders are viewable" ON public.territories;

CREATE POLICY "Users read own territories" ON public.territories
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users create own territories" ON public.territories
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT auth.uid()) = user_id
    AND (
      folder_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.territory_folders AS folder
        WHERE folder.id = folder_id AND folder.user_id = (SELECT auth.uid())
      )
    )
  );

CREATE POLICY "Users update own territories" ON public.territories
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK (
    (SELECT auth.uid()) = user_id
    AND (
      folder_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.territory_folders AS folder
        WHERE folder.id = folder_id AND folder.user_id = (SELECT auth.uid())
      )
    )
  );

CREATE POLICY "Users delete own territories" ON public.territories
  FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "Areas in shared folders are viewable" ON public.territories
  FOR SELECT TO authenticated
  USING (folder_id IS NOT NULL AND private.can_view_folder(folder_id));

-- Presets de Categorias
DROP POLICY IF EXISTS "Users manage own category presets" ON public.category_presets;
DROP POLICY IF EXISTS "Shared presets are viewable" ON public.category_presets;

CREATE POLICY "Users manage own category presets" ON public.category_presets
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Shared presets are viewable" ON public.category_presets
  FOR SELECT TO authenticated
  USING (private.can_view_preset(id));

-- Compartilhamentos
DROP POLICY IF EXISTS "Owners read folder shares" ON public.folder_shares;
DROP POLICY IF EXISTS "Recipients read folder shares" ON public.folder_shares;
DROP POLICY IF EXISTS "Owners create folder shares" ON public.folder_shares;
DROP POLICY IF EXISTS "Owners delete folder shares" ON public.folder_shares;

CREATE POLICY "Owners read folder shares" ON public.folder_shares
  FOR SELECT TO authenticated
  USING (
    owner_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.territory_folders AS folder
      WHERE folder.id = folder_id AND folder.user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "Recipients read folder shares" ON public.folder_shares
  FOR SELECT TO authenticated
  USING (shared_with = (SELECT auth.uid()));

CREATE POLICY "Owners create folder shares" ON public.folder_shares
  FOR INSERT TO authenticated
  WITH CHECK (
    owner_id = (SELECT auth.uid())
    AND shared_with <> (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.territory_folders AS folder
      WHERE folder.id = folder_id AND folder.user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "Owners delete folder shares" ON public.folder_shares
  FOR DELETE TO authenticated
  USING (
    owner_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.territory_folders AS folder
      WHERE folder.id = folder_id AND folder.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Owners read preset shares" ON public.preset_shares;
DROP POLICY IF EXISTS "Recipients read preset shares" ON public.preset_shares;
DROP POLICY IF EXISTS "Owners create preset shares" ON public.preset_shares;
DROP POLICY IF EXISTS "Owners delete preset shares" ON public.preset_shares;

CREATE POLICY "Owners read preset shares" ON public.preset_shares
  FOR SELECT TO authenticated
  USING (
    owner_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.category_presets AS preset
      WHERE preset.id = preset_id AND preset.user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "Recipients read preset shares" ON public.preset_shares
  FOR SELECT TO authenticated
  USING (shared_with = (SELECT auth.uid()));

CREATE POLICY "Owners create preset shares" ON public.preset_shares
  FOR INSERT TO authenticated
  WITH CHECK (
    owner_id = (SELECT auth.uid())
    AND shared_with <> (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.category_presets AS preset
      WHERE preset.id = preset_id AND preset.user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "Owners delete preset shares" ON public.preset_shares
  FOR DELETE TO authenticated
  USING (
    owner_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.category_presets AS preset
      WHERE preset.id = preset_id AND preset.user_id = (SELECT auth.uid())
    )
  );

-- Leads
DROP POLICY IF EXISTS "Users manage own leads" ON public.leads;
CREATE POLICY "Users manage own leads" ON public.leads
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 12. PERMISSÕES E ROLES
GRANT SELECT, INSERT, UPDATE, DELETE ON public.territories TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.territory_folders TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.category_presets TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.folder_shares TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.preset_shares TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.leads TO authenticated;

GRANT ALL ON public.territories TO service_role;
GRANT ALL ON public.territory_folders TO service_role;
GRANT ALL ON public.category_presets TO service_role;
GRANT ALL ON public.folder_shares TO service_role;
GRANT ALL ON public.preset_shares TO service_role;
GRANT ALL ON public.leads TO service_role;

GRANT USAGE ON TYPE public.territory_status, public.lead_status TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.user_id_by_email(_email text)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT id
  FROM auth.users
  WHERE lower(email) = lower(_email)
  LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION public.user_id_by_email(text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.user_id_by_email(text) TO service_role;

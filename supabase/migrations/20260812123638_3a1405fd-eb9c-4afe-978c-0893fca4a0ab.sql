ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS maps_opened_at timestamptz;

CREATE TABLE public.category_presets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  categories text[] not null default '{}'::text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.category_presets TO authenticated;
GRANT ALL ON public.category_presets TO service_role;

ALTER TABLE public.category_presets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own presets" ON public.category_presets
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_category_presets_updated_at
  BEFORE UPDATE ON public.category_presets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
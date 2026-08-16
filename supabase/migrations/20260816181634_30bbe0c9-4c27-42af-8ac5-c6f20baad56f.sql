CREATE TABLE public.folder_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  folder_id uuid NOT NULL REFERENCES public.territory_folders(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  shared_with uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  shared_with_email text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (folder_id, shared_with)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.folder_shares TO authenticated;
GRANT ALL ON public.folder_shares TO service_role;
ALTER TABLE public.folder_shares ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner manages folder shares" ON public.folder_shares FOR ALL TO authenticated USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Recipient reads folder shares" ON public.folder_shares FOR SELECT TO authenticated USING (auth.uid() = shared_with);

CREATE TABLE public.preset_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  preset_id uuid NOT NULL REFERENCES public.category_presets(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  shared_with uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  shared_with_email text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (preset_id, shared_with)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.preset_shares TO authenticated;
GRANT ALL ON public.preset_shares TO service_role;
ALTER TABLE public.preset_shares ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner manages preset shares" ON public.preset_shares FOR ALL TO authenticated USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Recipient reads preset shares" ON public.preset_shares FOR SELECT TO authenticated USING (auth.uid() = shared_with);

CREATE OR REPLACE FUNCTION public.can_view_folder(_folder_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.folder_shares s WHERE s.folder_id = _folder_id AND s.shared_with = _user_id);
$$;

CREATE OR REPLACE FUNCTION public.can_view_preset(_preset_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.preset_shares s WHERE s.preset_id = _preset_id AND s.shared_with = _user_id);
$$;

CREATE POLICY "Shared folders are viewable" ON public.territory_folders FOR SELECT TO authenticated USING (public.can_view_folder(id, auth.uid()));
CREATE POLICY "Areas in shared folders are viewable" ON public.territories FOR SELECT TO authenticated USING (folder_id IS NOT NULL AND public.can_view_folder(folder_id, auth.uid()));
CREATE POLICY "Shared presets are viewable" ON public.category_presets FOR SELECT TO authenticated USING (public.can_view_preset(id, auth.uid()));
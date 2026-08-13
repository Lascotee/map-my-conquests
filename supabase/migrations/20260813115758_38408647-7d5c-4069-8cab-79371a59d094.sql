CREATE TABLE public.territory_folders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.territory_folders TO authenticated;
GRANT ALL ON public.territory_folders TO service_role;
ALTER TABLE public.territory_folders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own folders" ON public.territory_folders FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

ALTER TABLE public.territories ADD COLUMN folder_id UUID REFERENCES public.territory_folders(id) ON DELETE SET NULL;
CREATE INDEX territories_folder_id_idx ON public.territories (folder_id);
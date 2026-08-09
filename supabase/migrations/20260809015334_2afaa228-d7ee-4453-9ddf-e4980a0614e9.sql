CREATE TYPE public.territory_status AS ENUM ('pendente','andamento','concluido');

CREATE TABLE public.territories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  name TEXT NOT NULL,
  status public.territory_status NOT NULL DEFAULT 'pendente',
  notes TEXT,
  path JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX territories_user_id_idx ON public.territories(user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.territories TO authenticated;
GRANT ALL ON public.territories TO service_role;

ALTER TABLE public.territories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own territories" ON public.territories
FOR ALL TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_territories_updated_at
BEFORE UPDATE ON public.territories
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
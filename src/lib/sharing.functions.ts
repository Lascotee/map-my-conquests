import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type ShareInput = { id: string; email: string };

function parse(input: ShareInput) {
  const id = String(input?.id ?? "").trim();
  const email = String(input?.email ?? "")
    .trim()
    .toLowerCase();
  if (!id) throw new Error("Item inválido");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    throw new Error("Item inválido");
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("E-mail inválido");
  return { id, email };
}

async function resolveUser(email: string): Promise<string> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("user_id_by_email", { _email: email });
  if (error) throw new Error("Não foi possível localizar essa conta");
  if (!data) throw new Error("Nenhuma conta cadastrada com esse e-mail");
  return data as unknown as string;
}

export const shareFolder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(parse)
  .handler(async ({ data, context }) => {
    const { data: folder, error: fErr } = await context.supabase
      .from("territory_folders")
      .select("id, user_id")
      .eq("id", data.id)
      .maybeSingle();
    if (fErr) throw new Error(fErr.message);
    if (!folder || folder.user_id !== context.userId) throw new Error("Pasta não encontrada");

    const targetId = await resolveUser(data.email);
    if (targetId === context.userId) throw new Error("Essa pasta já é sua");

    const { error } = await context.supabase.from("folder_shares").upsert(
      {
        folder_id: data.id,
        owner_id: context.userId,
        shared_with: targetId,
        shared_with_email: data.email,
      },
      { onConflict: "folder_id,shared_with" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const sharePreset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(parse)
  .handler(async ({ data, context }) => {
    const { data: preset, error: pErr } = await context.supabase
      .from("category_presets")
      .select("id, user_id")
      .eq("id", data.id)
      .maybeSingle();
    if (pErr) throw new Error(pErr.message);
    if (!preset || preset.user_id !== context.userId) throw new Error("Preset não encontrado");

    const targetId = await resolveUser(data.email);
    if (targetId === context.userId) throw new Error("Esse preset já é seu");

    const { error } = await context.supabase.from("preset_shares").upsert(
      {
        preset_id: data.id,
        owner_id: context.userId,
        shared_with: targetId,
        shared_with_email: data.email,
      },
      { onConflict: "preset_id,shared_with" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

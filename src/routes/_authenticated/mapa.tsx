import { Suspense, lazy, useState } from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { ClientOnly } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  ChevronDown,
  ChevronRight,
  Folder,
  FolderPlus,
  Globe,
  Instagram,
  LogOut,
  MapPin,
  MessageCircle,
  PencilRuler,
  Phone,
  Plus,
  Save,
  Search,
  Share2,
  Sparkles,
  Star,
  Trash2,
  Users,
  X,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { searchArea } from "@/lib/geocode.functions";
import { searchBoundary, type BoundaryResult } from "@/lib/boundary.functions";
import { searchAestheticPlaces, type PlaceResult } from "@/lib/places.functions";
import { shareFolder, sharePreset } from "@/lib/sharing.functions";
import { boundsOf, rectPath, type Bounds } from "@/lib/geo";
import {
  STATUS_META,
  type LatLngLiteral,
  type Territory,
  type TerritoryFolder,
  type TerritoryStatus,
} from "@/lib/maps";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

const TerritoryMap = lazy(() => import("@/components/TerritoryMap"));


export const Route = createFileRoute("/_authenticated/mapa")({
  head: () => ({
    meta: [
      { title: "Meu mapa de territórios" },
      { name: "description", content: "Marque bairros e áreas e acompanhe o status de cobertura." },
      { property: "og:title", content: "Meu mapa de territórios" },
      { property: "og:description", content: "Marque bairros e áreas e acompanhe o status de cobertura." },
    ],
  }),
  component: MapaPage,
});

const STATUS_ORDER: TerritoryStatus[] = ["pendente", "andamento", "concluido"];

function MapaPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const runBoundary = useServerFn(searchBoundary);
  const runGeocode = useServerFn(searchArea);
  const runPlaces = useServerFn(searchAestheticPlaces);

  const [drawing, setDrawing] = useState(false);
  const [draftPoints, setDraftPoints] = useState(0);
  const [finishSignal, setFinishSignal] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<BoundaryResult[]>([]);
  const [preview, setPreview] = useState<BoundaryResult | null>(null);
  const [searching, setSearching] = useState(false);
  const [focus, setFocus] = useState<{ bounds: Bounds } | null>(null);
  const [places, setPlaces] = useState<PlaceResult[]>([]);
  const [placeAreaName, setPlaceAreaName] = useState("");
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  const [loadingPlaces, setLoadingPlaces] = useState(false);
  const [categories, setCategories] = useState<string[]>([]);
  const [categoryInput, setCategoryInput] = useState("");
  const [presetName, setPresetName] = useState("");
  const [shareTarget, setShareTarget] = useState<
    { kind: "folder" | "preset"; id: string; name: string } | null
  >(null);
  const [folderName, setFolderName] = useState("");
  const [openFolders, setOpenFolders] = useState<string[]>([]);

  const { data: territories = [] } = useQuery({
    queryKey: ["territories"],
    queryFn: async (): Promise<Territory[]> => {
      const { data, error } = await supabase
        .from("territories")
        .select("id, name, status, notes, path, updated_at, folder_id")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Territory[];
    },
  });

  const { data: folders = [] } = useQuery({
    queryKey: ["territory-folders"],
    queryFn: async (): Promise<TerritoryFolder[]> => {
      const { data, error } = await supabase
        .from("territory_folders")
        .select("id, name")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const createFolder = useMutation({
    mutationFn: async () => {
      const name = folderName.trim();
      if (!name) throw new Error("Dê um nome à pasta");
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Sessão expirada");
      const { error } = await supabase
        .from("territory_folders")
        .insert({ name, user_id: auth.user.id });
      if (error) throw error;
    },
    onSuccess: async () => {
      setFolderName("");
      await queryClient.invalidateQueries({ queryKey: ["territory-folders"] });
      toast.success("Pasta criada");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao criar pasta"),
  });

  const deleteFolder = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("territory_folders").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["territory-folders"] });
      await queryClient.invalidateQueries({ queryKey: ["territories"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao excluir pasta"),
  });


  const { data: presets = [] } = useQuery({
    queryKey: ["category-presets"],
    queryFn: async (): Promise<{ id: string; name: string; categories: string[] }[]> => {
      const { data, error } = await supabase
        .from("category_presets")
        .select("id, name, categories")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const savePreset = useMutation({
    mutationFn: async () => {
      const name = presetName.trim();
      if (!name) throw new Error("Dê um nome ao preset");
      if (categories.length === 0) throw new Error("Adicione ao menos uma categoria");
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Sessão expirada");
      const { error } = await supabase
        .from("category_presets")
        .upsert({ user_id: auth.user.id, name, categories }, { onConflict: "user_id,name" });
      if (error) throw error;
    },
    onSuccess: async () => {
      setPresetName("");
      await queryClient.invalidateQueries({ queryKey: ["category-presets"] });
      toast.success("Preset salvo");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao salvar preset"),
  });

  const deletePreset = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("category_presets").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["category-presets"] }),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["territories"] });

  const createTerritory = useMutation({
    mutationFn: async (input: { name: string; path: LatLngLiteral[] }) => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Sessão expirada");
      const { data, error } = await supabase
        .from("territories")
        .insert({ name: input.name, path: input.path as never, user_id: auth.user.id })
        .select("id")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: async (data) => {
      await invalidate();
      setSelectedId(data.id);
      toast.success("Região marcada");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao salvar"),
  });

  const updateTerritory = useMutation({
    mutationFn: async (input: {
      id: string;
      values: Partial<Pick<Territory, "name" | "status" | "notes" | "folder_id">> & {
        path?: LatLngLiteral[];
      };
    }) => {
      const { error } = await supabase
        .from("territories")
        .update(input.values as never)
        .eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao atualizar"),
  });

  const deleteTerritory = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("territories").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: async () => {
      setSelectedId(null);
      await invalidate();
      toast.success("Região removida");
    },
  });

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (query.trim().length < 2) return;
    setSearching(true);
    try {
      let found = await runBoundary({ data: { query } });
      if (found.length === 0) {
        const geo = await runGeocode({ data: { query } });
        found = geo.map((g) => ({
          name: g.name,
          shortName: g.name.split(",")[0] ?? g.name,
          type: "",
          path: rectPath(g.bounds),
          bounds: g.bounds,
          exact: false,
        }));
      }
      setResults(found);
      if (found.length === 0) {
        toast.info("Nada encontrado para essa busca");
      } else {
        selectResult(found[0]!);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Busca indisponível");
    } finally {
      setSearching(false);
    }
  }

  function selectResult(r: BoundaryResult) {
    setPreview(r);
    setFocus({ bounds: r.bounds });
    setSelectedId(null);
  }

  function addCategory() {
    const value = categoryInput.trim();
    if (!value) return;
    setCategories((c) => (c.includes(value) ? c : [...c, value]));
    setCategoryInput("");
  }

  async function findPlaces(polygon: LatLngLiteral[], areaName: string) {
    setLoadingPlaces(true);
    setSelectedPlaceId(null);
    setFocus({ bounds: boundsOf(polygon) });
    try {
      const found = await runPlaces({ data: { polygon, categories, areaName } });
      setPlaces(found);
      setPlaceAreaName(areaName);
      await queryClient.invalidateQueries({ queryKey: ["leads"] });
      toast[found.length ? "success" : "info"](
        found.length
          ? `${found.length} comércios encontrados na área`
          : "Nenhum comércio encontrado nessa área",
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Busca de comércios indisponível");
    } finally {
      setLoadingPlaces(false);
    }
  }

  const selected = territories.find((t) => t.id === selectedId) ?? null;
  const counts = STATUS_ORDER.map((s) => ({
    status: s,
    total: territories.filter((t) => t.status === s).length,
  }));

  return (
    <div className="flex h-screen flex-col bg-background lg:flex-row">
      <aside className="flex w-full shrink-0 flex-col border-b border-sidebar-border bg-sidebar text-sidebar-foreground lg:h-full lg:w-96 lg:border-b-0 lg:border-r">
        <div className="flex items-center justify-between px-5 py-4">
          <span className="font-display text-base font-bold">Territórios</span>
          <div className="flex items-center gap-1">
            <Button asChild variant="ghost" size="sm">
              <Link to="/leads">
                <Users className="mr-1.5 h-4 w-4" />
                Leads
              </Link>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Sair"
              onClick={async () => {
                await supabase.auth.signOut();
                queryClient.clear();
                void navigate({ to: "/auth" });
              }}
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 px-5 pb-4">
          {counts.map((c) => (
            <div key={c.status} className="rounded-lg bg-sidebar-accent px-3 py-2">
              <span className="flex items-center gap-1.5 text-[11px] opacity-75">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: STATUS_META[c.status].color }}
                />
                {STATUS_META[c.status].label}
              </span>
              <p className="font-display text-xl font-bold">{c.total}</p>
            </div>
          ))}
        </div>

        <div className="space-y-3 border-t border-sidebar-border px-5 py-4">
          <form onSubmit={handleSearch} className="flex gap-2">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar bairro ou cidade"
              className="border-sidebar-border bg-sidebar-accent text-sidebar-foreground placeholder:opacity-60"
            />
            <Button type="submit" size="icon" disabled={searching} aria-label="Buscar">
              <Search className="h-4 w-4" />
            </Button>
          </form>

          {results.length > 0 && (
            <ul className="space-y-1">
              {results.map((r) => (
                <li
                  key={r.name}
                  className={`rounded-lg px-3 py-2 ${
                    preview?.name === r.name ? "bg-sidebar-primary text-sidebar-primary-foreground" : "bg-sidebar-accent"
                  }`}
                >
                  <button className="block w-full text-left" onClick={() => selectResult(r)}>
                    <span className="block text-sm">{r.shortName}</span>
                    <span className="block truncate text-[11px] opacity-70">{r.name}</span>
                    <span className="text-[11px] opacity-70">
                      {r.exact ? "Contorno exato do local" : "Área aproximada"}
                    </span>
                  </button>
                  {preview?.name === r.name && (
                    <div className="mt-2 flex gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        className="flex-1"
                        onClick={() => {
                          createTerritory.mutate({ name: r.shortName, path: r.path });
                          setResults([]);
                          setPreview(null);
                          setQuery("");
                        }}
                      >
                        Marcar esta área
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        className="flex-1"
                        disabled={loadingPlaces}
                        onClick={() => void findPlaces(r.path, r.shortName)}
                      >
                        <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                        Procurar
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <details className="border-t border-sidebar-border px-5 py-4" open={false}>
          <summary className="cursor-pointer list-none text-xs font-semibold uppercase tracking-wide opacity-70">
            Categorias de comércio
          </summary>
          <div className="mt-3 space-y-2 rounded-lg bg-sidebar-accent px-3 py-3">
            <Label className="text-[11px] uppercase tracking-wide opacity-70">
              O que procurar dentro da área
            </Label>
            <div className="flex gap-2">
              <Input
                value={categoryInput}
                onChange={(e) => setCategoryInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addCategory();
                  }
                }}
                placeholder="ex.: dentista"
                className="h-9 border-sidebar-border bg-sidebar text-sidebar-foreground placeholder:opacity-60"
              />
              <Button size="icon" className="h-9 w-9" aria-label="Adicionar categoria" onClick={addCategory}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            {categories.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {categories.map((c) => (
                  <button
                    key={c}
                    onClick={() => setCategories((list) => list.filter((x) => x !== c))}
                    className="flex items-center gap-1 rounded-full bg-sidebar px-2.5 py-1 text-xs"
                  >
                    {c}
                    <X className="h-3 w-3 opacity-70" />
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-[11px] opacity-70">
                Sem categorias: usa o preset de estética/harmonização.
              </p>
            )}

            <div className="space-y-2 border-t border-sidebar-border pt-2">
              <Label className="text-[11px] uppercase tracking-wide opacity-70">
                Presets salvos
              </Label>
              {presets.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {presets.map((p) => (
                    <span
                      key={p.id}
                      className="flex items-center gap-1 rounded-full bg-sidebar px-2.5 py-1 text-xs"
                    >
                      <button
                        onClick={() => {
                          setCategories(p.categories);
                          toast.success(`Preset "${p.name}" aplicado`);
                        }}
                        title={p.categories.join(", ")}
                      >
                        {p.name} ({p.categories.length})
                      </button>
                      <button
                        aria-label={`Compartilhar preset ${p.name}`}
                        title="Compartilhar preset"
                        onClick={() =>
                          setShareTarget({ kind: "preset", id: p.id, name: p.name })
                        }
                      >
                        <Share2 className="h-3 w-3 opacity-60" />
                      </button>
                      <button
                        aria-label={`Excluir preset ${p.name}`}
                        onClick={() => deletePreset.mutate(p.id)}
                      >
                        <Trash2 className="h-3 w-3 opacity-60" />
                      </button>
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-[11px] opacity-70">Nenhum preset salvo ainda.</p>
              )}
              <div className="flex gap-2">
                <Input
                  value={presetName}
                  onChange={(e) => setPresetName(e.target.value)}
                  placeholder="Nome do preset"
                  className="h-9 border-sidebar-border bg-sidebar text-sidebar-foreground placeholder:opacity-60"
                />
                <Button
                  size="icon"
                  className="h-9 w-9"
                  aria-label="Salvar preset"
                  disabled={savePreset.isPending}
                  onClick={() => savePreset.mutate()}
                >
                  <Save className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </details>

        <div className="space-y-3 border-t border-sidebar-border px-5 py-4">
          <Button
            variant={drawing ? "default" : "outline"}
            className="w-full"
            onClick={() => {
              setSelectedId(null);
              setPreview(null);
              setDrawing((d) => !d);
            }}
          >
            <PencilRuler className="mr-2 h-4 w-4" />
            {drawing ? "Cancelar desenho" : "Desenhar área"}
          </Button>

          {drawing && (
            <div className="space-y-2 rounded-lg bg-sidebar-accent px-3 py-3 text-xs">
              <p className="opacity-80">
                Clique no mapa para marcar os cantos da região ({draftPoints} ponto
                {draftPoints === 1 ? "" : "s"}). Dê dois cliques ou use o botão abaixo para fechar
                a área.
              </p>
              <Button
                size="sm"
                className="w-full"
                disabled={draftPoints < 3}
                onClick={() => setFinishSignal((n) => n + 1)}
              >
                Concluir área
              </Button>
            </div>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto border-t border-sidebar-border px-5 py-4">
          {loadingPlaces && <p className="mb-3 text-sm opacity-70">Procurando comércios na área…</p>}

          {places.length > 0 && (
            <div className="mb-5 space-y-2 rounded-lg bg-sidebar-accent px-3 py-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide opacity-70">
                  {places.length} comércios em {placeAreaName}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Limpar comércios do mapa"
                  onClick={() => {
                    setPlaces([]);
                    setSelectedPlaceId(null);
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <Button asChild size="sm" className="w-full">
                <Link to="/leads" search={{ area: placeAreaName }}>
                  <Users className="mr-1.5 h-4 w-4" />
                  Ver leads desta região
                </Link>
              </Button>
            </div>
          )}

          <div className="mb-3 flex gap-2">
            <Input
              value={folderName}
              onChange={(e) => setFolderName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  createFolder.mutate();
                }
              }}
              placeholder="Nova pasta de áreas"
              className="h-9 border-sidebar-border bg-sidebar-accent text-sidebar-foreground placeholder:opacity-60"
            />
            <Button
              size="icon"
              className="h-9 w-9"
              aria-label="Criar pasta"
              disabled={createFolder.isPending}
              onClick={() => createFolder.mutate()}
            >
              <FolderPlus className="h-4 w-4" />
            </Button>
          </div>

          {territories.length === 0 ? (
            <p className="text-sm opacity-70">
              Nenhuma região ainda. Busque um bairro ou desenhe a área no mapa.
            </p>
          ) : (
            <div className="space-y-3">
              {folders.map((f) => {
                const items = territories.filter((t) => t.folder_id === f.id);
                const open = openFolders.includes(f.id);
                return (
                  <div key={f.id} className="rounded-lg bg-sidebar-accent/60">
                    <div className="flex items-center gap-1 px-2 py-2">
                      <button
                        className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm"
                        onClick={() =>
                          setOpenFolders((list) =>
                            list.includes(f.id) ? list.filter((x) => x !== f.id) : [...list, f.id],
                          )
                        }
                      >
                        {open ? (
                          <ChevronDown className="h-4 w-4 shrink-0 opacity-70" />
                        ) : (
                          <ChevronRight className="h-4 w-4 shrink-0 opacity-70" />
                        )}
                        <Folder className="h-4 w-4 shrink-0 opacity-70" />
                        <span className="truncate">{f.name}</span>
                        <span className="ml-auto shrink-0 text-[11px] opacity-60">
                          {items.length}
                        </span>
                      </button>
                      <button
                        aria-label={`Excluir pasta ${f.name}`}
                        onClick={() => deleteFolder.mutate(f.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5 opacity-60" />
                      </button>
                    </div>
                    {open && (
                      <ul className="space-y-1.5 px-2 pb-2">
                        {items.length === 0 && (
                          <li className="px-1 text-[11px] opacity-60">Pasta vazia</li>
                        )}
                        {items.map((t) => (
                          <TerritoryRow
                            key={t.id}
                            territory={t}
                            active={t.id === selectedId}
                            onOpen={() => {
                              setPreview(null);
                              setSelectedId(t.id);
                            }}
                          />
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}

              <ul className="space-y-2">
                {territories
                  .filter((t) => !t.folder_id)
                  .map((t) => (
                    <TerritoryRow
                      key={t.id}
                      territory={t}
                      active={t.id === selectedId}
                      onOpen={() => {
                        setPreview(null);
                        setSelectedId(t.id);
                      }}
                    />
                  ))}
              </ul>
            </div>
          )}

        </div>
      </aside>

      <div className="relative min-h-[55vh] flex-1">
        <ClientOnly fallback={<div className="h-full w-full animate-pulse bg-muted" />}>
          <Suspense fallback={<div className="h-full w-full animate-pulse bg-muted" />}>
            <TerritoryMap
              territories={territories}
              drawing={drawing}
              selectedId={selectedId}
              focus={focus}
              preview={preview?.path ?? null}
              places={places}
              selectedPlaceId={selectedPlaceId}
              onSelectPlace={setSelectedPlaceId}
              onSelect={setSelectedId}
              onDraftChange={setDraftPoints}
              finishSignal={finishSignal}
              onPolygonComplete={(path) => {
                setDrawing(false);
                setDraftPoints(0);
                createTerritory.mutate({ name: `Área ${territories.length + 1}`, path });
              }}
              onPathEdited={(id, path) => updateTerritory.mutate({ id, values: { path } })}
            />
          </Suspense>
        </ClientOnly>

        {preview && (
          <div className="absolute left-1/2 top-4 w-[min(24rem,calc(100%-2rem))] -translate-x-1/2 rounded-2xl border border-border bg-card p-4 shadow-lg">
            <p className="text-sm font-semibold">{preview.shortName}</p>
            <p className="truncate text-xs text-muted-foreground">{preview.name}</p>
            <div className="mt-3 flex gap-2">
              <Button
                className="flex-1"
                onClick={() => {
                  createTerritory.mutate({ name: preview.shortName, path: preview.path });
                  setPreview(null);
                  setResults([]);
                  setQuery("");
                }}
              >
                Marcar esta área
              </Button>
              <Button
                variant="outline"
                className="flex-1"
                disabled={loadingPlaces}
                onClick={() => void findPlaces(preview.path, preview.shortName)}
              >
                {loadingPlaces ? "Buscando…" : "Procurar na região"}
              </Button>
              <Button variant="ghost" size="icon" aria-label="Fechar" onClick={() => setPreview(null)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {selected && (
          <div className="absolute right-4 top-4 w-[min(20rem,calc(100%-2rem))] rounded-2xl border border-border bg-card p-5 shadow-lg">
            <div className="flex items-start justify-between gap-2">
              <h2 className="text-base font-semibold">Detalhes da região</h2>
              <Button variant="ghost" size="icon" aria-label="Fechar" onClick={() => setSelectedId(null)}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="mt-4 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="nome">Nome</Label>
                <Input
                  id="nome"
                  defaultValue={selected.name}
                  key={`${selected.id}-name`}
                  onBlur={(e) =>
                    e.target.value !== selected.name &&
                    updateTerritory.mutate({ id: selected.id, values: { name: e.target.value } })
                  }
                />
              </div>

              <div className="space-y-2">
                <Label>Status</Label>
                <div className="grid grid-cols-3 gap-1.5">
                  {STATUS_ORDER.map((s) => (
                    <button
                      key={s}
                      onClick={() => updateTerritory.mutate({ id: selected.id, values: { status: s } })}
                      className={`rounded-lg border px-2 py-2 text-xs font-medium transition ${
                        selected.status === s ? "border-transparent text-primary-foreground" : "border-border bg-background"
                      }`}
                      style={
                        selected.status === s ? { backgroundColor: STATUS_META[s].color } : undefined
                      }
                    >
                      {STATUS_META[s].label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="pasta">Pasta</Label>
                <select
                  id="pasta"
                  value={selected.folder_id ?? ""}
                  onChange={(e) =>
                    updateTerritory.mutate({
                      id: selected.id,
                      values: { folder_id: e.target.value || null },
                    })
                  }
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">Sem pasta</option>
                  {folders.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="notas">Anotações</Label>
                <Textarea
                  id="notas"
                  key={`${selected.id}-notes`}
                  defaultValue={selected.notes ?? ""}
                  placeholder="Lojas visitadas, retornos, observações…"
                  onBlur={(e) =>
                    e.target.value !== (selected.notes ?? "") &&
                    updateTerritory.mutate({ id: selected.id, values: { notes: e.target.value } })
                  }
                />
              </div>

              <Button
                variant="outline"
                className="w-full"
                disabled={loadingPlaces}
                onClick={() => void findPlaces(selected.path, selected.name)}
              >
                <Sparkles className="mr-2 h-4 w-4" />
                {loadingPlaces ? "Buscando…" : "Procurar comércios nesta área"}
              </Button>

              <Button
                variant="ghost"
                className="w-full text-destructive hover:text-destructive"
                onClick={() => deleteTerritory.mutate(selected.id)}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Excluir região
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function TerritoryRow({
  territory,
  active,
  onOpen,
}: {
  territory: Territory;
  active: boolean;
  onOpen: () => void;
}) {
  return (
    <li>
      <button
        onClick={onOpen}
        className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm transition ${
          active ? "bg-sidebar-primary text-sidebar-primary-foreground" : "bg-sidebar-accent"
        }`}
      >
        <span className="truncate pr-2">{territory.name}</span>
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: STATUS_META[territory.status].color }}
        />
      </button>
    </li>
  );
}

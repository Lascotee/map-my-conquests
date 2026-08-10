import { Suspense, lazy, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ClientOnly } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { LogOut, PencilRuler, Search, Sparkles, Star, Trash2, X } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { searchArea, type GeocodeResult } from "@/lib/geocode.functions";
import { searchAestheticPlaces, type PlaceResult } from "@/lib/places.functions";
import { STATUS_META, type LatLngLiteral, type Territory, type TerritoryStatus } from "@/lib/maps";
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
  const runSearch = useServerFn(searchArea);
  const runPlaces = useServerFn(searchAestheticPlaces);

  const [drawing, setDrawing] = useState(false);
  const [draftPoints, setDraftPoints] = useState(0);
  const [finishSignal, setFinishSignal] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [focus, setFocus] = useState<{ bounds: GeocodeResult["bounds"] } | null>(null);
  const [places, setPlaces] = useState<PlaceResult[]>([]);
  const [placeAreaName, setPlaceAreaName] = useState("");
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  const [loadingPlaces, setLoadingPlaces] = useState(false);


  const { data: territories = [] } = useQuery({
    queryKey: ["territories"],
    queryFn: async (): Promise<Territory[]> => {
      const { data, error } = await supabase
        .from("territories")
        .select("id, name, status, notes, path, updated_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Territory[];
    },
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
      toast.success("Região adicionada");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao salvar"),
  });

  const updateTerritory = useMutation({
    mutationFn: async (input: {
      id: string;
      values: Partial<Pick<Territory, "name" | "status" | "notes">> & { path?: LatLngLiteral[] };
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
      const found = await runSearch({ data: { query } });
      setResults(found);
      if (found.length === 0) toast.info("Nada encontrado para essa busca");
      else setFocus({ bounds: found[0]!.bounds });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Busca indisponível");
    } finally {
      setSearching(false);
    }
  }

  function addFromResult(r: GeocodeResult) {
    const b = r.bounds;
    const path: LatLngLiteral[] = [
      { lat: b.north, lng: b.west },
      { lat: b.north, lng: b.east },
      { lat: b.south, lng: b.east },
      { lat: b.south, lng: b.west },
    ];
    setFocus({ bounds: b });
    createTerritory.mutate({ name: r.name.split(",")[0] ?? r.name, path });
    setResults([]);
    setQuery("");
  }

  async function findPlaces(bounds: GeocodeResult["bounds"], areaName: string) {
    setLoadingPlaces(true);
    setSelectedPlaceId(null);
    setFocus({ bounds });
    try {
      const found = await runPlaces({ data: { bounds } });
      setPlaces(found);
      setPlaceAreaName(areaName);
      toast[found.length ? "success" : "info"](
        found.length
          ? `${found.length} comércios de estética encontrados`
          : "Nenhum comércio de estética encontrado nessa área",
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Busca de comércios indisponível");
    } finally {
      setLoadingPlaces(false);
    }
  }

  const selected = territories.find((t) => t.id === selectedId) ?? null;
  const selectedBounds = selected
    ? {
        north: Math.max(...selected.path.map((p) => p.lat)),
        south: Math.min(...selected.path.map((p) => p.lat)),
        east: Math.max(...selected.path.map((p) => p.lng)),
        west: Math.min(...selected.path.map((p) => p.lng)),
      }
    : null;
  const counts = STATUS_ORDER.map((s) => ({
    status: s,
    total: territories.filter((t) => t.status === s).length,
  }));


  return (
    <div className="flex h-screen flex-col bg-background lg:flex-row">
      <aside className="flex w-full shrink-0 flex-col border-b border-sidebar-border bg-sidebar text-sidebar-foreground lg:h-full lg:w-96 lg:border-b-0 lg:border-r">
        <div className="flex items-center justify-between px-5 py-4">
          <span className="font-display text-base font-bold">Territórios</span>
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
                <li key={r.name} className="rounded-lg bg-sidebar-accent px-3 py-2">
                  <p className="text-sm">{r.name}</p>
                  <div className="mt-2 flex gap-2">
                    <Button
                      size="sm"
                      className="flex-1"
                      disabled={loadingPlaces}
                      onClick={() => void findPlaces(r.bounds, r.name.split(",")[0] ?? r.name)}
                    >
                      <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                      Comércios
                    </Button>
                    <Button size="sm" variant="outline" className="flex-1" onClick={() => addFromResult(r)}>
                      Salvar região
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}


          <Button
            variant={drawing ? "default" : "outline"}
            className="w-full"
            onClick={() => {
              setSelectedId(null);
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
          {territories.length === 0 ? (
            <p className="text-sm opacity-70">
              Nenhuma região ainda. Busque um bairro ou desenhe a área no mapa.
            </p>
          ) : (
            <ul className="space-y-2">
              {territories.map((t) => (
                <li key={t.id}>
                  <button
                    onClick={() => setSelectedId(t.id)}
                    className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm ${
                      t.id === selectedId ? "bg-sidebar-primary text-sidebar-primary-foreground" : "bg-sidebar-accent"
                    }`}
                  >
                    <span className="truncate pr-2">{t.name}</span>
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: STATUS_META[t.status].color }}
                    />
                  </button>
                </li>
              ))}
            </ul>
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

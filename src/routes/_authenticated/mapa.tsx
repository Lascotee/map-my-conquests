import { Suspense, lazy, useState, useMemo } from "react";
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
  Compass,
  Layers,
  Filter,
  Maximize2,
  CheckCircle2,
  Clock,
  Ban,
  Check,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { searchArea } from "@/lib/geocode.functions";
import {
  loadIBGEBoundary,
  searchIBGEBoundaries,
  type BoundaryCandidate,
  type BoundaryResult,
} from "@/lib/boundary-search";
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
      { title: "Mapa de Territórios — Gestão Visual de Regiões" },
      { name: "description", content: "Marque bairros e áreas e acompanhe o status de cobertura." },
      { property: "og:title", content: "Mapa de Territórios — Gestão Visual de Regiões" },
      {
        property: "og:description",
        content: "Marque bairros e áreas e acompanhe o status de cobertura.",
      },
    ],
  }),
  component: MapaPage,
});

const STATUS_ORDER: TerritoryStatus[] = ["pendente", "andamento", "concluido"];
const LOCAL_TERRITORIES_PREFIX = "territorios:owned:";
const LOCAL_FOLDERS_PREFIX = "territorios:folders:";
const LOCAL_PRESETS_PREFIX = "territorios:presets:";

type CategoryPreset = {
  id: string;
  user_id: string;
  name: string;
  categories: string[];
  owned: boolean;
};

function errorMessage(error: unknown, fallback: string) {
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}

function readLocalTerritories(userId: string): Territory[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(`${LOCAL_TERRITORIES_PREFIX}${userId}`) ?? "[]",
    );
    return Array.isArray(parsed) ? (parsed as Territory[]) : [];
  } catch {
    return [];
  }
}

function writeLocalTerritories(userId: string, territories: Territory[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    `${LOCAL_TERRITORIES_PREFIX}${userId}`,
    JSON.stringify(territories.filter((territory) => territory.owned)),
  );
}

function readLocalFolders(userId: string): TerritoryFolder[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(`${LOCAL_FOLDERS_PREFIX}${userId}`) ?? "[]");
    return Array.isArray(parsed) ? (parsed as TerritoryFolder[]) : [];
  } catch {
    return [];
  }
}

function writeLocalFolders(userId: string, folders: TerritoryFolder[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    `${LOCAL_FOLDERS_PREFIX}${userId}`,
    JSON.stringify(folders.filter((folder) => folder.owned)),
  );
}

function readLocalPresets(userId: string): CategoryPreset[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(`${LOCAL_PRESETS_PREFIX}${userId}`) ?? "[]");
    return Array.isArray(parsed) ? (parsed as CategoryPreset[]) : [];
  } catch {
    return [];
  }
}

function writeLocalPresets(userId: string, presets: CategoryPreset[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    `${LOCAL_PRESETS_PREFIX}${userId}`,
    JSON.stringify(presets.filter((preset) => preset.owned)),
  );
}

function MapaPage() {
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const runGeocode = useServerFn(searchArea);
  const runPlaces = useServerFn(searchAestheticPlaces);

  const [drawing, setDrawing] = useState(false);
  const [draftPoints, setDraftPoints] = useState(0);
  const [finishSignal, setFinishSignal] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [territorySearch, setTerritorySearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<TerritoryStatus | "todos">("todos");
  const [results, setResults] = useState<BoundaryCandidate[]>([]);
  const [preview, setPreview] = useState<BoundaryResult | null>(null);
  const [searching, setSearching] = useState(false);
  const [loadingBoundaryId, setLoadingBoundaryId] = useState<string | null>(null);
  const [focus, setFocus] = useState<{ bounds: Bounds } | null>(null);
  const [places, setPlaces] = useState<PlaceResult[]>([]);
  const [placeAreaName, setPlaceAreaName] = useState("");
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  const [loadingPlaces, setLoadingPlaces] = useState(false);
  const [categories, setCategories] = useState<string[]>([]);
  const [categoryInput, setCategoryInput] = useState("");
  const [presetName, setPresetName] = useState("");
  const [shareTarget, setShareTarget] = useState<{
    kind: "folder" | "preset";
    id: string;
    name: string;
  } | null>(null);
  const [folderName, setFolderName] = useState("");
  const [openFolders, setOpenFolders] = useState<string[]>([]);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const { data: territories = [] } = useQuery({
    queryKey: ["territories"],
    queryFn: async (): Promise<Territory[]> => {
      const local = readLocalTerritories(user.id);
      const { data, error } = await supabase
        .from("territories")
        .select("id, user_id, name, status, notes, path, updated_at, folder_id")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      if (error) {
        if (errorMessage(error, "").includes("can_view_folder")) return local;
        throw error;
      }
      const remote = (data ?? []).map((territory) => ({
        ...(territory as unknown as Omit<Territory, "owned">),
        owned: territory.user_id === user.id,
      }));
      const remoteIds = new Set(remote.map((territory) => territory.id));
      const merged = [...remote, ...local.filter((territory) => !remoteIds.has(territory.id))];
      writeLocalTerritories(user.id, merged);
      return merged;
    },
  });

  const { data: folders = [] } = useQuery({
    queryKey: ["territory-folders"],
    queryFn: async (): Promise<TerritoryFolder[]> => {
      const local = readLocalFolders(user.id);
      let { data, error } = await supabase
        .from("territory_folders")
        .select("id, user_id, name")
        .order("name");
      if (error) {
        const ownResult = await supabase
          .from("territory_folders")
          .select("id, user_id, name")
          .eq("user_id", user.id)
          .order("name");
        data = ownResult.data;
        error = ownResult.error;
      }
      if (error) return local;
      const remote = (data ?? []).map((folder) => ({
        ...folder,
        owned: folder.user_id === user.id,
      }));
      const remoteIds = new Set(remote.map((folder) => folder.id));
      const merged = [...remote, ...local.filter((folder) => !remoteIds.has(folder.id))];
      writeLocalFolders(user.id, merged);
      return merged;
    },
  });

  const createFolder = useMutation({
    mutationFn: async () => {
      const name = folderName.trim();
      if (!name) throw new Error("Dê um nome à pasta");
      const folder: TerritoryFolder = {
        id: crypto.randomUUID(),
        user_id: user.id,
        name,
        owned: true,
      };
      const { error } = await supabase
        .from("territory_folders")
        .insert({ id: folder.id, name, user_id: user.id });
      if (error) throw error;
      return folder;
    },
    onSuccess: async (folder) => {
      setFolderName("");
      queryClient.setQueryData<TerritoryFolder[]>(["territory-folders"], (current = []) => {
        const next = [...current.filter((item) => item.id !== folder.id), folder].sort((a, b) =>
          a.name.localeCompare(b.name, "pt-BR"),
        );
        writeLocalFolders(user.id, next);
        return next;
      });
      await queryClient.invalidateQueries({ queryKey: ["territory-folders"] });
      toast.success("Pasta criada com sucesso");
    },
    onError: (e) => toast.error(errorMessage(e, "Erro ao criar pasta")),
  });

  const deleteFolder = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("territory_folders")
        .delete()
        .eq("id", id)
        .eq("user_id", user.id);
      if (error && !errorMessage(error, "").includes("can_view_folder")) throw error;
      return id;
    },
    onSuccess: async (id) => {
      queryClient.setQueryData<TerritoryFolder[]>(["territory-folders"], (current = []) => {
        const next = current.filter((folder) => folder.id !== id);
        writeLocalFolders(user.id, next);
        return next;
      });
      queryClient.setQueryData<Territory[]>(["territories"], (current = []) => {
        const next = current.map((territory) =>
          territory.folder_id === id ? { ...territory, folder_id: null } : territory,
        );
        writeLocalTerritories(user.id, next);
        return next;
      });
      await queryClient.invalidateQueries({ queryKey: ["territory-folders"] });
      await queryClient.invalidateQueries({ queryKey: ["territories"] });
      toast.success("Pasta removida");
    },
    onError: (e) => toast.error(errorMessage(e, "Erro ao excluir pasta")),
  });

  const { data: presets = [] } = useQuery({
    queryKey: ["category-presets"],
    queryFn: async (): Promise<CategoryPreset[]> => {
      const local = readLocalPresets(user.id);
      let { data, error } = await supabase
        .from("category_presets")
        .select("id, user_id, name, categories")
        .order("name");
      if (error) {
        const ownResult = await supabase
          .from("category_presets")
          .select("id, user_id, name, categories")
          .eq("user_id", user.id)
          .order("name");
        data = ownResult.data;
        error = ownResult.error;
      }
      if (error) return local;
      const remote = (data ?? []).map((preset) => ({
        ...preset,
        owned: preset.user_id === user.id,
      }));
      const remoteIds = new Set(remote.map((preset) => preset.id));
      const merged = [...remote, ...local.filter((preset) => !remoteIds.has(preset.id))];
      writeLocalPresets(user.id, merged);
      return merged;
    },
  });

  const savePreset = useMutation({
    mutationFn: async () => {
      const name = presetName.trim();
      if (!name) throw new Error("Dê um nome ao preset");
      if (categories.length === 0) throw new Error("Adicione ao menos uma categoria");
      const existing = presets.find(
        (preset) => preset.owned && preset.name.toLocaleLowerCase("pt-BR") === name.toLocaleLowerCase("pt-BR"),
      );
      const preset: CategoryPreset = existing
        ? { ...existing, name, categories: [...categories] }
        : {
            id: crypto.randomUUID(),
            user_id: user.id,
            name,
            categories: [...categories],
            owned: true,
          };
      const { error } = existing
        ? await supabase
            .from("category_presets")
            .update({ name, categories })
            .eq("id", existing.id)
            .eq("user_id", user.id)
        : await supabase.from("category_presets").insert({
            id: preset.id,
            user_id: user.id,
            name,
            categories,
          });
      if (error && !errorMessage(error, "").includes("can_view_preset")) throw error;
      return preset;
    },
    onSuccess: async (preset) => {
      setPresetName("");
      queryClient.setQueryData<CategoryPreset[]>(["category-presets"], (current = []) => {
        const next = [...current.filter((item) => item.id !== preset.id), preset].sort((a, b) =>
          a.name.localeCompare(b.name, "pt-BR"),
        );
        writeLocalPresets(user.id, next);
        return next;
      });
      await queryClient.invalidateQueries({ queryKey: ["category-presets"] });
      toast.success("Preset salvo com sucesso");
    },
    onError: (e) => toast.error(errorMessage(e, "Erro ao salvar preset")),
  });

  const deletePreset = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("category_presets")
        .delete()
        .eq("id", id)
        .eq("user_id", user.id);
      if (error && !errorMessage(error, "").includes("can_view_preset")) throw error;
      return id;
    },
    onSuccess: async (id) => {
      queryClient.setQueryData<CategoryPreset[]>(["category-presets"], (current = []) => {
        const next = current.filter((preset) => preset.id !== id);
        writeLocalPresets(user.id, next);
        return next;
      });
      await queryClient.invalidateQueries({ queryKey: ["category-presets"] });
      toast.success("Preset removido");
    },
    onError: (e) => toast.error(errorMessage(e, "Erro ao excluir preset")),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["territories"] });

  const createTerritory = useMutation({
    mutationFn: async (input: { name: string; path: LatLngLiteral[] }) => {
      const territory: Territory = {
        id: crypto.randomUUID(),
        user_id: user.id,
        owned: true,
        name: input.name,
        status: "pendente",
        notes: null,
        path: input.path,
        updated_at: new Date().toISOString(),
        folder_id: null,
      };
      // Do not chain .select() here. The database's shared-area SELECT policy
      // must not be evaluated while inserting an area owned by this user.
      const { error } = await supabase.from("territories").insert({
        id: territory.id,
        name: territory.name,
        path: territory.path as never,
        user_id: territory.user_id,
      });
      if (error) throw error;
      return territory;
    },
    onSuccess: (data) => {
      queryClient.setQueryData<Territory[]>(["territories"], (current = []) => {
        const next = [data, ...current.filter((territory) => territory.id !== data.id)];
        writeLocalTerritories(user.id, next);
        return next;
      });
      setSelectedId(data.id);
      toast.success("Região demarcada com sucesso!");
    },
    onError: (e) => toast.error(errorMessage(e, "Erro ao salvar a região")),
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
        .eq("id", input.id)
        .eq("user_id", user.id);
      if (error && !errorMessage(error, "").includes("can_view_folder")) throw error;
      return input;
    },
    onSuccess: (input) => {
      queryClient.setQueryData<Territory[]>(["territories"], (current = []) => {
        const next = current.map((territory) =>
          territory.id === input.id ? { ...territory, ...input.values } : territory,
        );
        writeLocalTerritories(user.id, next);
        return next;
      });
    },
    onError: (e) => toast.error(errorMessage(e, "Erro ao atualizar")),
  });

  const deleteTerritory = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("territories")
        .delete()
        .eq("id", id)
        .eq("user_id", user.id);
      if (error && !errorMessage(error, "").includes("can_view_folder")) throw error;
      return id;
    },
    onSuccess: (id) => {
      setSelectedId(null);
      setConfirmDeleteId(null);
      queryClient.setQueryData<Territory[]>(["territories"], (current = []) => {
        const next = current.filter((territory) => territory.id !== id);
        writeLocalTerritories(user.id, next);
        return next;
      });
      toast.success("Região excluída com sucesso");
    },
    onError: (e) => toast.error(errorMessage(e, "Erro ao excluir")),
  });

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (query.trim().length < 2) return;
    setSearching(true);
    try {
      let found: BoundaryCandidate[] = await searchIBGEBoundaries(query);
      if (found.length === 0) {
        const geo = await runGeocode({ data: { query } });
        found = geo.map((g, index) => ({
          id: `google:${index}:${g.name}`,
          name: g.name,
          shortName: g.name.split(",")[0] ?? g.name,
          type: "aproximado" as const,
          source: "Google Maps" as const,
          path: rectPath(g.bounds),
          bounds: g.bounds,
          exact: false,
        }));
      }
      setResults(found);
      if (found.length === 0) {
        toast.info("Nenhuma região encontrada com esse termo.");
      } else {
        await selectResult(found[0]!);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Busca indisponível");
    } finally {
      setSearching(false);
    }
  }

  async function selectResult(candidate: BoundaryCandidate) {
    setLoadingBoundaryId(candidate.id);
    try {
      const result = await loadIBGEBoundary(candidate);
      setPreview(result);
      setFocus({ bounds: result.bounds });
      setSelectedId(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível carregar o contorno");
    } finally {
      setLoadingBoundaryId(null);
    }
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
          ? `${found.length} comércios encontrados e salvos em Leads!`
          : "Nenhum comércio localizado nesta área com os filtros atuais.",
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Busca de comércios indisponível");
    } finally {
      setLoadingPlaces(false);
    }
  }

  const selected = territories.find((t) => t.id === selectedId) ?? null;
  const selectedPlace = places.find((p) => p.id === selectedPlaceId) ?? null;

  const counts = {
    todos: territories.length,
    pendente: territories.filter((t) => t.status === "pendente").length,
    andamento: territories.filter((t) => t.status === "andamento").length,
    concluido: territories.filter((t) => t.status === "concluido").length,
  };

  const filteredTerritories = useMemo(() => {
    const q = territorySearch.trim().toLowerCase();
    return territories.filter((t) => {
      if (statusFilter !== "todos" && t.status !== statusFilter) return false;
      if (!q) return true;
      return t.name.toLowerCase().includes(q) || (t.notes || "").toLowerCase().includes(q);
    });
  }, [territories, statusFilter, territorySearch]);

  function focusTerritory(t: Territory) {
    if (t.path && t.path.length) {
      setFocus({ bounds: boundsOf(t.path) });
      setSelectedId(t.id);
      setPreview(null);
    }
  }

  return (
    <div className="flex h-screen flex-col bg-[#030308] text-foreground lg:flex-row">
      {/* Sidebar Controls */}
      <aside className="flex w-full shrink-0 flex-col border-b border-white/10 bg-[#06060e] text-sidebar-foreground lg:h-full lg:w-[410px] lg:border-b-0 lg:border-r">
        {/* Brand Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-3">
          <Link to="/" className="flex items-center transition-transform hover:scale-[1.02]">
            <img
              src="/logo.png"
              alt="Prospect — Radar de Conquistas"
              className="h-11 w-auto object-contain drop-shadow-md"
            />
          </Link>

          <div className="flex items-center gap-1.5">
            <Button asChild variant="outline" size="sm" className="h-8 border-white/10 bg-white/5 text-xs text-zinc-300 hover:bg-white/10">
              <Link to="/leads" search={{ area: "todas" }}>
                <Users className="mr-1.5 h-3.5 w-3.5 text-blue-400" />
                Leads
              </Link>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-zinc-400 hover:text-white"
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

        {/* Stats Pills */}
        <div className="grid grid-cols-3 gap-2 p-4">
          {[
            { key: "concluido", label: "Concluído", count: counts.concluido, color: "#1f9d6d", bg: "bg-emerald-950/30 border-emerald-500/30" },
            { key: "andamento", label: "Andamento", count: counts.andamento, color: "#e0a03d", bg: "bg-amber-950/30 border-amber-500/30" },
            { key: "pendente", label: "Pendente", count: counts.pendente, color: "#e0533d", bg: "bg-rose-950/30 border-rose-500/30" },
          ].map((c) => (
            <button
              key={c.key}
              onClick={() => setStatusFilter(statusFilter === c.key ? "todos" : (c.key as TerritoryStatus))}
              className={`rounded-2xl border p-2.5 text-left transition-all ${
                statusFilter === c.key ? "ring-2 ring-blue-400 " + c.bg : "border-white/5 bg-white/[0.02] hover:bg-white/[0.04]"
              }`}
            >
              <span className="flex items-center gap-1.5 text-[11px] font-medium text-zinc-400">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: c.color }} />
                {c.label}
              </span>
              <p className="mt-1 font-display text-xl font-black text-white">{c.count}</p>
            </button>
          ))}
        </div>

        {/* Search IBGE / Google Boundaries */}
        <div className="space-y-2.5 border-t border-white/10 px-4 py-3">
          <form onSubmit={handleSearch} className="flex gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar bairro oficial ou cidade..."
                className="h-9 border-white/10 bg-black/40 pl-8 text-xs text-white placeholder:text-zinc-500"
              />
            </div>
            <Button type="submit" size="sm" disabled={searching} className="h-9 bg-blue-600 text-white hover:bg-blue-500">
              {searching ? "..." : "Buscar"}
            </Button>
          </form>

          {/* Search boundary results list */}
          {results.length > 0 && (
            <ul className="max-h-48 overflow-y-auto space-y-1 rounded-xl border border-white/10 bg-black/50 p-1.5">
              {results.map((r) => (
                <li
                  key={r.id}
                  className={`rounded-lg p-2 transition ${
                    preview?.id === r.id
                      ? "bg-blue-600/30 border border-blue-500/50"
                      : "bg-white/[0.02] hover:bg-white/[0.06]"
                  }`}
                >
                  <button
                    className="block w-full text-left"
                    disabled={loadingBoundaryId !== null}
                    onClick={() => void selectResult(r)}
                  >
                    <span className="block text-xs font-bold text-white">{r.shortName}</span>
                    <span className="block truncate text-[10px] text-zinc-400">{r.name}</span>
                    <span className="text-[10px] text-blue-400">
                      {loadingBoundaryId === r.id
                        ? "Carregando contorno..."
                        : r.exact
                          ? "✓ Contorno oficial IBGE"
                          : "Área aproximada Google Maps"}
                    </span>
                  </button>
                  {preview?.id === r.id && (
                    <div className="mt-2 flex gap-1.5">
                      <Button
                        size="sm"
                        className="h-7 flex-1 bg-blue-600 text-[11px] text-white hover:bg-blue-500"
                        onClick={() => {
                          createTerritory.mutate({ name: preview.shortName, path: preview.path });
                          setResults([]);
                          setPreview(null);
                          setQuery("");
                        }}
                      >
                        Marcar esta área
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 border-white/10 text-[11px] text-zinc-200 hover:bg-white/10"
                        disabled={loadingPlaces}
                        onClick={() => void findPlaces(preview.path, preview.shortName)}
                      >
                        <Sparkles className="mr-1 h-3 w-3 text-amber-400" />
                        Comércios
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Free polygon drawing trigger */}
        <div className="border-t border-white/10 px-4 py-3">
          <Button
            variant={drawing ? "default" : "outline"}
            className={`w-full py-5 text-xs font-bold shadow-md transition-all ${
              drawing
                ? "bg-amber-500 text-black hover:bg-amber-400 ring-2 ring-amber-400/50"
                : "border-white/15 bg-white/5 text-white hover:bg-white/10"
            }`}
            onClick={() => {
              setSelectedId(null);
              setPreview(null);
              setDrawing((d) => !d);
            }}
          >
            <PencilRuler className="mr-2 h-4 w-4" />
            {drawing ? `Desenhando (${draftPoints} pts) — Clique para Cancelar` : "Desenhar Polígono Livre no Mapa"}
          </Button>

          {drawing && (
            <div className="mt-2 space-y-2 rounded-2xl border border-amber-500/30 bg-amber-950/30 p-3 text-xs text-amber-200">
              <p className="text-[11px] leading-relaxed">
                👉 Clique no mapa para posicionar os cantos da região ({draftPoints} ponto{draftPoints === 1 ? "" : "s"}).
                Dê dois cliques no mapa ou use o botão abaixo para finalizar.
              </p>
              <Button
                size="sm"
                className="w-full bg-amber-500 text-xs font-bold text-black hover:bg-amber-400"
                disabled={draftPoints < 3}
                onClick={() => setFinishSignal((n) => n + 1)}
              >
                Concluir Polígono ({draftPoints} Pontos)
              </Button>
            </div>
          )}
        </div>

        {/* Commercial Lead Finder Configuration */}
        <details className="border-t border-white/10 px-4 py-3 group">
          <summary className="cursor-pointer list-none flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-zinc-400 hover:text-zinc-200">
            <span>⚙️ Categorias de Busca Comercial</span>
            <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
          </summary>
          <div className="mt-3 space-y-3 rounded-2xl border border-white/10 bg-black/40 p-3 text-xs">
            <Label className="text-[11px] text-zinc-400">
              Palavras-chave pesquisadas dentro do polígono:
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
                placeholder="ex.: clínica, dentista, ótica..."
                className="h-8 border-white/10 bg-black/40 text-xs text-white"
              />
              <Button size="icon" className="h-8 w-8 bg-blue-600" onClick={addCategory}>
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>

            {categories.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {categories.map((c) => (
                  <button
                    key={c}
                    onClick={() => setCategories((list) => list.filter((x) => x !== c))}
                    className="flex items-center gap-1 rounded-full border border-blue-500/30 bg-blue-500/10 px-2 py-0.5 text-[11px] text-blue-300 hover:bg-red-500/20 hover:text-red-300"
                  >
                    <span>{c}</span>
                    <X className="h-3 w-3" />
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-[11px] text-zinc-500">
                Padrão: clínicas de estética, odontologia, dermatologia e saúde.
              </p>
            )}

            {/* Presets manager */}
            <div className="border-t border-white/10 pt-2 space-y-2">
              <span className="text-[10px] font-semibold text-zinc-400 uppercase">Presets salvos</span>
              {presets.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {presets.map((p) => (
                    <span key={p.id} className="flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-zinc-300">
                      <button onClick={() => { setCategories(p.categories); toast.success(`Preset "${p.name}" ativo!`); }}>
                        {p.name}
                      </button>
                      {p.owned && (
                        <button onClick={() => deletePreset.mutate(p.id)} className="text-zinc-500 hover:text-red-400">
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </span>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <Input
                  value={presetName}
                  onChange={(e) => setPresetName(e.target.value)}
                  placeholder="Nome para salvar o preset..."
                  className="h-8 border-white/10 bg-black/40 text-xs text-white"
                />
                <Button size="sm" className="h-8 text-xs bg-white/10 hover:bg-white/20" onClick={() => savePreset.mutate()}>
                  Salvar
                </Button>
              </div>
            </div>
          </div>
        </details>

        {/* Territory List & Folder Management */}
        <div className="min-h-0 flex-1 overflow-y-auto border-t border-white/10 p-4 space-y-3">
          {/* Quick Territory Search & Status Filter Banner */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
              <Input
                value={territorySearch}
                onChange={(e) => setTerritorySearch(e.target.value)}
                placeholder="Filtrar territórios salvos..."
                className="h-8 border-white/10 bg-black/40 pl-8 text-xs text-white placeholder:text-zinc-600"
              />
            </div>
            {statusFilter !== "todos" && (
              <Button size="sm" variant="ghost" className="h-8 text-[11px] text-blue-400" onClick={() => setStatusFilter("todos")}>
                Limpar filtro
              </Button>
            )}
          </div>

          {/* New Folder input */}
          <div className="flex gap-2">
            <Input
              value={folderName}
              onChange={(e) => setFolderName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  createFolder.mutate();
                }
              }}
              placeholder="Criar nova pasta de regiões..."
              className="h-8 border-white/10 bg-black/40 text-xs text-white placeholder:text-zinc-600"
            />
            <Button
              size="icon"
              className="h-8 w-8 bg-blue-600 hover:bg-blue-500"
              aria-label="Criar pasta"
              disabled={createFolder.isPending}
              onClick={() => createFolder.mutate()}
            >
              <FolderPlus className="h-3.5 w-3.5 text-white" />
            </Button>
          </div>

          {territories.length === 0 ? (
            <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-6 text-center">
              <Compass className="mx-auto h-8 w-8 text-zinc-600" />
              <p className="mt-2 text-xs font-semibold text-zinc-300">Nenhum território demarcado</p>
              <p className="mt-1 text-[11px] text-zinc-500">
                Busque um bairro oficial pelo nome ou clique em 'Desenhar Polígono Livre'.
              </p>
            </div>
          ) : filteredTerritories.length === 0 ? (
            <p className="text-center text-xs text-zinc-500 py-6">
              Nenhuma região corresponde aos filtros.
            </p>
          ) : (
            <div className="space-y-3">
              {/* Folders List */}
              {folders.map((f) => {
                const items = filteredTerritories.filter((t) => t.folder_id === f.id);
                const open = openFolders.includes(f.id);
                return (
                  <div key={f.id} className="rounded-2xl border border-white/10 bg-white/[0.02] overflow-hidden">
                    <div className="flex items-center justify-between p-2.5 bg-white/[0.03]">
                      <button
                        className="flex min-w-0 flex-1 items-center gap-2 text-left text-xs font-bold text-white"
                        onClick={() =>
                          setOpenFolders((list) =>
                            list.includes(f.id) ? list.filter((x) => x !== f.id) : [...list, f.id],
                          )
                        }
                      >
                        {open ? (
                          <ChevronDown className="h-3.5 w-3.5 text-zinc-400" />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5 text-zinc-400" />
                        )}
                        <Folder className="h-4 w-4 text-blue-400" />
                        <span className="truncate">{f.name}</span>
                        <span className="ml-auto rounded-full bg-white/10 px-2 py-0.2 text-[10px] text-zinc-300">
                          {items.length}
                        </span>
                      </button>
                      {f.owned && (
                        <div className="flex items-center gap-1 pl-2">
                          <button
                            title="Compartilhar pasta"
                            className="p-1 text-zinc-400 hover:text-white"
                            onClick={() =>
                              setShareTarget({ kind: "folder", id: f.id, name: f.name })
                            }
                          >
                            <Share2 className="h-3.5 w-3.5" />
                          </button>
                          <button
                            title="Excluir pasta"
                            className="p-1 text-zinc-400 hover:text-red-400"
                            onClick={() => deleteFolder.mutate(f.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                    </div>

                    {open && (
                      <ul className="space-y-1.5 p-2 border-t border-white/5">
                        {items.length === 0 && (
                          <li className="px-2 py-1 text-[11px] text-zinc-500 italic">Pasta vazia</li>
                        )}
                        {items.map((t) => (
                          <TerritoryCard
                            key={t.id}
                            territory={t}
                            active={t.id === selectedId}
                            onSelect={() => focusTerritory(t)}
                            onFindPlaces={() => void findPlaces(t.path, t.name)}
                          />
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}

              {/* Unorganized Territories */}
              <ul className="space-y-1.5">
                {filteredTerritories
                  .filter((t) => !t.folder_id)
                  .map((t) => (
                    <TerritoryCard
                      key={t.id}
                      territory={t}
                      active={t.id === selectedId}
                      onSelect={() => focusTerritory(t)}
                      onFindPlaces={() => void findPlaces(t.path, t.name)}
                    />
                  ))}
              </ul>
            </div>
          )}
        </div>
      </aside>

      {/* Map Area */}
      <div className="relative min-h-[60vh] flex-1">
        <ClientOnly fallback={<div className="h-full w-full animate-pulse bg-zinc-950" />}>
          <Suspense fallback={<div className="h-full w-full animate-pulse bg-zinc-950" />}>
            <TerritoryMap
              territories={territories}
              drawing={drawing}
              selectedId={selectedId}
              focus={focus}
              preview={preview?.path ?? null}
              places={places}
              selectedPlaceId={selectedPlaceId}
              onSelectPlace={setSelectedPlaceId}
              onSelect={(id) => {
                setSelectedId(id);
                setPreview(null);
              }}
              onDraftChange={setDraftPoints}
              finishSignal={finishSignal}
              onCancelDrawing={() => setDrawing(false)}
              onPolygonComplete={(path) => {
                setDrawing(false);
                setDraftPoints(0);
                createTerritory.mutate({ name: `Região ${territories.length + 1}`, path });
              }}
              onPathEdited={(id, path) => {
                if (territories.find((territory) => territory.id === id)?.owned) {
                  updateTerritory.mutate({ id, values: { path } });
                }
              }}
            />
          </Suspense>
        </ClientOnly>

        {/* Selected Territory Floating Detail Card (Top-Right) */}
        {selected && (
          <div className="absolute right-4 top-4 z-20 w-[min(22rem,calc(100%-2rem))] rounded-3xl border border-white/20 bg-black/85 p-5 shadow-2xl backdrop-blur-2xl text-white">
            <div className="flex items-start justify-between gap-2 border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <span
                  className="h-3 w-3 rounded-full"
                  style={{ backgroundColor: STATUS_META[selected.status].color }}
                />
                <h2 className="font-display text-base font-bold truncate">{selected.name}</h2>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-zinc-400 hover:text-white"
                  title="Focar no mapa"
                  onClick={() => focusTerritory(selected)}
                >
                  <Maximize2 className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-zinc-400 hover:text-white"
                  aria-label="Fechar"
                  onClick={() => setSelectedId(null)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="mt-4 space-y-4">
              {/* Name */}
              <div className="space-y-1">
                <Label htmlFor="nome" className="text-xs text-zinc-400">Nome da Região</Label>
                <Input
                  id="nome"
                  defaultValue={selected.name}
                  key={`${selected.id}-name`}
                  readOnly={!selected.owned}
                  className="border-white/10 bg-white/5 text-sm text-white"
                  onBlur={(e) =>
                    e.target.value !== selected.name &&
                    updateTerritory.mutate({ id: selected.id, values: { name: e.target.value } })
                  }
                />
              </div>

              {/* Status Selectors */}
              <div className="space-y-1.5">
                <Label className="text-xs text-zinc-400">Status de Cobertura</Label>
                <div className="grid grid-cols-3 gap-1.5">
                  {STATUS_ORDER.map((s) => (
                    <button
                      key={s}
                      disabled={!selected.owned}
                      onClick={() => updateTerritory.mutate({ id: selected.id, values: { status: s } })}
                      className={`rounded-xl border py-2 text-xs font-bold transition-all ${
                        selected.status === s
                          ? "text-black shadow-lg"
                          : "border-white/10 bg-white/5 text-zinc-400 hover:border-white/20 hover:text-white"
                      }`}
                      style={
                        selected.status === s
                          ? { backgroundColor: STATUS_META[s].color, borderColor: STATUS_META[s].color }
                          : undefined
                      }
                    >
                      {STATUS_META[s].label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Folder */}
              <div className="space-y-1">
                <Label htmlFor="pasta" className="text-xs text-zinc-400">Pasta / Grupo</Label>
                <select
                  id="pasta"
                  value={selected.folder_id ?? ""}
                  disabled={!selected.owned}
                  onChange={(e) =>
                    updateTerritory.mutate({
                      id: selected.id,
                      values: { folder_id: e.target.value || null },
                    })
                  }
                  className="h-9 w-full rounded-md border border-white/10 bg-black/60 px-3 text-xs text-white focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">Sem pasta</option>
                  {folders
                    .filter((folder) => folder.owned || folder.id === selected.folder_id)
                    .map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                </select>
              </div>

              {/* Notes */}
              <div className="space-y-1">
                <Label htmlFor="notas" className="text-xs text-zinc-400">Anotações de Campo</Label>
                <Textarea
                  id="notas"
                  key={`${selected.id}-notes`}
                  readOnly={!selected.owned}
                  rows={3}
                  defaultValue={selected.notes ?? ""}
                  placeholder="Comércios visitados, contatos, notas de rota..."
                  className="border-white/10 bg-white/5 text-xs text-white placeholder:text-zinc-600"
                  onBlur={(e) =>
                    e.target.value !== (selected.notes ?? "") &&
                    updateTerritory.mutate({ id: selected.id, values: { notes: e.target.value } })
                  }
                />
              </div>

              {/* Actions */}
              <div className="space-y-2 border-t border-white/10 pt-3">
                <Button
                  className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-xs font-bold text-white shadow-lg shadow-blue-500/25 hover:opacity-90"
                  disabled={loadingPlaces}
                  onClick={() => void findPlaces(selected.path, selected.name)}
                >
                  <Sparkles className="mr-1.5 h-4 w-4 text-amber-300" />
                  {loadingPlaces ? "Buscando comércios..." : "Buscar Comércios nesta Área"}
                </Button>

                <Button asChild variant="outline" className="w-full border-white/10 bg-white/5 text-xs text-zinc-300 hover:bg-white/10">
                  <Link to="/leads" search={{ area: selected.name }}>
                    <Users className="mr-1.5 h-3.5 w-3.5 text-blue-400" />
                    Ver Leads desta Região
                  </Link>
                </Button>

                {selected.owned && (
                  <Button
                    variant="ghost"
                    className="w-full text-xs text-red-400 hover:bg-red-500/20 hover:text-red-300"
                    onClick={() => setConfirmDeleteId(selected.id)}
                  >
                    <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                    Excluir esta Região
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Selected Place Popup (Bottom-Left) */}
        {selectedPlace && (
          <div className="absolute bottom-4 left-4 z-20 w-[min(22rem,calc(100%-2rem))] rounded-3xl border border-white/20 bg-black/90 p-4 text-white shadow-2xl backdrop-blur-xl">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-display text-sm font-bold text-white truncate">{selectedPlace.name}</p>
                <p className="flex items-start gap-1 text-[11px] text-zinc-400 mt-0.5">
                  <MapPin className="mt-0.5 h-3 w-3 shrink-0 text-blue-400" />
                  <span className="truncate">{selectedPlace.address}</span>
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-zinc-400 hover:text-white"
                aria-label="Fechar"
                onClick={() => setSelectedPlaceId(null)}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>

            <div className="mt-2 flex flex-wrap gap-2 text-xs text-zinc-400">
              {selectedPlace.rating !== null && (
                <span className="flex items-center gap-1 rounded bg-amber-500/10 px-1.5 py-0.5 text-[11px] text-amber-400 font-semibold">
                  <Star className="h-3 w-3 fill-amber-400" />
                  {selectedPlace.rating.toFixed(1)} ({selectedPlace.reviews ?? 0})
                </span>
              )}
              <span className="text-[11px] text-zinc-300">
                {selectedPlace.phone ?? "Sem telefone"}
              </span>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {selectedPlace.phone && (
                <Button
                  size="sm"
                  className="h-8 bg-emerald-600 text-xs font-bold text-white hover:bg-emerald-500"
                  onClick={() =>
                    window.open(
                      `https://wa.me/${whatsappNumber(selectedPlace.phone!)}`,
                      "_blank",
                      "noopener,noreferrer",
                    )
                  }
                >
                  <MessageCircle className="mr-1.5 h-3.5 w-3.5" />
                  WhatsApp
                </Button>
              )}
              {selectedPlace.website && (
                <Button size="sm" variant="outline" className="h-8 border-white/10 bg-white/5 text-xs text-zinc-300" asChild>
                  <a href={selectedPlace.website} target="_blank" rel="noopener noreferrer">
                    <Globe className="mr-1.5 h-3.5 w-3.5" />
                    Site
                  </a>
                </Button>
              )}
              {selectedPlace.instagram && (
                <Button size="sm" variant="outline" className="h-8 border-white/10 bg-white/5 text-xs text-pink-300" asChild>
                  <a href={selectedPlace.instagram} target="_blank" rel="noopener noreferrer">
                    <Instagram className="mr-1.5 h-3.5 w-3.5" />
                    Instagram
                  </a>
                </Button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Share Dialog */}
      {shareTarget && <ShareDialog target={shareTarget} onClose={() => setShareTarget(null)} />}

      {/* Delete Territory Confirmation */}
      {confirmDeleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-3xl border border-white/15 bg-zinc-950 p-6 shadow-2xl">
            <h3 className="font-display text-lg font-bold text-white">Excluir Região</h3>
            <p className="mt-2 text-sm text-zinc-400">
              Tem certeza que deseja apagar esta região do seu mapa? O contorno será excluído permanentemente.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline" size="sm" className="border-white/10 text-zinc-300" onClick={() => setConfirmDeleteId(null)}>
                Cancelar
              </Button>
              <Button size="sm" className="bg-red-600 font-bold text-white hover:bg-red-500" onClick={() => deleteTerritory.mutate(confirmDeleteId)}>
                Excluir
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function whatsappNumber(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.length <= 11 ? `55${digits}` : digits;
}

function TerritoryCard({
  territory,
  active,
  onSelect,
  onFindPlaces,
}: {
  territory: Territory;
  active: boolean;
  onSelect: () => void;
  onFindPlaces: () => void;
}) {
  return (
    <div
      onClick={onSelect}
      className={`group relative flex cursor-pointer items-center justify-between rounded-2xl border p-3 transition-all duration-200 ${
        active
          ? "border-blue-500/80 bg-blue-600/20 shadow-lg shadow-blue-500/10"
          : "border-white/5 bg-white/[0.02] hover:border-white/15 hover:bg-white/[0.05]"
      }`}
    >
      <div className="min-w-0 flex-1 pr-2">
        <div className="flex items-center gap-2">
          <span
            className="h-2.5 w-2.5 rounded-full shrink-0"
            style={{ backgroundColor: STATUS_META[territory.status].color }}
          />
          <span className="font-display text-xs font-bold text-white truncate">
            {territory.name}
          </span>
          {!territory.owned && (
            <span className="rounded bg-white/10 px-1 py-0.2 text-[9px] text-zinc-400">
              compartilhado
            </span>
          )}
        </div>
        <p className="mt-0.5 text-[11px] text-zinc-400 pl-4.5">
          {STATUS_META[territory.status].label}
          {territory.notes ? ` · ${territory.notes}` : ""}
        </p>
      </div>

      <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100">
        <button
          title="Focar no mapa"
          className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/10 hover:text-white"
          onClick={(e) => {
            e.stopPropagation();
            onSelect();
          }}
        >
          <Maximize2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

function ShareDialog({
  target,
  onClose,
}: {
  target: { kind: "folder" | "preset"; id: string; name: string };
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const runShareFolder = useServerFn(shareFolder);
  const runSharePreset = useServerFn(sharePreset);
  const table = target.kind === "folder" ? "folder_shares" : "preset_shares";

  const { data: shares = [] } = useQuery({
    queryKey: ["shares", table, target.id],
    queryFn: async (): Promise<{ id: string; shared_with_email: string }[]> => {
      const query =
        target.kind === "folder"
          ? supabase
              .from("folder_shares")
              .select("id, shared_with_email")
              .eq("folder_id", target.id)
          : supabase
              .from("preset_shares")
              .select("id, shared_with_email")
              .eq("preset_id", target.id);
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["shares", table, target.id] });

  const share = useMutation({
    mutationFn: async () => {
      const payload = { data: { id: target.id, email } };
      if (target.kind === "folder") await runShareFolder(payload);
      else await runSharePreset(payload);
    },
    onSuccess: async () => {
      setEmail("");
      await invalidate();
      toast.success("Compartilhado com sucesso");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao compartilhar"),
  });

  const revoke = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from(table).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: async () => {
      await invalidate();
      toast.success("Acesso removido");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao remover acesso"),
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-3xl border border-white/15 bg-zinc-950 p-6 text-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2 border-b border-white/10 pb-3">
          <div>
            <h2 className="font-display text-base font-bold">
              Compartilhar {target.kind === "folder" ? "Pasta" : "Preset"}
            </h2>
            <p className="text-xs text-zinc-400">{target.name}</p>
          </div>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-zinc-400 hover:text-white" aria-label="Fechar" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="mt-4 space-y-2">
          <Label htmlFor="share-email" className="text-xs text-zinc-400">E-mail do usuário no sistema:</Label>
          <div className="flex gap-2">
            <Input
              id="share-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="colega@email.com"
              className="border-white/10 bg-black/40 text-xs text-white"
            />
            <Button
              size="sm"
              className="bg-blue-600 text-xs font-bold text-white hover:bg-blue-500"
              disabled={share.isPending || !email.trim()}
              onClick={() => share.mutate()}
            >
              <Share2 className="mr-1.5 h-3.5 w-3.5" />
              Compartilhar
            </Button>
          </div>
          <p className="text-[11px] text-zinc-500">
            A pessoa precisa ter uma conta cadastrada. Ela poderá visualizar suas regiões compartilhadas.
          </p>
        </div>

        <div className="mt-4 space-y-2 border-t border-white/10 pt-3">
          <Label className="text-xs text-zinc-400">Pessoas com acesso:</Label>
          {shares.length === 0 ? (
            <p className="text-xs text-zinc-500 italic">Nenhum compartilhamento ativo.</p>
          ) : (
            <ul className="space-y-1.5 max-h-40 overflow-y-auto">
              {shares.map((s) => (
                <li
                  key={s.id}
                  className="flex items-center justify-between gap-2 rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2 text-xs text-zinc-300"
                >
                  <span className="truncate">{s.shared_with_email}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Remover acesso`}
                    className="h-6 w-6 text-zinc-500 hover:text-red-400"
                    onClick={() => revoke.mutate(s.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

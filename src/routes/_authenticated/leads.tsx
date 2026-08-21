import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  Ban,
  CheckCircle2,
  Clock,
  Download,
  Filter,
  Globe,
  Instagram,
  Map,
  MapPin,
  MessageCircle,
  Phone,
  Search,
  Sparkles,
  Star,
  Trash2,
  Users,
  CheckSquare,
  Square,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/leads")({
  validateSearch: (search: Record<string, unknown>): { area: string } => ({
    area: typeof search["area"] === "string" ? search["area"] : "todas",
  }),
  head: () => ({
    meta: [
      { title: "Gestão de Leads — Territórios" },
      {
        name: "description",
        content:
          "Gerencie os comércios encontrados nas regiões mapeadas e dispare mensagens personalizadas pelo WhatsApp.",
      },
      { property: "og:title", content: "Gestão de Leads — Territórios" },
      {
        property: "og:description",
        content:
          "Gerencie os comércios encontrados nas regiões mapeadas e dispare mensagens personalizadas pelo WhatsApp.",
      },
    ],
  }),
  component: LeadsPage,
});

type LeadStatus = "pendente" | "contatado" | "ignorado";

type Lead = {
  id: string;
  name: string;
  address: string;
  city: string;
  area_name: string;
  categories: string[];
  phone: string | null;
  website: string | null;
  instagram: string | null;
  rating: number | null;
  reviews: number | null;
  status: LeadStatus;
  lat: number;
  lng: number;
  place_id: string;
  maps_opened_at: string | null;
};

const STATUS: { key: LeadStatus | "todos"; label: string; countCls?: string }[] = [
  { key: "todos", label: "Todos" },
  { key: "pendente", label: "Pendentes", countCls: "text-amber-400" },
  { key: "contatado", label: "Contatados", countCls: "text-emerald-400" },
  { key: "ignorado", label: "Ignorados", countCls: "text-zinc-400" },
];

const DEFAULT_TEMPLATE =
  "{saudacao}, tudo bem? Vi a {nome} aqui em {cidade} e queria falar rapidinho sobre uma oportunidade para atrair mais clientes na região. Posso te passar os detalhes?";

const TEMPLATE_KEY = "leads:template";
const PAGE_SIZE = 50;

type LeadsPageData = {
  leads: Lead[];
  total: number;
};

function saudacao(): string {
  const h = new Date().getHours();
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

function onlyDigits(phone: string): string {
  const d = phone.replace(/\D/g, "");
  if (d.length <= 11) return `55${d}`;
  return d;
}

function LeadsPage() {
  const queryClient = useQueryClient();
  const { user } = Route.useRouteContext();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<LeadStatus | "todos">("todos");
  const { area: areaParam } = Route.useSearch();
  const [area, setArea] = useState(areaParam || "todas");
  const [sortBy, setSortBy] = useState<"reviews" | "rating" | "name">("reviews");
  const [page, setPage] = useState(0);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [confirmAction, setConfirmAction] = useState<{
    title: string;
    description: string;
    actionLabel?: string;
    run: () => void;
  } | null>(null);

  const [template, setTemplate] = useState(() => {
    if (typeof window === "undefined") return DEFAULT_TEMPLATE;
    return window.localStorage.getItem(TEMPLATE_KEY) ?? DEFAULT_TEMPLATE;
  });

  const { data: leadsPage, isLoading } = useQuery({
    queryKey: ["leads", page],
    queryFn: async (): Promise<LeadsPageData> => {
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      const { data, error, count } = await supabase
        .from("leads")
        .select(
          "id, name, address, city, area_name, categories, phone, website, instagram, rating, reviews, status, lat, lng, place_id, maps_opened_at",
          { count: "exact" },
        )
        .order("created_at", { ascending: false })
        .range(from, to);
      if (error) throw error;
      return { leads: (data ?? []) as Lead[], total: count ?? 0 };
    },
    placeholderData: keepPreviousData,
  });

  const leads = leadsPage?.leads ?? [];
  const totalLeads = leadsPage?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(totalLeads / PAGE_SIZE));

  useEffect(() => {
    setSelectedIds([]);
  }, [page]);

  useEffect(() => {
    if (page >= pageCount) setPage(Math.max(0, pageCount - 1));
  }, [page, pageCount]);

  // Set status mutation with optimistic UI
  const setStatusMutation = useMutation({
    mutationFn: async (input: { id: string; status: LeadStatus }) => {
      const { error } = await supabase
        .from("leads")
        .update({ status: input.status })
        .eq("id", input.id);
      if (error) throw error;
    },
    onMutate: async ({ id, status }) => {
      await queryClient.cancelQueries({ queryKey: ["leads"] });
      const queryKey = ["leads", page] as const;
      const previousLeads = queryClient.getQueryData<LeadsPageData>(queryKey);
      queryClient.setQueryData<LeadsPageData>(queryKey, (old) =>
        old
          ? { ...old, leads: old.leads.map((l) => (l.id === id ? { ...l, status } : l)) }
          : old,
      );
      return { previousLeads, queryKey };
    },
    onError: (err, _vars, context) => {
      if (context?.previousLeads) {
        queryClient.setQueryData(context.queryKey, context.previousLeads);
      }
      toast.error(err instanceof Error ? err.message : "Erro ao atualizar lead");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
    },
  });

  // Batch status mutation
  const batchSetStatusMutation = useMutation({
    mutationFn: async (input: { ids: string[]; status: LeadStatus }) => {
      const { error } = await supabase
        .from("leads")
        .update({ status: input.status })
        .in("id", input.ids);
      if (error) throw error;
    },
    onMutate: async ({ ids, status }) => {
      await queryClient.cancelQueries({ queryKey: ["leads"] });
      const idSet = new Set(ids);
      const queryKey = ["leads", page] as const;
      const previousLeads = queryClient.getQueryData<LeadsPageData>(queryKey);
      queryClient.setQueryData<LeadsPageData>(queryKey, (old) =>
        old
          ? {
              ...old,
              leads: old.leads.map((l) => (idSet.has(l.id) ? { ...l, status } : l)),
            }
          : old,
      );
      return { previousLeads, queryKey };
    },
    onSuccess: () => {
      setSelectedIds([]);
      toast.success("Status dos leads selecionados atualizado!");
    },
    onError: (err, _vars, context) => {
      if (context?.previousLeads) {
        queryClient.setQueryData(context.queryKey, context.previousLeads);
      }
      toast.error(err instanceof Error ? err.message : "Erro ao atualizar status");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
    },
  });

  const markOpened = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("leads")
        .update({ maps_opened_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["leads"] }),
  });

  // Single delete lead with optimistic update
  const deleteLead = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("leads").delete().eq("id", id);
      if (error) throw error;
    },
    onMutate: async (deletedId) => {
      await queryClient.cancelQueries({ queryKey: ["leads"] });
      const queryKey = ["leads", page] as const;
      const previousLeads = queryClient.getQueryData<LeadsPageData>(queryKey);
      queryClient.setQueryData<LeadsPageData>(queryKey, (old) =>
        old
          ? {
              leads: old.leads.filter((lead) => lead.id !== deletedId),
              total: Math.max(0, old.total - 1),
            }
          : old,
      );
      setSelectedIds((prev) => prev.filter((i) => i !== deletedId));
      return { previousLeads, queryKey };
    },
    onSuccess: () => {
      toast.success("Lead excluído com sucesso");
    },
    onError: (e, _id, context) => {
      if (context?.previousLeads) {
        queryClient.setQueryData(context.queryKey, context.previousLeads);
      }
      toast.error(e instanceof Error ? e.message : "Erro ao excluir lead");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
    },
  });

  // Batch delete leads with optimistic update
  const deleteSelectedLeads = useMutation({
    mutationFn: async (ids: string[]) => {
      if (!ids.length) return;
      const { error } = await supabase.from("leads").delete().in("id", ids);
      if (error) throw error;
    },
    onMutate: async (deletedIds) => {
      await queryClient.cancelQueries({ queryKey: ["leads"] });
      const idSet = new Set(deletedIds);
      const queryKey = ["leads", page] as const;
      const previousLeads = queryClient.getQueryData<LeadsPageData>(queryKey);
      queryClient.setQueryData<LeadsPageData>(queryKey, (old) =>
        old
          ? {
              leads: old.leads.filter((lead) => !idSet.has(lead.id)),
              total: Math.max(0, old.total - deletedIds.length),
            }
          : old,
      );
      setSelectedIds([]);
      return { previousLeads, queryKey };
    },
    onSuccess: () => {
      toast.success("Leads excluídos com sucesso");
    },
    onError: (e, _ids, context) => {
      if (context?.previousLeads) {
        queryClient.setQueryData(context.queryKey, context.previousLeads);
      }
      toast.error(e instanceof Error ? e.message : "Erro ao excluir leads");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
    },
  });

  // Delete every lead owned by the signed-in user. This does not depend on the
  // current page, so it also removes records beyond Supabase's 1,000-row limit.
  const clearAllLeads = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("leads").delete().eq("user_id", user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      setSelectedIds([]);
      setPage(0);
      toast.success("Todos os leads foram excluídos com sucesso");
    },
    onError: (e) => {
      const message =
        e && typeof e === "object" && "message" in e && typeof e.message === "string"
          ? e.message
          : "Erro ao limpar a lista de leads";
      toast.error(message);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
    },
  });

  function openMaps(lead: Lead) {
    const url = lead.place_id
      ? `https://www.google.com/maps/search/?api=1&query=${lead.lat},${lead.lng}&query_place_id=${encodeURIComponent(lead.place_id)}`
      : `https://www.google.com/maps/search/?api=1&query=${lead.lat},${lead.lng}`;
    window.open(url, "_blank", "noopener,noreferrer");
    if (!lead.maps_opened_at) markOpened.mutate(lead.id);
  }

  const areas = useMemo(
    () => [...new Set(leads.map((l) => l.area_name).filter(Boolean))].sort(),
    [leads],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const result = leads.filter((l) => {
      if (status !== "todos" && l.status !== status) return false;
      if (area !== "todas" && l.area_name !== area) return false;
      if (!q) return true;
      return [l.name, l.city, l.address, l.area_name, ...(l.categories ?? [])]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });

    return result.sort((a, b) => {
      if (sortBy === "reviews") return (b.reviews ?? 0) - (a.reviews ?? 0);
      if (sortBy === "rating") return (b.rating ?? 0) - (a.rating ?? 0);
      if (sortBy === "name") return a.name.localeCompare(b.name, "pt-BR");
      return 0;
    });
  }, [leads, search, status, area, sortBy]);

  function messageFor(lead: Lead) {
    return template
      .replaceAll("{saudacao}", saudacao())
      .replaceAll("{nome}", lead.name)
      .replaceAll("{cidade}", lead.city || lead.area_name || "sua região")
      .replaceAll("{regiao}", lead.area_name || lead.city || "sua região");
  }

  function sendWhatsapp(lead: Lead) {
    if (!lead.phone) {
      toast.error("Esse comércio não tem telefone cadastrado");
      return;
    }
    const url = `https://wa.me/${onlyDigits(lead.phone)}?text=${encodeURIComponent(messageFor(lead))}`;
    window.open(url, "_blank", "noopener,noreferrer");
    if (lead.status === "pendente") setStatusMutation.mutate({ id: lead.id, status: "contatado" });
  }

  function toggleSelectAll() {
    if (selectedIds.length === filtered.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filtered.map((l) => l.id));
    }
  }

  function toggleSelectOne(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id],
    );
  }

  function exportCSV() {
    if (!filtered.length) {
      toast.info("Nenhum lead para exportar");
      return;
    }
    const headers = ["Nome", "Status", "Telefone", "Cidade", "Região", "Endereço", "Avaliação", "Reviews", "Instagram", "Website"];
    const rows = filtered.map((l) => [
      `"${l.name.replace(/"/g, '""')}"`,
      l.status,
      l.phone || "",
      `"${(l.city || "").replace(/"/g, '""')}"`,
      `"${(l.area_name || "").replace(/"/g, '""')}"`,
      `"${(l.address || "").replace(/"/g, '""')}"`,
      l.rating ?? "",
      l.reviews ?? "",
      l.instagram || "",
      l.website || "",
    ]);
    const csvContent = "data:text/csv;charset=utf-8,\uFEFF" + [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `leads_territorios_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Arquivo CSV exportado com sucesso!");
  }

  const countsByStatus = {
    todos: leads.length,
    pendente: leads.filter((l) => l.status === "pendente").length,
    contatado: leads.filter((l) => l.status === "contatado").length,
    ignorado: leads.filter((l) => l.status === "ignorado").length,
  };

  return (
    <div className="min-h-screen bg-[#030308] text-foreground selection:bg-neon/30 selection:text-white">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-white/10 bg-[#030308]/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <div className="flex items-center gap-3">
            <Button asChild variant="ghost" size="icon" className="text-zinc-400 hover:text-white">
              <Link to="/mapa">
                <ArrowLeft className="h-5 w-5" />
              </Link>
            </Button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-display text-xl font-bold tracking-tight text-white">
                  Leads Comerciais
                </h1>
                <span className="rounded-full bg-blue-500/20 px-2 py-0.5 text-[10px] font-semibold text-blue-300 ring-1 ring-blue-500/30">
                  {totalLeads} no Total
                </span>
              </div>
              <p className="text-xs text-zinc-400">
                {filtered.length} visíveis nesta página · {countsByStatus.contatado} contatados · {countsByStatus.pendente} pendentes
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={exportCSV}
              className="hidden border-white/10 bg-white/5 text-xs text-zinc-300 hover:bg-white/10 sm:inline-flex"
            >
              <Download className="mr-1.5 h-3.5 w-3.5 text-blue-400" />
              Exportar CSV
            </Button>

            <Button
              variant="outline"
              size="sm"
              className="border-red-500/30 bg-red-500/10 text-xs text-red-400 hover:bg-red-500/20"
              disabled={totalLeads === 0 || clearAllLeads.isPending}
              onClick={() =>
                setConfirmAction({
                  title: "Limpar todos os leads",
                  description: `Tem certeza que deseja apagar todos os ${totalLeads} leads cadastrados? Essa ação é permanente.`,
                  actionLabel: "Apagar Tudo",
                  run: () => clearAllLeads.mutate(),
                })
              }
            >
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              Limpar Lista
            </Button>

            <Button asChild size="sm" className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-500/20">
              <Link to="/mapa">
                <MapPin className="mr-1.5 h-4 w-4" />
                Abrir Mapa
              </Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-6xl space-y-6 px-5 py-6 sm:px-8">
        {/* Filters & Control Panel */}
        <section className="space-y-4 rounded-3xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-xl">
          <div className="grid gap-3 sm:grid-cols-3">
            {/* Search */}
            <div className="space-y-1 sm:col-span-1">
              <Label htmlFor="busca" className="text-xs text-zinc-400">
                Buscar por nome, rua ou categoria
              </Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                <Input
                  id="busca"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="ex.: Clínica, Farmácia, Centro..."
                  className="border-white/10 bg-black/40 pl-9 text-sm text-white placeholder:text-zinc-600 focus-visible:ring-blue-500"
                />
              </div>
            </div>

            {/* Region select */}
            <div className="space-y-1">
              <Label htmlFor="regiao" className="text-xs text-zinc-400">
                Filtrar por Região / Bairro
              </Label>
              <select
                id="regiao"
                value={area}
                onChange={(e) => setArea(e.target.value)}
                className="h-10 w-full rounded-md border border-white/10 bg-black/40 px-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="todas">Todas as regiões nesta página ({leads.length})</option>
                {areas.map((a) => (
                  <option key={a} value={a}>
                    {a} ({leads.filter((l) => l.area_name === a).length})
                  </option>
                ))}
              </select>
            </div>

            {/* Sort by */}
            <div className="space-y-1">
              <Label htmlFor="ordenar" className="text-xs text-zinc-400">
                Ordenar lista por
              </Label>
              <select
                id="ordenar"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                className="h-10 w-full rounded-md border border-white/10 bg-black/40 px-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="reviews">Mais avaliações no Google</option>
                <option value="rating">Melhor nota (estrelas)</option>
                <option value="name">Nome (A - Z)</option>
              </select>
            </div>
          </div>

          {/* Status Tabs */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-3">
            <div className="flex flex-wrap gap-2">
              {STATUS.map((s) => (
                <button
                  key={s.key}
                  onClick={() => setStatus(s.key)}
                  className={`flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all ${
                    status === s.key
                      ? "bg-blue-600 text-white shadow-lg shadow-blue-500/25"
                      : "border border-white/10 bg-white/5 text-zinc-400 hover:border-white/20 hover:text-white"
                  }`}
                >
                  <span>{s.label}</span>
                  <span className={`rounded-full bg-black/40 px-1.5 py-0.2 text-[10px] ${s.countCls || "text-zinc-300"}`}>
                    {countsByStatus[s.key]}
                  </span>
                </button>
              ))}
            </div>

            {/* Template accordion trigger / quick preview */}
            <details className="w-full sm:w-auto">
              <summary className="cursor-pointer text-xs font-medium text-blue-400 hover:text-blue-300">
                ⚙️ Personalizar Modelo de Mensagem WhatsApp
              </summary>
              <div className="mt-3 space-y-2 rounded-2xl border border-white/10 bg-black/50 p-4">
                <Label htmlFor="modelo" className="text-xs text-zinc-400">
                  Texto padrão enviado ao abrir a conversa:
                </Label>
                <Textarea
                  id="modelo"
                  value={template}
                  rows={3}
                  className="border-white/10 bg-black/40 text-sm text-white placeholder:text-zinc-600"
                  onChange={(e) => {
                    setTemplate(e.target.value);
                    try {
                      window.localStorage.setItem(TEMPLATE_KEY, e.target.value);
                    } catch {}
                  }}
                />
                <p className="text-[11px] text-zinc-400">
                  Tags dinâmicas: <code className="text-blue-300">{"{saudacao}"}</code>,{" "}
                  <code className="text-blue-300">{"{nome}"}</code>,{" "}
                  <code className="text-blue-300">{"{cidade}"}</code>,{" "}
                  <code className="text-blue-300">{"{regiao}"}</code>
                </p>
              </div>
            </details>
          </div>

          {/* Batch Actions Bar (When items are selected) */}
          {selectedIds.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-blue-500/30 bg-blue-950/40 p-3 text-xs text-blue-200">
              <div className="flex items-center gap-2">
                <span className="font-bold text-white">{selectedIds.length} lead(s) selecionado(s)</span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="border-emerald-500/30 bg-emerald-500/10 text-xs text-emerald-300 hover:bg-emerald-500/20"
                  onClick={() => batchSetStatusMutation.mutate({ ids: selectedIds, status: "contatado" })}
                >
                  <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                  Marcar Contatados
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="border-amber-500/30 bg-amber-500/10 text-xs text-amber-300 hover:bg-amber-500/20"
                  onClick={() => batchSetStatusMutation.mutate({ ids: selectedIds, status: "pendente" })}
                >
                  <Clock className="mr-1 h-3.5 w-3.5" />
                  Marcar Pendentes
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="border-red-500/30 bg-red-500/10 text-xs text-red-300 hover:bg-red-500/20"
                  onClick={() =>
                    setConfirmAction({
                      title: "Excluir selecionados",
                      description: `Excluir definitivamente ${selectedIds.length} lead(s) selecionado(s)?`,
                      actionLabel: "Excluir Selecionados",
                      run: () => deleteSelectedLeads.mutate(selectedIds),
                    })
                  }
                >
                  <Trash2 className="mr-1 h-3.5 w-3.5" />
                  Excluir Selecionados
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-xs text-zinc-400 hover:text-white"
                  onClick={() => setSelectedIds([])}
                >
                  Desmarcar
                </Button>
              </div>
            </div>
          )}
        </section>

        {/* Selection Header */}
        {filtered.length > 0 && (
          <div className="flex items-center justify-between px-2 text-xs text-zinc-400">
            <button
              onClick={toggleSelectAll}
              className="flex items-center gap-2 font-medium text-zinc-300 hover:text-white"
            >
              {selectedIds.length === filtered.length ? (
                <CheckSquare className="h-4 w-4 text-blue-400" />
              ) : (
                <Square className="h-4 w-4" />
              )}
              {selectedIds.length === filtered.length ? "Desmarcar todos" : "Selecionar resultados desta página"}
            </button>
            <span>Mostrando {filtered.length} leads nesta página</span>
          </div>
        )}

        {/* Leads List */}
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
            <p className="mt-4 text-sm text-zinc-400">Carregando comércios...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-12 text-center backdrop-blur-xl">
            <Users className="mx-auto h-12 w-12 text-zinc-600" />
            <h3 className="mt-4 font-display text-lg font-bold text-white">
              Nenhum comércio encontrado
            </h3>
            <p className="mx-auto mt-2 max-w-md text-sm text-zinc-400">
              {search || area !== "todas" || status !== "todos"
                ? "Tente ajustar seus filtros de busca ou selecionar outra região."
                : "Abra o mapa, desenhe uma área ou busque um bairro e clique em 'Procurar comércios nesta área'."}
            </p>
            <div className="mt-6">
              <Button asChild className="bg-blue-600 text-white hover:bg-blue-500">
                <Link to="/mapa">Ir para o Mapa de Territórios</Link>
              </Button>
            </div>
          </div>
        ) : (
          <ul className="space-y-3">
            {filtered.map((lead) => {
              const isSelected = selectedIds.includes(lead.id);
              return (
                <li
                  key={lead.id}
                  className={`group relative rounded-2xl border p-4 backdrop-blur-xl transition-all duration-200 ${
                    isSelected
                      ? "border-blue-500/60 bg-blue-500/10 shadow-lg shadow-blue-500/10"
                      : lead.status === "contatado"
                        ? "border-emerald-500/30 bg-emerald-950/20"
                        : lead.status === "ignorado"
                          ? "border-white/5 bg-white/[0.01] opacity-75"
                          : "border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.05]"
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      {/* Checkbox */}
                      <button
                        onClick={() => toggleSelectOne(lead.id)}
                        className="mt-0.5 shrink-0 text-zinc-400 hover:text-white"
                        aria-label="Selecionar lead"
                      >
                        {isSelected ? (
                          <CheckSquare className="h-4 w-4 text-blue-400" />
                        ) : (
                          <Square className="h-4 w-4" />
                        )}
                      </button>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h2 className="font-display text-base font-bold text-white truncate">
                            {lead.name}
                          </h2>
                          {lead.status === "contatado" && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-400 ring-1 ring-emerald-500/30">
                              <CheckCircle2 className="h-3 w-3" /> Contatado
                            </span>
                          )}
                          {lead.status === "pendente" && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-400 ring-1 ring-amber-500/30">
                              <Clock className="h-3 w-3" /> Pendente
                            </span>
                          )}
                          {lead.status === "ignorado" && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-zinc-500/10 px-2 py-0.5 text-[10px] font-semibold text-zinc-400 ring-1 ring-zinc-500/30">
                              <Ban className="h-3 w-3" /> Ignorado
                            </span>
                          )}
                        </div>

                        <p className="mt-1 flex items-center gap-1.5 text-xs text-zinc-400">
                          <MapPin className="h-3.5 w-3.5 text-blue-400 shrink-0" />
                          <span className="truncate">
                            {[lead.city, lead.area_name].filter(Boolean).join(" · ")} {lead.address ? `— ${lead.address}` : ""}
                          </span>
                        </p>
                      </div>
                    </div>

                    {/* Google rating badge */}
                    {lead.rating !== null && (
                      <span className="flex items-center gap-1 rounded-lg bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-400 ring-1 ring-amber-500/20">
                        <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                        {lead.rating.toFixed(1)} <span className="opacity-70 font-normal">({lead.reviews ?? 0})</span>
                      </span>
                    )}
                  </div>

                  {/* Categories */}
                  {lead.categories?.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5 pl-7">
                      {lead.categories.slice(0, 4).map((c) => (
                        <span
                          key={c}
                          className="rounded-md border border-white/5 bg-white/5 px-2 py-0.5 text-[10px] font-medium text-zinc-300"
                        >
                          {c}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Contact Info & Actions */}
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-white/5 pt-3 pl-7">
                    <div className="flex flex-wrap items-center gap-4 text-xs text-zinc-400">
                      <span className="flex items-center gap-1">
                        <Phone className="h-3.5 w-3.5 text-zinc-500" />
                        <span className={lead.phone ? "text-zinc-200" : "text-zinc-500 italic"}>
                          {lead.phone ?? "Sem telefone"}
                        </span>
                      </span>

                      {lead.website && (
                        <a
                          href={lead.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-blue-400 hover:text-blue-300 hover:underline"
                        >
                          <Globe className="h-3.5 w-3.5" />
                          Website
                        </a>
                      )}

                      {lead.instagram && (
                        <a
                          href={lead.instagram}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-pink-400 hover:text-pink-300 hover:underline"
                        >
                          <Instagram className="h-3.5 w-3.5" />
                          Instagram
                        </a>
                      )}
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        className="bg-emerald-600 text-white shadow-md shadow-emerald-600/20 hover:bg-emerald-500"
                        onClick={() => sendWhatsapp(lead)}
                      >
                        <MessageCircle className="mr-1.5 h-4 w-4" />
                        WhatsApp
                      </Button>

                      <Button
                        variant="outline"
                        size="sm"
                        className="border-white/10 bg-white/5 text-xs text-zinc-300 hover:bg-white/10"
                        onClick={() => openMaps(lead)}
                      >
                        <Map className="mr-1.5 h-3.5 w-3.5" />
                        {lead.maps_opened_at ? "Maps ✓" : "Maps"}
                      </Button>

                      {/* Status quick toggle */}
                      <div className="flex items-center rounded-lg border border-white/10 bg-black/40 p-0.5">
                        <button
                          title="Marcar como Contatado"
                          onClick={() => setStatusMutation.mutate({ id: lead.id, status: "contatado" })}
                          className={`rounded p-1.5 transition ${
                            lead.status === "contatado" ? "bg-emerald-500 text-black font-bold" : "text-zinc-400 hover:text-white"
                          }`}
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          title="Marcar como Pendente"
                          onClick={() => setStatusMutation.mutate({ id: lead.id, status: "pendente" })}
                          className={`rounded p-1.5 transition ${
                            lead.status === "pendente" ? "bg-amber-500 text-black font-bold" : "text-zinc-400 hover:text-white"
                          }`}
                        >
                          <Clock className="h-3.5 w-3.5" />
                        </button>
                        <button
                          title="Marcar como Ignorado"
                          onClick={() => setStatusMutation.mutate({ id: lead.id, status: "ignorado" })}
                          className={`rounded p-1.5 transition ${
                            lead.status === "ignorado" ? "bg-zinc-600 text-white font-bold" : "text-zinc-400 hover:text-white"
                          }`}
                        >
                          <Ban className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      {/* Delete button */}
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Excluir lead"
                        className="h-8 w-8 text-zinc-500 hover:bg-red-500/20 hover:text-red-400"
                        onClick={() =>
                          setConfirmAction({
                            title: "Excluir lead",
                            description: `Excluir o comércio "${lead.name}"? Essa ação não pode ser desfeita.`,
                            actionLabel: "Excluir",
                            run: () => deleteLead.mutate(lead.id),
                          })
                        }
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {totalLeads > PAGE_SIZE && (
          <nav
            className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3"
            aria-label="Paginação dos leads"
          >
            <Button
              variant="outline"
              size="sm"
              disabled={page === 0 || isLoading}
              onClick={() => setPage((current) => Math.max(0, current - 1))}
              className="border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10"
            >
              <ChevronLeft className="mr-1 h-4 w-4" />
              Anterior
            </Button>
            <span className="text-xs text-zinc-400">
              Página <strong className="text-white">{page + 1}</strong> de {pageCount} · {totalLeads} leads
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page + 1 >= pageCount || isLoading}
              onClick={() => setPage((current) => Math.min(pageCount - 1, current + 1))}
              className="border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10"
            >
              Próxima
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </nav>
        )}
      </main>

      {/* Confirmation Modal */}
      {confirmAction && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          onClick={() => setConfirmAction(null)}
        >
          <div
            className="w-full max-w-sm rounded-3xl border border-white/15 bg-zinc-950 p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="font-display text-lg font-bold text-white">{confirmAction.title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-zinc-400">{confirmAction.description}</p>
            <div className="mt-6 flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                className="border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10"
                onClick={() => setConfirmAction(null)}
              >
                Cancelar
              </Button>
              <Button
                size="sm"
                className="bg-red-600 text-white hover:bg-red-500 font-semibold"
                onClick={() => {
                  confirmAction.run();
                  setConfirmAction(null);
                }}
              >
                {confirmAction.actionLabel || "Confirmar"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

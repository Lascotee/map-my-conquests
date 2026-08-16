import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  Ban,
  CheckCircle2,
  Clock,
  Globe,
  Instagram,
  Map,
  MapPin,
  MessageCircle,
  Phone,
  Star,
  Trash2,
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
      { title: "Leads WhatsApp — comércios mapeados" },
      {
        name: "description",
        content: "Gerencie os comércios encontrados nas regiões marcadas e dispare mensagens no WhatsApp.",
      },
      { property: "og:title", content: "Leads WhatsApp — comércios mapeados" },
      {
        property: "og:description",
        content: "Gerencie os comércios encontrados nas regiões marcadas e dispare mensagens no WhatsApp.",
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

const STATUS: { key: LeadStatus | "todos"; label: string }[] = [
  { key: "todos", label: "Todos" },
  { key: "pendente", label: "Pendentes" },
  { key: "contatado", label: "Contatados" },
  { key: "ignorado", label: "Ignorados" },
];

const DEFAULT_TEMPLATE =
  "{saudacao}, tudo bem? Vi a {nome} aqui em {cidade} e queria falar rapidinho sobre uma ideia para atrair mais pacientes. Posso te mandar os detalhes?";

const TEMPLATE_KEY = "leads:template";

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
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<LeadStatus | "todos">("todos");
  const { area: areaParam } = Route.useSearch();
  const [area, setArea] = useState(areaParam || "todas");
  const [confirmAction, setConfirmAction] = useState<
    { title: string; description: string; run: () => void } | null
  >(null);
  const [template, setTemplate] = useState(() => {
    if (typeof window === "undefined") return DEFAULT_TEMPLATE;
    return window.localStorage.getItem(TEMPLATE_KEY) ?? DEFAULT_TEMPLATE;
  });

  const { data: leads = [], isLoading } = useQuery({
    queryKey: ["leads"],
    queryFn: async (): Promise<Lead[]> => {
      const { data, error } = await supabase
        .from("leads")
        .select(
          "id, name, address, city, area_name, categories, phone, website, instagram, rating, reviews, status, lat, lng, place_id, maps_opened_at",
        )
        .order("reviews", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Lead[];
    },
  });

  const setStatusMutation = useMutation({
    mutationFn: async (input: { id: string; status: LeadStatus }) => {
      const { error } = await supabase
        .from("leads")
        .update({ status: input.status })
        .eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["leads"] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao atualizar lead"),
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

  const deleteLead = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("leads").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["leads"] });
      toast.success("Lead excluído");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao excluir lead"),
  });

  const clearLeads = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase.from("leads").delete().in("id", ids);
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["leads"] });
      toast.success("Lista limpa");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao limpar lista"),
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
    return leads.filter((l) => {
      if (status !== "todos" && l.status !== status) return false;
      if (area !== "todas" && l.area_name !== area) return false;
      if (!q) return true;
      return [l.name, l.city, l.address, l.area_name, ...(l.categories ?? [])]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [leads, search, status, area]);

  function messageFor(lead: Lead) {
    return template
      .replaceAll("{saudacao}", saudacao())
      .replaceAll("{nome}", lead.name)
      .replaceAll("{cidade}", lead.city || lead.area_name)
      .replaceAll("{regiao}", lead.area_name);
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

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-5 py-4">
          <div>
            <h1 className="font-display text-xl font-bold">Leads WhatsApp</h1>
            <p className="text-xs text-muted-foreground">
              {filtered.length} de {leads.length} comércios mapeados
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="text-destructive hover:text-destructive"
              disabled={filtered.length === 0 || clearLeads.isPending}
              onClick={() =>
                setConfirmAction({
                  title: "Limpar lista",
                  description: `Tem certeza que quer excluir ${filtered.length} lead(s) da lista atual?`,
                  run: () => clearLeads.mutate(filtered.map((l) => l.id)),
                })
              }
            >
              <Trash2 className="mr-1.5 h-4 w-4" />
              Limpar lista
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link to="/mapa">
                <ArrowLeft className="mr-1.5 h-4 w-4" />
                Mapa
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-5 px-5 py-6">
        <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="busca">Buscar</Label>
              <Input
                id="busca"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Nome, cidade, categoria…"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="regiao">Região</Label>
              <select
                id="regiao"
                value={area}
                onChange={(e) => setArea(e.target.value)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="todas">Todas as regiões</option>
                {areas.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {STATUS.map((s) => (
              <button
                key={s.key}
                onClick={() => setStatus(s.key)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                  status === s.key
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="modelo">Modelo de mensagem</Label>
            <Textarea
              id="modelo"
              value={template}
              rows={3}
              onChange={(e) => {
                setTemplate(e.target.value);
                try {
                  window.localStorage.setItem(TEMPLATE_KEY, e.target.value);
                } catch {
                  /* ignore */
                }
              }}
            />
            <p className="text-[11px] text-muted-foreground">
              Variáveis: {"{saudacao}"}, {"{nome}"}, {"{cidade}"}, {"{regiao}"}
            </p>
          </div>
        </section>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando leads…</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhum lead por aqui. Volte ao mapa, marque uma região e procure comércios.
          </p>
        ) : (
          <ul className="space-y-3">
            {filtered.map((lead) => (
              <li
                key={lead.id}
                className={`rounded-2xl border bg-card p-4 ${
                  lead.status === "contatado"
                    ? "border-primary/60 bg-primary/5"
                    : lead.status === "ignorado"
                      ? "border-border opacity-70"
                      : "border-border"
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className="flex items-center gap-1.5 truncate font-semibold">
                      {lead.name}
                      {lead.status === "contatado" && (
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" aria-label="Contatado" />
                      )}
                      {lead.status === "ignorado" && (
                        <Ban className="h-4 w-4 shrink-0 text-muted-foreground" aria-label="Ignorado" />
                      )}
                      {lead.status === "pendente" && (
                        <Clock className="h-4 w-4 shrink-0 text-muted-foreground" aria-label="Pendente" />
                      )}
                    </h2>
                    <p className="flex items-center gap-1 text-xs text-muted-foreground">
                      <MapPin className="h-3 w-3" />
                      {[lead.city, lead.area_name].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  {lead.rating !== null && (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Star className="h-3 w-3" />
                      {lead.rating.toFixed(1)} · {lead.reviews ?? 0}
                    </span>
                  )}
                </div>

                <p className="mt-2 text-xs text-muted-foreground">{lead.address}</p>

                <div className="mt-3 flex flex-wrap gap-3 text-xs">
                  <span className="flex items-center gap-1">
                    <Phone className="h-3.5 w-3.5" />
                    {lead.phone ?? "sem telefone"}
                  </span>
                  {lead.website && (
                    <a
                      href={lead.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-primary underline-offset-2 hover:underline"
                    >
                      <Globe className="h-3.5 w-3.5" />
                      Site
                    </a>
                  )}
                  {lead.instagram && (
                    <a
                      href={lead.instagram}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-primary underline-offset-2 hover:underline"
                    >
                      <Instagram className="h-3.5 w-3.5" />
                      Instagram
                    </a>
                  )}
                </div>

                {lead.categories?.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {lead.categories.slice(0, 4).map((c) => (
                      <span key={c} className="rounded-full bg-muted px-2 py-0.5 text-[11px]">
                        {c}
                      </span>
                    ))}
                  </div>
                )}

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <Button className="flex-1 min-w-44" onClick={() => sendWhatsapp(lead)}>
                    <MessageCircle className="mr-2 h-4 w-4" />
                    Enviar no WhatsApp
                  </Button>
                  <Button variant="outline" onClick={() => openMaps(lead)}>
                    <Map className="mr-2 h-4 w-4" />
                    {lead.maps_opened_at ? "Visto no Maps" : "Abrir no Maps"}
                  </Button>

                  <div className="flex items-center gap-1">
                    {(
                      [
                        { key: "contatado", Icon: CheckCircle2, label: "Contatado" },
                        { key: "pendente", Icon: Clock, label: "Pendente" },
                        { key: "ignorado", Icon: Ban, label: "Ignorado" },
                      ] as { key: LeadStatus; Icon: typeof Clock; label: string }[]
                    ).map(({ key, Icon, label }) => (
                      <button
                        key={key}
                        aria-label={label}
                        title={label}
                        onClick={() => setStatusMutation.mutate({ id: lead.id, status: key })}
                        className={`flex h-10 w-10 items-center justify-center rounded-full border transition ${
                          lead.status === key
                            ? "border-transparent bg-primary text-primary-foreground"
                            : "border-input bg-background text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        <Icon className="h-4 w-4" />
                      </button>
                    ))}
                  </div>

                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Excluir lead"
                    className="text-destructive hover:text-destructive"
                    onClick={() =>
                      setConfirmAction({
                        title: "Excluir lead",
                        description: `Excluir o lead "${lead.name}"? Essa ação não pode ser desfeita.`,
                        run: () => deleteLead.mutate(lead.id),
                      })
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>

      {confirmAction && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setConfirmAction(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-border bg-card p-5 text-card-foreground shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="font-display text-base font-bold">{confirmAction.title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{confirmAction.description}</p>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setConfirmAction(null)}>
                Cancelar
              </Button>
              <Button
                size="sm"
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => {
                  confirmAction.run();
                  setConfirmAction(null);
                }}
              >
                Excluir
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

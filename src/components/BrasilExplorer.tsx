import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { ClientOnly } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Info, MapPin, Search, X } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DATA_SOURCE,
  LEVEL_META,
  bboxOf,
  featureToPath,
  loadGeometry,
  loadIndex,
  normalize,
  type BBox,
  type BairroIndex,
  type DistritoIndex,
  type GeoFeature,
  type Level,
  type MunicipioIndex,
  type RegiaoIndex,
  type SubdistritoIndex,
  type UfIndex,
} from "@/lib/geodata";

const BrasilMap = lazy(() => import("@/components/BrasilMap"));

const DETAIL_LEVELS: Level[] = ["municipios", "distritos", "subdistritos", "bairros"];
const BOA_ESPERANCA = "5101837";

type Selection = { level: Level; code: string; name: string } | null;



export default function BrasilExplorer({ onBack }: { onBack: () => void }) {
  const queryClient = useQueryClient();

  const [regionCode, setRegionCode] = useState("");
  const [ufCode, setUfCode] = useState("");
  const [munCode, setMunCode] = useState("");
  const [distCode, setDistCode] = useState("");
  const [subdistCode, setSubdistCode] = useState("");
  const [bairroCode, setBairroCode] = useState("");
  const [detailLevel, setDetailLevel] = useState<Level>("municipios");
  const [selection, setSelection] = useState<Selection>(null);
  const [hovered, setHovered] = useState<{ code: string; name: string } | null>(null);
  const [fitBBox, setFitBBox] = useState<BBox | null>(null);
  const [search, setSearch] = useState("");

  /* ---------- índices ---------- */
  const regioes = useQuery({ queryKey: ["idx", "regioes"], queryFn: () => loadIndex<RegiaoIndex>("regioes") });
  const ufs = useQuery({ queryKey: ["idx", "ufs"], queryFn: () => loadIndex<UfIndex>("ufs") });
  const municipios = useQuery({
    queryKey: ["idx", "municipios"],
    queryFn: () => loadIndex<MunicipioIndex>("municipios"),
  });
  const distritos = useQuery({
    queryKey: ["idx", "distritos"],
    queryFn: () => loadIndex<DistritoIndex>("distritos"),
    enabled: Boolean(munCode),
  });
  const subdistritos = useQuery({
    queryKey: ["idx", "subdistritos"],
    queryFn: () => loadIndex<SubdistritoIndex>("subdistritos"),
    enabled: Boolean(munCode),
  });
  const bairros = useQuery({
    queryKey: ["idx", "bairros"],
    queryFn: () => loadIndex<BairroIndex>("bairros"),
    enabled: Boolean(munCode),
  });

  const ufList = useMemo(
    () => (ufs.data ?? []).filter((u) => !regionCode || u.region_code === regionCode),
    [ufs.data, regionCode],
  );
  const munList = useMemo(
    () => (municipios.data ?? []).filter((m) => m.uf_code === ufCode),
    [municipios.data, ufCode],
  );
  const munInfo = useMemo(
    () => (municipios.data ?? []).find((m) => m.code === munCode) ?? null,
    [municipios.data, munCode],
  );
  const distList = useMemo(
    () => (distritos.data ?? []).filter((d) => d.municipality_code === munCode),
    [distritos.data, munCode],
  );
  const subdistList = useMemo(
    () =>
      (subdistritos.data ?? []).filter(
        (s) => s.municipality_code === munCode && s.is_named && (!distCode || s.district_code === distCode),
      ),
    [subdistritos.data, munCode, distCode],
  );
  const bairroList = useMemo(
    () =>
      (bairros.data ?? []).filter(
        (b) =>
          b.municipality_code === munCode &&
          (!distCode || b.district_code === distCode) &&
          (!subdistCode || b.subdistrict_code === subdistCode),
      ),
    [bairros.data, munCode, distCode, subdistCode],
  );

  /* ---------- nível ativo no mapa ---------- */
  const activeLevel: Level = munCode ? detailLevel : ufCode ? "municipios" : regionCode ? "ufs" : "ufs";
  const meta = LEVEL_META[activeLevel];

  const bairrosUnavailable =
    activeLevel === "bairros" && munInfo?.neighborhood_coverage !== "available_ibge_2022";

  const geometry = useQuery({
    queryKey: ["geo", activeLevel, ufCode],
    queryFn: () => loadGeometry(activeLevel, ufCode || undefined),
    enabled: (!meta.perUf || Boolean(ufCode)) && !bairrosUnavailable,
  });


  const features = useMemo<GeoFeature[]>(() => {
    const all = geometry.data?.features ?? [];
    return all.filter((f) => {
      const p = f.properties;
      if (activeLevel === "ufs") return !regionCode || p["CD_REGIAO"] === regionCode;
      if (activeLevel === "municipios") return !munCode || p["CD_MUN"] === munCode;
      if (p["CD_MUN"] !== munCode) return false;
      if (distCode && p["CD_DIST"] !== distCode) return false;
      if (subdistCode && activeLevel !== "distritos" && p["CD_SUBDIST"] !== subdistCode) return false;
      return true;
    });
  }, [geometry.data, activeLevel, regionCode, munCode, distCode, subdistCode]);

  const data = useMemo(
    () => ({ type: "FeatureCollection" as const, features }),
    [features],
  );

  /* ---------- zoom automático ---------- */
  useEffect(() => {
    if (!selection) return;
    const f = features.find((x) => x.properties[LEVEL_META[selection.level].codeProp] === selection.code);
    const box = f ? bboxOf([f]) : null;
    if (box) setFitBBox(box);
  }, [selection, features]);

  useEffect(() => {
    if (selection) return;
    const box = bboxOf(features);
    if (box) setFitBBox(box);
  }, [features, selection]);

  function select(level: Level, code: string, name: string) {
    setSelection(code ? { level, code, name } : null);
  }

  function onMapSelect(code: string, name: string) {
    if (activeLevel === "ufs") {
      setUfCode(code);
      setRegionCode((ufs.data ?? []).find((u) => u.code === code)?.region_code ?? regionCode);
      setMunCode("");
      setDetailLevel("municipios");
    } else if (activeLevel === "municipios" && !munCode) {
      setMunCode(code);
      setDistCode("");
      setSubdistCode("");
      setBairroCode("");
    }
    if (activeLevel === "distritos") setDistCode(code);
    if (activeLevel === "subdistritos") setSubdistCode(code);
    if (activeLevel === "bairros") setBairroCode(code);
    select(activeLevel, code, name);
  }

  function resetAll() {
    setRegionCode("");
    setUfCode("");
    setMunCode("");
    setDistCode("");
    setSubdistCode("");
    setBairroCode("");
    setDetailLevel("municipios");
    setSelection(null);
    setFitBBox([-73.99, -33.75, -29.3, 5.27]);
  }

  /* ---------- pesquisa por nome, seleção por código ---------- */
  const searchHits = useMemo(() => {
    const q = normalize(search);
    if (q.length < 3) return [];
    const hits: { level: Level; code: string; name: string; detail: string }[] = [];
    for (const m of municipios.data ?? []) {
      if (normalize(m.name).includes(q)) {
        hits.push({ level: "municipios", code: m.code, name: m.name, detail: `${m.uf_abbr} · ${m.code}` });
      }
      if (hits.length >= 40) break;
    }
    if (munCode) {
      for (const b of bairroList) {
        if (normalize(b.name).includes(q)) {
          hits.push({ level: "bairros", code: b.code, name: b.name, detail: `Bairro · ${b.code}` });
        }
        if (hits.length >= 60) break;
      }
    }
    return hits.slice(0, 25);
  }, [search, municipios.data, bairroList, munCode]);

  function goToHit(hit: { level: Level; code: string; name: string }) {
    if (hit.level === "municipios") {
      const m = (municipios.data ?? []).find((x) => x.code === hit.code);
      if (!m) return;
      setRegionCode((ufs.data ?? []).find((u) => u.code === m.uf_code)?.region_code ?? "");
      setUfCode(m.uf_code);
      setMunCode(m.code);
      setDistCode("");
      setSubdistCode("");
      setBairroCode("");
      setDetailLevel("municipios");
      select("municipios", m.code, m.name);
    } else {
      setBairroCode(hit.code);
      setDetailLevel("bairros");
      select("bairros", hit.code, hit.name);
    }
    setSearch("");
  }

  /* ---------- marcar área ---------- */
  async function markSelectedArea() {
    if (!selection) return;
    const f = features.find((x) => x.properties[LEVEL_META[selection.level].codeProp] === selection.code);
    if (!f) return;
    const path = featureToPath(f);
    if (path.length < 3) {
      toast.error("Geometria indisponível para esta área");
      return;
    }
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return;
    const { error } = await supabase.from("territories").insert({
      name: `${selection.name} (${LEVEL_META[selection.level].label})`,
      path: path as never,
      user_id: auth.user.id,
    });
    if (error) {
      toast.error("Não foi possível marcar a área");
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["territories"] });
    toast.success("Área marcada nos seus territórios");
    onBack();
  }

  /* ---------- avisos de cobertura ---------- */
  const coverageMessage = (() => {
    if (!munCode || !munInfo) return null;
    if (detailLevel === "bairros" && munInfo.neighborhood_coverage === "not_available_ibge_2022") {
      return "Não há bairros delimitados para este município na camada IBGE 2022.";
    }
    if (detailLevel === "subdistritos" && munInfo.named_subdistrict_count === 0) {
      return "Este município não possui subdistritos nomeados (as áreas existem, mas sem nome no IBGE 2022).";
    }
    if (munCode === BOA_ESPERANCA && detailLevel !== "municipios") {
      return "Boa Esperança do Norte existe na malha municipal de 2025, mas ainda não possui divisões internas nas camadas de 2022.";
    }
    if (!geometry.isLoading && features.length === 0) {
      return "Sem cobertura desta camada para o recorte selecionado.";
    }
    return null;
  })();

  const breadcrumb = [
    regionCode && (regioes.data ?? []).find((r) => r.code === regionCode)?.name,
    ufCode && (ufs.data ?? []).find((u) => u.code === ufCode)?.name,
    munCode && munInfo?.name,
    distCode && distList.find((d) => d.code === distCode)?.name,
    subdistCode && subdistList.find((s) => s.code === subdistCode)?.name,
    bairroCode && bairroList.find((b) => b.code === bairroCode)?.name,
  ].filter(Boolean) as string[];

  return (
    <div className="flex h-screen flex-col bg-background lg:flex-row">
      <aside className="flex w-full shrink-0 flex-col overflow-y-auto border-b border-sidebar-border bg-sidebar text-sidebar-foreground lg:h-full lg:w-96 lg:border-b-0 lg:border-r">
        <div className="flex items-center justify-between px-5 py-4">
          <span className="font-display text-base font-bold">Mapa do Brasil</span>
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Territórios
          </Button>
        </div>

        <div className="space-y-3 border-t border-sidebar-border px-5 py-4">
          <div className="space-y-1.5">
            <Label htmlFor="busca-geo" className="text-[11px] uppercase tracking-wide opacity-70">
              Pesquisar por nome
            </Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 opacity-60" />
              <Input
                id="busca-geo"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Município ou bairro"
                className="border-sidebar-border bg-sidebar-accent pl-9 text-sidebar-foreground placeholder:opacity-60"
              />
            </div>
            {searchHits.length > 0 && (
              <ul className="max-h-48 space-y-1 overflow-y-auto">
                {searchHits.map((h) => (
                  <li key={`${h.level}-${h.code}`}>
                    <button
                      onClick={() => goToHit(h)}
                      className="w-full rounded-lg bg-sidebar-accent px-3 py-2 text-left text-sm"
                    >
                      <span className="block truncate">{h.name}</span>
                      <span className="block text-[11px] opacity-70">{h.detail}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <Selector
            label="Região"
            value={regionCode}
            onChange={(v) => {
              setRegionCode(v);
              setUfCode("");
              setMunCode("");
              setDistCode("");
              setSubdistCode("");
              setBairroCode("");
              setSelection(null);
            }}
            options={(regioes.data ?? []).map((r) => ({ value: r.code, label: r.name }))}
            placeholder="Todas as regiões"
          />
          <Selector
            label="Estado"
            value={ufCode}
            onChange={(v) => {
              setUfCode(v);
              setMunCode("");
              setDistCode("");
              setSubdistCode("");
              setBairroCode("");
              setDetailLevel("municipios");
              select("ufs", v, ufList.find((u) => u.code === v)?.name ?? "");
            }}
            options={ufList.map((u) => ({ value: u.code, label: `${u.name} (${u.abbr})` }))}
            placeholder="Selecione o estado"
          />
          <Selector
            label="Município"
            value={munCode}
            disabled={!ufCode}
            onChange={(v) => {
              setMunCode(v);
              setDistCode("");
              setSubdistCode("");
              setBairroCode("");
              setDetailLevel("municipios");
              select("municipios", v, munList.find((m) => m.code === v)?.name ?? "");
            }}
            options={munList.map((m) => ({ value: m.code, label: `${m.name} — ${m.code}` }))}
            placeholder={ufCode ? "Selecione o município" : "Escolha o estado antes"}
          />

          {munCode && (
            <>
              <div className="space-y-1.5">
                <Label className="text-[11px] uppercase tracking-wide opacity-70">Camada exibida</Label>
                <div className="grid grid-cols-4 gap-1">
                  {DETAIL_LEVELS.map((l) => (
                    <button
                      key={l}
                      onClick={() => {
                        setDetailLevel(l);
                        setSelection(null);
                      }}
                      className={`rounded-lg px-1 py-1.5 text-[11px] font-medium ${
                        detailLevel === l
                          ? "bg-sidebar-primary text-sidebar-primary-foreground"
                          : "bg-sidebar-accent"
                      }`}
                    >
                      {l === "municipios" ? "Município" : LEVEL_META[l].label}
                    </button>
                  ))}
                </div>
              </div>

              <Selector
                label="Distrito"
                value={distCode}
                onChange={(v) => {
                  setDistCode(v);
                  setSubdistCode("");
                  setBairroCode("");
                  if (v) {
                    setDetailLevel("distritos");
                    select("distritos", v, distList.find((d) => d.code === v)?.name ?? "");
                  }
                }}
                options={distList.map((d) => ({ value: d.code, label: `${d.name} — ${d.code}` }))}
                placeholder={distList.length ? "Todos os distritos" : "Sem distritos nesta camada"}
                disabled={distList.length === 0}
              />
              <Selector
                label="Subdistrito"
                value={subdistCode}
                onChange={(v) => {
                  setSubdistCode(v);
                  setBairroCode("");
                  if (v) {
                    setDetailLevel("subdistritos");
                    select("subdistritos", v, subdistList.find((s) => s.code === v)?.name ?? "");
                  }
                }}
                options={subdistList.map((s) => ({ value: s.code, label: `${s.name} — ${s.code}` }))}
                placeholder={
                  subdistList.length ? "Todos os subdistritos" : "Sem subdistritos nomeados"
                }
                disabled={subdistList.length === 0}
              />
              <Selector
                label="Bairro"
                value={bairroCode}
                onChange={(v) => {
                  setBairroCode(v);
                  if (v) {
                    setDetailLevel("bairros");
                    select("bairros", v, bairroList.find((b) => b.code === v)?.name ?? "");
                  }
                }}
                options={bairroList.map((b) => ({ value: b.code, label: `${b.name} — ${b.code}` }))}
                placeholder={
                  munInfo?.neighborhood_coverage === "available_ibge_2022"
                    ? "Todos os bairros"
                    : "Sem bairros no IBGE 2022"
                }
                disabled={bairroList.length === 0}
              />
            </>
          )}

          <Button variant="outline" className="w-full" onClick={resetAll}>
            <X className="mr-2 h-4 w-4" />
            Limpar seleção
          </Button>
        </div>

        <div className="space-y-3 border-t border-sidebar-border px-5 py-4 text-xs">
          <p className="text-[11px] font-semibold uppercase tracking-wide opacity-70">Legenda</p>
          <div className="space-y-1.5">
            <LegendItem color="#7c3aed" label="Áreas da camada atual" />
            <LegendItem color="#e0a03d" label="Sob o cursor" />
            <LegendItem color="#1f9d6d" label="Selecionada" />
          </div>
          <p className="opacity-70">
            Fonte: {DATA_SOURCE}. Municípios e regiões: 2025. Distritos, subdistritos e bairros: 2022.
          </p>
        </div>
      </aside>

      <div className="relative min-h-[55vh] flex-1">
        <ClientOnly fallback={<div className="h-full w-full animate-pulse bg-muted" />}>
          <Suspense fallback={<div className="h-full w-full animate-pulse bg-muted" />}>
            <BrasilMap
              data={data}
              codeProp={meta.codeProp}
              nameProp={meta.nameProp}
              selectedCode={selection?.code ?? null}
              fitBBox={fitBBox}
              onSelect={onMapSelect}
              onHover={setHovered}
            />
          </Suspense>
        </ClientOnly>

        {breadcrumb.length > 0 && (
          <div className="absolute left-4 top-4 flex max-w-[calc(100%-2rem)] flex-wrap items-center gap-1.5 rounded-xl border border-border bg-card/95 px-3 py-2 text-xs shadow-sm">
            <button className="underline-offset-2 hover:underline" onClick={resetAll}>
              Brasil
            </button>
            {breadcrumb.map((b) => (
              <span key={b} className="flex items-center gap-1.5">
                <span className="opacity-40">/</span>
                <span className="font-medium">{b}</span>
              </span>
            ))}
          </div>
        )}

        {(geometry.isLoading || geometry.isFetching) && (
          <div className="absolute left-1/2 top-4 -translate-x-1/2 rounded-full border border-border bg-card px-4 py-1.5 text-xs shadow-sm">
            Carregando camada de {LEVEL_META[activeLevel].label.toLowerCase()}…
          </div>
        )}

        {geometry.isError && (
          <div className="absolute left-1/2 top-4 -translate-x-1/2 rounded-full border border-destructive/40 bg-card px-4 py-1.5 text-xs text-destructive shadow-sm">
            Não foi possível carregar esta camada.
          </div>
        )}

        {coverageMessage && (
          <div className="absolute bottom-4 left-4 flex max-w-[min(28rem,calc(100%-2rem))] items-start gap-2 rounded-xl border border-border bg-card px-3 py-2 text-xs shadow-sm">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-70" />
            <span>{coverageMessage}</span>
          </div>
        )}

        {hovered && !selection && (
          <div className="absolute bottom-4 right-4 rounded-xl border border-border bg-card px-3 py-2 text-xs shadow-sm">
            {hovered.name || "(sem nome)"} · {hovered.code}
          </div>
        )}

        {selection && (
          <div className="absolute right-4 top-4 w-[min(20rem,calc(100%-2rem))] rounded-2xl border border-border bg-card p-4 shadow-lg">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-semibold">{selection.name || "(sem nome)"}</p>
                <p className="text-xs text-muted-foreground">
                  {LEVEL_META[selection.level].label}
                </p>
              </div>
              <Button variant="ghost" size="icon" aria-label="Fechar" onClick={() => setSelection(null)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <dl className="mt-3 space-y-1.5 text-xs">
              <Row label="Código" value={selection.code} />
              <Row label="Nível" value={LEVEL_META[selection.level].label} />
              <Row label="Fonte" value={DATA_SOURCE} />
              <Row label="Ano" value={String(LEVEL_META[selection.level].sourceYear)} />
              {selection.level === "municipios" && munInfo && (
                <Row
                  label="Bairros"
                  value={
                    munInfo.neighborhood_coverage === "available_ibge_2022"
                      ? `${munInfo.neighborhood_count} delimitados (2022)`
                      : "Sem delimitação no IBGE 2022"
                  }
                />
              )}
            </dl>
            <Button className="mt-4 w-full" onClick={() => void markSelectedArea()}>
              <MapPin className="mr-2 h-4 w-4" />
              Marcar esta área
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="truncate text-right font-medium">{value}</dd>
    </div>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-2">
      <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}

function Selector({
  label,
  value,
  onChange,
  options,
  placeholder,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  placeholder: string;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[11px] uppercase tracking-wide opacity-70">{label}</Label>
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 w-full rounded-md border border-sidebar-border bg-sidebar-accent px-3 text-sm text-sidebar-foreground disabled:opacity-50"
      >
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

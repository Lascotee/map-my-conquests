import { createFileRoute, Link } from "@tanstack/react-router";
import { useRef, useEffect } from "react";
import {
  MapPin,
  PencilRuler,
  CheckCircle2,
  Search,
  ArrowRight,
  Users,
  Compass,
  Zap,
  Globe2,
  Radio,
  Layers,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import Radar from "@/components/Radar";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Territórios — Radar de Domínio & Gestão de Regiões" },
      {
        name: "description",
        content:
          "Mapeie bairros, quadras e rotas comerciais em tempo real. Rastreie áreas concluídas, em andamento e pendentes com inteligência territorial.",
      },
      { property: "og:title", content: "Territórios — Radar de Domínio de Regiões" },
      {
        property: "og:description",
        content:
          "Desenhe e busque bairros no mapa, monitore progresso de campo e converta comércios locais.",
      },
    ],
  }),
  component: Index,
});

// ─── Data ────────────────────────────────────────────────────────────────────
const REGIONS = [
  {
    name: "Centro Histórico",
    type: "Polígono IBGE",
    leads: "42 Comércios",
    status: "Concluído",
    color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30",
    dot: "bg-emerald-400",
  },
  {
    name: "Jardim América & Quadras",
    type: "Área Livre",
    leads: "28 Comércios",
    status: "Em andamento",
    color: "text-amber-400 bg-amber-500/10 border-amber-500/30",
    dot: "bg-amber-400",
  },
  {
    name: "Vila Nova & Distrito Comercial",
    type: "Bairro Oficial",
    leads: "19 Comércios",
    status: "Pendente",
    color: "text-rose-400 bg-rose-500/10 border-rose-500/30",
    dot: "bg-rose-400",
  },
  {
    name: "Bela Vista Industrial",
    type: "Rota Traçada",
    leads: "35 Comércios",
    status: "Concluído",
    color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30",
    dot: "bg-emerald-400",
  },
];

// ─── TiltCard ─────────────────────────────────────────────────────────────────
// Follows the mouse slowly across the entire screen (translateX/Y + subtle tilt)
function TiltCard() {
  const cardRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<number | null>(null);
  // Current & target animated state
  const cur = useRef({ tx: 0, ty: 0, rx: 0, ry: 0 });
  const tgt = useRef({ tx: 0, ty: 0, rx: 0, ry: 0 });

  useEffect(() => {
    // Track mouse position relative to viewport center
    function onMouseMove(e: MouseEvent) {
      const nx = e.clientX / window.innerWidth - 0.5;   // -0.5 → +0.5
      const ny = e.clientY / window.innerHeight - 0.5;  // -0.5 → +0.5
      tgt.current.tx = nx * 52;  // max ±26px left/right
      tgt.current.ty = ny * 32;  // max ±16px up/down
      tgt.current.rx = -ny * 12; // tilt vertical  (±12°)
      tgt.current.ry = nx * 16;  // tilt horizontal (±16°)
    }

    // RAF loop — lerp current towards target
    function loop() {
      const el = cardRef.current;
      if (el) {
        const L = 0.04; // 0.02 = very slow · 0.08 = faster
        cur.current.tx += (tgt.current.tx - cur.current.tx) * L;
        cur.current.ty += (tgt.current.ty - cur.current.ty) * L;
        cur.current.rx += (tgt.current.rx - cur.current.rx) * L;
        cur.current.ry += (tgt.current.ry - cur.current.ry) * L;
        const { tx, ty, rx, ry } = cur.current;
        el.style.transform = `perspective(1000px) translateX(${tx}px) translateY(${ty}px) rotateX(${rx}deg) rotateY(${ry}deg)`;
        // Glow blob moves opposite for depth parallax
        const glow = el.querySelector<HTMLElement>(".tilt-glow");
        if (glow) glow.style.transform = `translate(${-ry * 2}px, ${rx * 2}px)`;
      }
      frameRef.current = requestAnimationFrame(loop);
    }

    window.addEventListener("mousemove", onMouseMove);
    frameRef.current = requestAnimationFrame(loop);

    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
  }, []);

  return (
    <div
      ref={cardRef}
      style={{ transformStyle: "preserve-3d", willChange: "transform" }}
      className="relative overflow-hidden rounded-3xl border border-white/15 bg-black/60 p-6 shadow-2xl backdrop-blur-2xl"
    >
      {/* Floating glow blobs */}
      <div
        className="tilt-glow pointer-events-none absolute -right-20 -top-20 h-52 w-52 rounded-full bg-blue-500/25 blur-3xl"
        style={{ willChange: "transform" }}
      />
      <div className="pointer-events-none absolute -bottom-20 -left-20 h-52 w-52 rounded-full bg-purple-500/20 blur-3xl" />

      {/* Card Header */}
      <div
        className="relative flex items-center justify-between border-b border-white/10 pb-4"
        style={{ transform: "translateZ(20px)" }}
      >
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500/20 text-blue-400 ring-1 ring-blue-500/30">
            <Layers className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-display text-sm font-bold text-white">Painel de Cobertura</h3>
            <p className="text-[11px] text-zinc-400">Setor Metropolitano Sul</p>
          </div>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-500/10 px-2.5 py-1 text-xs font-semibold text-blue-400 ring-1 ring-blue-500/20">
          <span className="h-1.5 w-1.5 rounded-full bg-blue-400" /> 84% Coberto
        </span>
      </div>

      {/* Regions List */}
      <div className="relative mt-5 space-y-3" style={{ transform: "translateZ(12px)" }}>
        {REGIONS.map((item) => (
          <div
            key={item.name}
            className="flex items-center justify-between rounded-2xl border border-white/5 bg-white/[0.03] p-3.5 transition-colors hover:border-white/15 hover:bg-white/[0.06]"
          >
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-lg bg-zinc-800/80 text-zinc-400">
                <Compass className="h-4 w-4" />
              </div>
              <div>
                <p className="text-xs font-bold text-zinc-100">{item.name}</p>
                <p className="text-[11px] text-zinc-400">
                  {item.type} · <span className="text-zinc-300">{item.leads}</span>
                </p>
              </div>
            </div>
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${item.color}`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${item.dot}`} />
              {item.status}
            </span>
          </div>
        ))}
      </div>

      {/* Stats Footer */}
      <div
        className="relative mt-5 grid grid-cols-3 gap-2 rounded-2xl border border-white/5 bg-white/[0.02] p-3 text-center"
        style={{ transform: "translateZ(8px)" }}
      >
        <div>
          <p className="text-lg font-extrabold text-white">124</p>
          <p className="text-[10px] font-medium uppercase text-zinc-400">Leads Salvos</p>
        </div>
        <div className="border-x border-white/5">
          <p className="text-lg font-extrabold text-emerald-400">18</p>
          <p className="text-[10px] font-medium uppercase text-zinc-400">Bairros Feitos</p>
        </div>
        <div>
          <p className="text-lg font-extrabold text-blue-400">92%</p>
          <p className="text-[10px] font-medium uppercase text-zinc-400">Aproveitamento</p>
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
function Index() {
  return (
    <div className="relative min-h-screen w-full overflow-x-hidden bg-[#030308] text-foreground selection:bg-neon/30 selection:text-white">
      {/* Background Radar Animation */}
      <div className="pointer-events-none fixed inset-0 z-0 h-screen w-screen opacity-90">
        <Radar
          speed={0.5}
          scale={0.2}
          ringCount={9}
          spokeCount={2}
          ringThickness={0.02}
          spokeThickness={0.01}
          sweepSpeed={1.9}
          sweepWidth={2.0}
          sweepLobes={1}
          color="#3B82F6"
          backgroundColor="#000000"
          falloff={3}
          brightness={0.4}
          enableMouseInteraction={false}
          mouseInfluence={0.1}
        />
      </div>

      {/* Atmospheric overlays */}
      <div className="pointer-events-none fixed inset-0 z-0 bg-radial-vignette opacity-80" />
      <div className="pointer-events-none fixed inset-0 z-0 bg-gradient-to-b from-transparent via-[#030308]/40 to-[#030308]" />

      {/* Content wrapper */}
      <div className="relative z-10 flex min-h-screen flex-col">
        {/* Navigation Bar */}
        <header className="mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-6 sm:px-8">
          <div className="flex items-center gap-3">
            <Link to="/" className="inline-flex items-center transition-transform hover:scale-[1.02]">
              <img
                src="/logo.png"
                alt="Prospect — Radar de Conquistas"
                className="h-14 sm:h-16 w-auto object-contain drop-shadow-lg"
              />
            </Link>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-950/40 px-3 py-1 text-xs font-medium text-emerald-400 backdrop-blur-md sm:flex">
              <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
              Radar Operacional
            </div>

            <Button
              asChild
              variant="outline"
              className="border-white/15 bg-white/5 text-white backdrop-blur-md transition-all hover:border-white/30 hover:bg-white/10"
            >
              <Link to="/auth">Entrar</Link>
            </Button>

            <Button
              asChild
              className="hidden bg-gradient-to-r from-blue-500 to-indigo-600 font-semibold text-white shadow-lg shadow-blue-500/25 transition-all hover:opacity-95 sm:inline-flex"
            >
              <Link to="/auth">
                Começar Grátis
                <ArrowRight className="ml-1.5 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </header>

        {/* Hero Section */}
        <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col justify-center px-6 pb-16 pt-8 sm:px-8 lg:pt-14">
          <div className="grid items-center gap-12 lg:grid-cols-12 lg:gap-8">
            {/* Left Hero Column */}
            <div className="lg:col-span-7">
              {/* Badge */}
              <div className="inline-flex items-center gap-2 rounded-full border border-blue-500/30 bg-blue-500/10 px-3.5 py-1.5 text-xs font-semibold tracking-wide text-blue-300 backdrop-blur-xl">
                <Radio
                  className="h-3.5 w-3.5 animate-spin text-blue-400"
                  style={{ animationDuration: "4s" }}
                />
                <span>Rastreamento Geoespacial de Campo</span>
                <span className="rounded-full bg-blue-500/20 px-1.5 py-0.2 text-[10px] font-bold text-blue-200">
                  v2.0
                </span>
              </div>

              {/* Main Headline */}
              <h1 className="mt-6 font-display text-4xl font-extrabold tracking-tight text-white sm:text-6xl lg:leading-[1.08]">
                Cada bairro que você{" "}
                <span className="bg-gradient-to-r from-blue-400 via-indigo-300 to-purple-400 bg-clip-text text-transparent">
                  dominou
                </span>
                , mapeado e monitorado.
              </h1>

              <p className="mt-6 max-w-2xl text-base leading-relaxed text-zinc-300/90 sm:text-lg">
                Trace perímetros livres ou selecione regiões oficiais do IBGE. Defina status de
                cobertura, encontre comércios da área e impulsione suas vendas de campo em tempo
                real.
              </p>

              {/* Call to Actions */}
              <div className="mt-8 flex flex-wrap items-center gap-4">
                <Button
                  asChild
                  size="lg"
                  className="group relative overflow-hidden bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 px-8 py-6 text-base font-bold text-white shadow-xl shadow-blue-600/30 transition-all hover:scale-[1.02] hover:shadow-blue-600/50 active:scale-[0.98]"
                >
                  <Link to="/auth" className="flex items-center gap-2">
                    <span>Acessar Mapa de Territórios</span>
                    <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
                  </Link>
                </Button>

                <Button
                  asChild
                  variant="outline"
                  size="lg"
                  className="border-white/20 bg-white/5 px-6 py-6 text-base font-medium text-white backdrop-blur-md transition-all hover:border-white/40 hover:bg-white/10"
                >
                  <Link to="/auth">Ver Demonstração</Link>
                </Button>
              </div>

              {/* Trust Indicators */}
              <div className="mt-10 flex flex-wrap items-center gap-6 border-t border-white/10 pt-6 text-xs text-zinc-400">
                <div className="flex items-center gap-2">
                  <Globe2 className="h-4 w-4 text-blue-400" />
                  <span>Base IBGE & Google Maps Integrados</span>
                </div>
                <div className="flex items-center gap-2">
                  <Zap className="h-4 w-4 text-amber-400" />
                  <span>Sincronização em Nuvem Supabase</span>
                </div>
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-emerald-400" />
                  <span>Pronto para Vercel Serverless</span>
                </div>
              </div>
            </div>

            {/* Right Hero Column — 3D floating card */}
            <div className="lg:col-span-5">
              <TiltCard />
            </div>
          </div>

          {/* Features Grid */}
          <div className="mt-20 border-t border-white/10 pt-12">
            <div className="text-center">
              <h2 className="font-display text-2xl font-bold tracking-tight text-white sm:text-3xl">
                Tudo o que você precisa para dominar seu mercado local
              </h2>
              <p className="mx-auto mt-2 max-w-xl text-sm text-zinc-400">
                Uma suíte geoespacial completa, construída para equipes comerciais e autônomos de
                campo.
              </p>
            </div>

            <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {[
                {
                  icon: Search,
                  title: "Busca Inteligente por Bairro",
                  description:
                    "Importe contornos oficiais do IBGE instantaneamente ou pesquise pelo Google Maps em todo o território nacional.",
                  gradient: "from-blue-500/20 to-cyan-500/10",
                  iconColor: "text-blue-400",
                },
                {
                  icon: PencilRuler,
                  title: "Desenho de Polígonos Livres",
                  description:
                    "Trace ruas, quadras específicas ou rotas personalizadas clicando diretamente no mapa com edição de vértices em tempo real.",
                  gradient: "from-purple-500/20 to-pink-500/10",
                  iconColor: "text-purple-400",
                },
                {
                  icon: CheckCircle2,
                  title: "Status de Cobertura Visual",
                  description:
                    "Classifique regiões como Pendente, Em Andamento e Concluído para enxergar exatamente onde você e sua equipe já passaram.",
                  gradient: "from-emerald-500/20 to-teal-500/10",
                  iconColor: "text-emerald-400",
                },
                {
                  icon: Users,
                  title: "Captação de Leads com WhatsApp",
                  description:
                    "Encontre clínicas, restaurantes, farmácias e comércios no raio desenhado e dispare mensagens pelo WhatsApp em 1 clique.",
                  gradient: "from-amber-500/20 to-yellow-500/10",
                  iconColor: "text-amber-400",
                },
                {
                  icon: Layers,
                  title: "Organização por Pastas",
                  description:
                    "Agrupe regiões por cidades, representantes ou projetos e compartilhe com colegas por e-mail com controle de acesso.",
                  gradient: "from-indigo-500/20 to-blue-500/10",
                  iconColor: "text-indigo-400",
                },
                {
                  icon: Zap,
                  title: "Nuvem Rápida & Vercel Ready",
                  description:
                    "Arquitetura ultra-leve com TanStack Start, Supabase RLS de alta segurança e pronta para rodar sem falhas na Vercel.",
                  gradient: "from-rose-500/20 to-orange-500/10",
                  iconColor: "text-rose-400",
                },
              ].map((feature) => (
                <div
                  key={feature.title}
                  className="group relative rounded-3xl border border-white/10 bg-white/[0.02] p-6 backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:border-white/20 hover:bg-white/[0.05]"
                >
                  <div
                    className={`inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br ${feature.gradient} ${feature.iconColor} ring-1 ring-white/10`}
                  >
                    <feature.icon className="h-6 w-6" />
                  </div>
                  <h3 className="mt-4 font-display text-lg font-bold text-white">
                    {feature.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-zinc-400">
                    {feature.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </main>

        {/* Footer */}
        <footer className="border-t border-white/10 bg-black/40 py-8 backdrop-blur-md">
          <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-6 sm:flex-row sm:px-8">
            <div className="flex items-center gap-3 text-xs text-zinc-400">
              <img
                src="/logo-icon.png"
                alt="Prospect"
                className="h-6 w-auto object-contain"
              />
              <span>Prospect © {new Date().getFullYear()} — Radar de Conquistas & Inteligência Territorial</span>
            </div>
            <div className="flex items-center gap-6 text-xs text-zinc-400">
              <Link to="/auth" className="transition-colors hover:text-white">
                Entrar
              </Link>
              <Link to="/auth" className="transition-colors hover:text-white">
                Cadastrar
              </Link>
              <a
                href="#top"
                onClick={(e) => {
                  e.preventDefault();
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
                className="transition-colors hover:text-white"
              >
                Voltar ao topo ↑
              </a>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}

import { createFileRoute, Link } from "@tanstack/react-router";
import { MapPin, PencilRuler, CheckCircle2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Territórios — Mapeie as regiões que você já dominou" },
      {
        name: "description",
        content:
          "Marque bairros e quadras no mapa, acompanhe o que está pendente, em andamento e concluído. Seu controle de território visual.",
      },
      { property: "og:title", content: "Territórios — Mapeie as regiões que você já dominou" },
      {
        property: "og:description",
        content: "Desenhe ou busque bairros no mapa e acompanhe seu progresso de cobertura.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <main className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <span className="font-display text-lg font-bold tracking-tight">Territórios</span>
        <Button asChild variant="ghost">
          <Link to="/auth">Entrar</Link>
        </Button>
      </header>

      <section className="mx-auto grid max-w-6xl gap-12 px-6 pb-20 pt-10 lg:grid-cols-2 lg:items-center">
        <div>
          <p className="mb-4 inline-flex rounded-full bg-accent px-3 py-1 text-xs font-medium uppercase tracking-widest text-accent-foreground">
            Cobertura de campo
          </p>
          <h1 className="text-5xl font-bold leading-[1.05] text-foreground sm:text-6xl">
            Cada bairro que você dominou, marcado no mapa.
          </h1>
          <p className="mt-6 max-w-md text-lg text-muted-foreground">
            Busque um bairro ou desenhe a área na mão, defina o status e acompanhe visualmente onde
            você já passou em todas as lojas da região.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link to="/auth">Começar agora</Link>
            </Button>
          </div>

          <ul className="mt-12 grid gap-5 sm:grid-cols-3">
            {[
              { icon: Search, title: "Buscar bairro", text: "Marque a região inteira de uma vez" },
              { icon: PencilRuler, title: "Desenhar área", text: "Traçe quadras e rotas livres" },
              { icon: CheckCircle2, title: "Status", text: "Pendente, em andamento, concluído" },
            ].map((f) => (
              <li key={f.title} className="rounded-xl border border-border bg-card p-4">
                <f.icon className="mb-3 h-5 w-5 text-primary" />
                <p className="font-display text-sm font-semibold">{f.title}</p>
                <p className="mt-1 text-sm text-muted-foreground">{f.text}</p>
              </li>
            ))}
          </ul>
        </div>

        <div className="relative overflow-hidden rounded-3xl border border-border bg-surface p-8 text-surface-foreground">
          <MapPin className="h-8 w-8 text-primary" />
          <p className="mt-6 font-display text-2xl font-semibold">Visão de cobertura</p>
          <div className="mt-8 space-y-3">
            {[
              { label: "Centro", status: "Concluído", cls: "bg-concluido" },
              { label: "Jardim América", status: "Em andamento", cls: "bg-andamento" },
              { label: "Vila Nova", status: "Pendente", cls: "bg-pendente" },
            ].map((r) => (
              <div
                key={r.label}
                className="flex items-center justify-between rounded-xl bg-sidebar-accent px-4 py-3"
              >
                <span className="text-sm">{r.label}</span>
                <span className="flex items-center gap-2 text-xs opacity-80">
                  <span className={`h-2.5 w-2.5 rounded-full ${r.cls}`} />
                  {r.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}

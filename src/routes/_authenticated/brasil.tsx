import { Suspense, lazy } from "react";
import { ClientOnly, createFileRoute, useNavigate } from "@tanstack/react-router";

const BrasilExplorer = lazy(() => import("@/components/BrasilExplorer"));

export const Route = createFileRoute("/_authenticated/brasil")({
  head: () => ({
    meta: [
      { title: "Mapa hierárquico do Brasil — regiões, municípios e bairros" },
      {
        name: "description",
        content:
          "Navegue por regiões, estados, municípios, distritos, subdistritos e bairros do IBGE e marque áreas de trabalho.",
      },
      { property: "og:title", content: "Mapa hierárquico do Brasil" },
      {
        property: "og:description",
        content: "Regiões, estados, municípios, distritos, subdistritos e bairros do IBGE em um só mapa.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: BrasilPage,
});

function BrasilPage() {
  const navigate = useNavigate();
  return (
    <ClientOnly fallback={<div className="h-screen w-full animate-pulse bg-muted" />}>
      <Suspense fallback={<div className="h-screen w-full animate-pulse bg-muted" />}>
        <BrasilExplorer onBack={() => void navigate({ to: "/mapa" })} />
      </Suspense>
    </ClientOnly>
  );
}

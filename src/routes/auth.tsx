import { useEffect, useState } from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MapPin, ArrowLeft, Lock, Mail, Eye, EyeOff, Sparkles } from "lucide-react";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Acessar Conta — Territórios" },
      {
        name: "description",
        content: "Acesse sua conta para mapear bairros, clientes e acompanhar seu domínio de território.",
      },
      { property: "og:title", content: "Acessar Conta — Territórios" },
      {
        property: "og:description",
        content: "Acesse sua conta para mapear bairros, clientes e acompanhar seu domínio de território.",
      },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) void navigate({ to: "/mapa" });
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session) void navigate({ to: "/mapa" });
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/mapa` },
        });
        if (error) throw error;
        if (!data.session) {
          toast.success("Conta criada! Confira seu e-mail para confirmar o cadastro.");
          return;
        }
        toast.success("Conta criada com sucesso! Redirecionando...");
        void navigate({ to: "/mapa" });
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Bem-vindo de volta!");
        void navigate({ to: "/mapa" });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível continuar");
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/mapa`,
        },
      });
      if (error) throw error;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível entrar com o Google");
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-12">
      {/* Background ambient lighting */}
      <div className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 h-[500px] w-[500px] rounded-full bg-neon/15 blur-[120px]" />
      <div className="pointer-events-none absolute -bottom-40 right-1/4 h-[400px] w-[400px] rounded-full bg-violet/20 blur-[100px]" />

      <div className="relative w-full max-w-md">
        {/* Back link */}
        <Link
          to="/"
          className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar para a página inicial
        </Link>

        {/* Card */}
        <div className="overflow-hidden rounded-3xl border border-border/80 bg-card/85 p-8 shadow-2xl backdrop-blur-xl transition-all">
          {/* Logo & Title */}
          <div className="flex items-center justify-between">
            <Link to="/" className="inline-flex items-center transition-transform hover:scale-[1.02]">
              <img
                src="/logo.png"
                alt="Prospect — Radar de Conquistas"
                className="h-13 w-auto object-contain drop-shadow-md"
              />
            </Link>
            <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-2.5 py-1 text-[11px] font-semibold text-blue-400 ring-1 ring-blue-500/20">
              <Sparkles className="h-3 w-3" /> PRO
            </span>
          </div>

          <h1 className="mt-6 text-2xl font-bold tracking-tight text-foreground">
            {mode === "login" ? "Entrar na sua conta" : "Criar nova conta"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {mode === "login"
              ? "Acompanhe seus territórios, clientes e bairros mapeados."
              : "Comece a traçar e dominar suas regiões de atendimento hoje mesmo."}
          </p>

          {/* Mode Switcher Tabs */}
          <div className="mt-6 grid grid-cols-2 rounded-xl border border-border/60 bg-muted/40 p-1">
            <button
              type="button"
              onClick={() => setMode("login")}
              className={`rounded-lg py-2 text-xs font-semibold transition-all ${
                mode === "login"
                  ? "bg-foreground text-background shadow-md"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Entrar
            </button>
            <button
              type="button"
              onClick={() => setMode("signup")}
              className={`rounded-lg py-2 text-xs font-semibold transition-all ${
                mode === "signup"
                  ? "bg-foreground text-background shadow-md"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Criar conta
            </button>
          </div>

          {/* Google OAuth button */}
          <Button
            onClick={handleGoogle}
            variant="outline"
            type="button"
            className="mt-6 flex w-full items-center justify-center gap-2 border-border/80 bg-background/50 py-5 text-sm font-medium transition-all hover:bg-accent/40"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            Continuar com Google
          </Button>

          <div className="my-6 flex items-center gap-3 text-xs uppercase tracking-wider text-muted-foreground/60">
            <span className="h-px flex-1 bg-border/60" /> ou com seu e-mail{" "}
            <span className="h-px flex-1 bg-border/60" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-xs text-muted-foreground">
                E-mail
              </Label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/70" />
                <Input
                  id="email"
                  type="email"
                  required
                  placeholder="seu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="border-border/80 bg-background/50 pl-10 focus-visible:ring-neon"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-xs text-muted-foreground">
                Senha
              </Label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/70" />
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  required
                  minLength={6}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="border-border/80 bg-background/50 pl-10 pr-10 focus-visible:ring-neon"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/70 transition-colors hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              className="mt-6 w-full bg-gradient-to-r from-neon via-primary to-violet py-5 font-semibold text-black shadow-lg shadow-neon/20 transition-all hover:opacity-90 active:scale-[0.98]"
              disabled={loading}
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-black border-t-transparent" />
                  Aguarde…
                </span>
              ) : mode === "login" ? (
                "Entrar no Mapa"
              ) : (
                "Criar Conta Gratuita"
              )}
            </Button>
          </form>
        </div>
      </div>
    </main>
  );
}

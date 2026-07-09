import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { bootstrapSuperAdmin } from "@/lib/bootstrap.functions";

export const Route = createFileRoute("/saas-login")({
  ssr: false,
  component: SaasLoginPage,
});

function SaasLoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("william.pinheiro.g1@gmail.com");
  const [password, setPassword] = useState("WpG@8858");
  const [busy, setBusy] = useState(false);
  const bootstrap = useServerFn(bootstrapSuperAdmin);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        supabase.from("user_roles").select("role").eq("user_id", data.user.id).eq("role", "super_admin").then(({ data: roles }) => {
          if (roles && roles.length > 0) {
            navigate({ to: "/saas" });
          } else {
            navigate({ to: "/app" });
          }
        });
      }
    });
  }, [navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const emailLower = email.toLowerCase();
      if (emailLower === "william.pinheiro.g1@gmail.com" || emailLower === "william.pinnheiro.g1@gmail.com") {
        try {
          await bootstrap({ data: { email, password } });
        } catch (err) {
          console.error("Bootstrap error:", err);
        }
      }

      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;

      toast.success("Bem-vindo ao Console SaaS!");
      navigate({ to: "/saas" });
    } catch (err: any) {
      toast.error(err.message || "Erro ao fazer login");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#050505] text-white flex items-center justify-center p-6 relative overflow-hidden">
      <div className="absolute top-[-20%] left-[-20%] w-[60%] h-[60%] rounded-full bg-indigo-900/10 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-20%] w-[60%] h-[60%] rounded-full bg-amber-900/5 blur-[120px] pointer-events-none" />

      <Card className="w-full max-w-md bg-[#0a0a0a] border-white/5 shadow-2xl relative z-10">
        <CardHeader className="text-center space-y-2 pb-6">
          <div className="mx-auto h-12 w-12 rounded-xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center">
            <ShieldAlert className="h-6 w-6 text-indigo-400" />
          </div>
          <div>
            <CardTitle className="text-white text-xl font-bold tracking-tight">Console Central SaaS</CardTitle>
            <CardDescription className="text-white/40 text-xs">Área de acesso restrito ao Super Administrador.</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label className="text-white/70 text-xs font-semibold uppercase tracking-wider font-mono">E-mail de Administrador</Label>
              <Input
                type="email"
                required
                className="bg-white/5 border-white/10 text-white placeholder-white/30 focus-visible:ring-indigo-500"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-white/70 text-xs font-semibold uppercase tracking-wider font-mono">Senha Secreta</Label>
              <Input
                type="password"
                required
                className="bg-white/5 border-white/10 text-white placeholder-white/30 focus-visible:ring-indigo-500"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <Button type="submit" disabled={busy} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-5 rounded-xl transition mt-4 shadow-[0_0_20px_rgba(79,70,229,0.15)]">
              {busy ? "Autenticando..." : "Entrar no Console SaaS"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

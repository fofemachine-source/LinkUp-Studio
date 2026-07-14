import { useSidebar } from "@/components/ui/sidebar";
import { Input } from "@/components/ui/input";
import { Search, Bell, LogOut, Menu, Camera } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel } from "@/components/ui/dropdown-menu";
import { useQueryClient } from "@tanstack/react-query";
import { useCurrentTenant, useUserRole } from "@/hooks/use-tenant";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export function AppHeader() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const { data: tenant } = useCurrentTenant();
  const { data: role } = useUserRole(tenant?.id);
  const { toggleSidebar } = useSidebar();
  
  const [email, setEmail] = useState<string | null>(null);
  const [fullName, setFullName] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  const [photoOpen, setPhotoOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
      setEmail(data.user?.email ?? null);
      setFullName((data.user?.user_metadata as any)?.full_name ?? null);
      if (data.user) {
        // Query professional photo url
        supabase
          .from("professionals")
          .select("photo_url")
          .eq("auth_user_id", data.user.id)
          .maybeSingle()
          .then(({ data: pro }) => {
            if (pro?.photo_url) {
              setPreviewUrl(pro.photo_url);
              setAvatarUrl(pro.photo_url);
            }
          });
      }
    });
  }, [photoOpen]);

  const initials = (fullName ?? email ?? "U").split(" ").map(w => w[0]).join("").slice(0,2).toUpperCase();

  const roleLabel = role === "super_admin" 
    ? "SaaS Admin" 
    : role === "owner" 
      ? "Proprietário" 
      : role === "barber" 
        ? "Colaborador" 
        : role === "staff" 
          ? "Staff" 
          : "Usuário";

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    nav({ to: "/auth", search: { redirect: "/app" }, replace: true });
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setPreviewUrl(URL.createObjectURL(selectedFile));
    }
  };

  const savePhoto = async () => {
    if (!file || !user) return;
    setUploading(true);
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${tenant?.id}/pros/${Date.now()}-${safeName}`;
      
      const { error: uploadError } = await supabase.storage
        .from("assets")
        .upload(path, file, { upsert: true, contentType: file.type || "image/jpeg" });
      if (uploadError) throw uploadError;

      const { data: signed, error: signedError } = await supabase.storage
        .from("assets")
        .createSignedUrl(path, 60 * 60 * 24 * 365 * 5);
      if (signedError || !signed?.signedUrl) throw new Error("Não foi possível gerar a URL da foto.");

      const photoUrl = signed.signedUrl;

      // Update the professional record
      const { error: updateError } = await supabase
        .from("professionals")
        .update({ photo_url: photoUrl })
        .eq("auth_user_id", user.id);
      if (updateError) throw updateError;

      // Also update auth user metadata
      await supabase.auth.updateUser({
        data: { avatar_url: photoUrl }
      });

      setAvatarUrl(photoUrl);
      toast.success("Foto de perfil atualizada!");
      setPhotoOpen(false);
      setFile(null);
      
      qc.invalidateQueries({ queryKey: ["pros"] });
      qc.invalidateQueries({ queryKey: ["pros-all"] });
      qc.invalidateQueries({ queryKey: ["current-tenant"] });
    } catch (err: any) {
      toast.error(err.message || "Erro ao salvar foto.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <header className="h-16 border-b bg-background flex items-center gap-3 px-4 sticky top-0 z-30">
      <button
        onClick={toggleSidebar}
        className="h-9 w-9 rounded-lg hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground active:scale-95 transition-all duration-200"
        aria-label="Abrir Menu"
      >
        <Menu className="h-5 w-5" />
      </button>
      <div className="relative flex-1 max-w-2xl">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Buscar agendamentos, clientes..." className="pl-9 bg-muted/40 border-transparent focus-visible:bg-background" />
      </div>
      <button className="relative h-9 w-9 rounded-full hover:bg-muted grid place-items-center">
        <Bell className="h-4 w-4" />
        <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-destructive" />
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex items-center gap-2 rounded-lg hover:bg-muted px-2 py-1.5 cursor-pointer">
            <div className="text-right hidden sm:block">
              <div className="text-sm font-medium leading-tight">{fullName ?? "Usuário"}</div>
              <div className="text-xs text-muted-foreground leading-tight">{roleLabel}</div>
            </div>
            <Avatar className="h-8 w-8">
              <AvatarImage src={avatarUrl ?? undefined} />
              <AvatarFallback className="bg-primary text-primary-foreground text-xs">{initials}</AvatarFallback>
            </Avatar>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>{email}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setPhotoOpen(true)} className="cursor-pointer">
            <Camera className="h-4 w-4 mr-2" /> Alterar Minha Foto
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={signOut} className="cursor-pointer text-destructive focus:text-destructive"><LogOut className="h-4 w-4 mr-2" /> Sair</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={photoOpen} onOpenChange={setPhotoOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Alterar Foto de Perfil</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="flex flex-col items-center gap-4">
              {previewUrl ? (
                <img src={previewUrl} className="h-32 w-32 rounded-full object-cover border-2 border-primary shadow-md" alt="Preview" />
              ) : (
                <div className="h-32 w-32 rounded-full bg-muted flex items-center justify-center text-muted-foreground text-sm">Sem foto</div>
              )}
              <div className="w-full">
                <Label className="text-xs text-muted-foreground uppercase font-semibold mb-2 block">Escolher arquivo</Label>
                <Input type="file" accept="image/*" onChange={handleFileChange} className="cursor-pointer" />
              </div>
              <p className="text-xs text-muted-foreground text-center">A foto será exibida no painel de agendamentos da barbearia.</p>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => { setPhotoOpen(false); setFile(null); }}>Cancelar</Button>
            <Button onClick={savePhoto} disabled={uploading || !file}>
              {uploading ? "Salvando..." : "Salvar Foto"}
            </Button>
          </DialogFooter>
        </Dialog>
      </Dialog>
    </header>
  );
}

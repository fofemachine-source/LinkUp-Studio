import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Trash2, CalendarOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import {
  createProfessionalTimeOff,
  deleteProfessionalTimeOff,
  listProfessionalTimeOff,
} from "@/lib/professional-time-off.functions";

type Props = { tenantId: string | undefined };

type ProOption = { id: string; full_name: string };

const timeOffKey = (tenantId: string) => ["professional-time-off", tenantId] as const;

function formatDate(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export function ProfessionalTimeOffManager({ tenantId }: Props) {
  const qc = useQueryClient();
  const listFn = useServerFn(listProfessionalTimeOff);
  const createFn = useServerFn(createProfessionalTimeOff);
  const deleteFn = useServerFn(deleteProfessionalTimeOff);

  const prosQuery = useQuery({
    queryKey: ["professionals-min", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("professionals")
        .select("id, full_name")
        .eq("tenant_id", tenantId!)
        .eq("active", true)
        .order("full_name");
      if (error) throw error;
      return (data ?? []) as ProOption[];
    },
  });

  const listQuery = useQuery({
    queryKey: timeOffKey(tenantId ?? ""),
    enabled: !!tenantId,
    queryFn: () => listFn({ data: { tenantId: tenantId! } }),
  });

  const [professionalId, setProfessionalId] = useState<string>("");
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");
  const [allDay, setAllDay] = useState(true);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("12:00");
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (!professionalId && prosQuery.data?.[0]) {
      setProfessionalId(prosQuery.data[0].id);
    }
  }, [prosQuery.data, professionalId]);

  const proById = useMemo(() => {
    const map = new Map<string, string>();
    (prosQuery.data ?? []).forEach((p) => map.set(p.id, p.full_name));
    return map;
  }, [prosQuery.data]);

  const createMutation = useMutation({
    mutationFn: () =>
      createFn({
        data: {
          tenantId: tenantId!,
          professionalId,
          startsOn,
          endsOn: endsOn || startsOn,
          allDay,
          startTime: allDay ? null : startTime,
          endTime: allDay ? null : endTime,
          reason: reason || null,
        },
      }),
    onSuccess: () => {
      toast.success("Folga cadastrada.");
      setStartsOn("");
      setEndsOn("");
      setReason("");
      qc.invalidateQueries({ queryKey: timeOffKey(tenantId!) });
    },
    onError: (err: any) => toast.error(err?.message ?? "Falha ao cadastrar folga."),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { tenantId: tenantId!, id } }),
    onSuccess: () => {
      toast.success("Folga removida.");
      qc.invalidateQueries({ queryKey: timeOffKey(tenantId!) });
    },
    onError: (err: any) => toast.error(err?.message ?? "Falha ao remover folga."),
  });

  if (!tenantId) return null;

  const disabled =
    !professionalId ||
    !startsOn ||
    createMutation.isPending ||
    (!allDay && (!startTime || !endTime));

  return (
    <div className="border-t pt-4 space-y-4">
      <div className="flex items-center gap-2">
        <CalendarOff className="h-4 w-4" />
        <Label className="font-semibold">Folgas dos profissionais</Label>
      </div>
      <p className="text-xs text-muted-foreground">
        Cadastre folgas por profissional. Enquanto a folga estiver ativa, o
        profissional não aparecerá em horários bloqueados no link público de
        agendamento.
      </p>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1">
          <Label>Profissional</Label>
          <Select value={professionalId} onValueChange={setProfessionalId}>
            <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
            <SelectContent>
              {(prosQuery.data ?? []).map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-end gap-3">
          <div className="flex items-center gap-2">
            <Switch checked={allDay} onCheckedChange={setAllDay} id="allDay" />
            <Label htmlFor="allDay" className="text-sm">Dia inteiro</Label>
          </div>
        </div>
        <div className="space-y-1">
          <Label>Início</Label>
          <Input type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Fim (opcional)</Label>
          <Input
            type="date"
            value={endsOn}
            min={startsOn || undefined}
            onChange={(e) => setEndsOn(e.target.value)}
          />
        </div>
        {!allDay && (
          <>
            <div className="space-y-1">
              <Label>Hora inicial</Label>
              <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Hora final</Label>
              <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
            </div>
          </>
        )}
        <div className="space-y-1 md:col-span-2">
          <Label>Motivo (opcional)</Label>
          <Input
            placeholder="Ex: Férias, consulta, curso..."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
      </div>

      <Button onClick={() => createMutation.mutate()} disabled={disabled}>
        {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Adicionar folga
      </Button>

      <div className="space-y-2">
        <Label className="text-sm">Folgas cadastradas</Label>
        {listQuery.isLoading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> Carregando...
          </div>
        ) : (listQuery.data ?? []).length === 0 ? (
          <span className="text-xs text-muted-foreground italic">
            Nenhuma folga cadastrada.
          </span>
        ) : (
          <div className="space-y-2">
            {(listQuery.data ?? []).map((row: any) => (
              <div
                key={row.id}
                className="flex items-center justify-between gap-3 border rounded-lg px-3 py-2 bg-muted/40"
              >
                <div className="text-sm">
                  <div className="font-medium">
                    {proById.get(row.professional_id) ?? "Profissional"}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {formatDate(row.starts_on)}
                    {row.ends_on !== row.starts_on ? ` até ${formatDate(row.ends_on)}` : ""}
                    {row.all_day
                      ? " · dia inteiro"
                      : ` · ${String(row.start_time).slice(0, 5)}–${String(row.end_time).slice(0, 5)}`}
                    {row.reason ? ` · ${row.reason}` : ""}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => deleteMutation.mutate(row.id)}
                  disabled={deleteMutation.isPending}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

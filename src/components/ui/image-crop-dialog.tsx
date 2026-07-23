import { useEffect, useMemo, useRef, useState } from "react";
import { Crop, ZoomIn, ZoomOut } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";

type Size = {
  width: number;
  height: number;
};

type Point = {
  x: number;
  y: number;
};

type ImageCropDialogProps = {
  file: File | null;
  aspect?: number;
  outputWidth?: number;
  onCancel: () => void;
  onConfirm: (file: File) => void;
};

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

export function ImageCropDialog({
  file,
  aspect = 4 / 3,
  outputWidth = 1200,
  onCancel,
  onConfirm,
}: ImageCropDialogProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sourceImageRef = useRef<HTMLImageElement | null>(null);
  const dragRef = useRef<{
    pointerId: number;
    start: Point;
    offset: Point;
  } | null>(null);
  const [image, setImage] = useState<Size>({ width: 0, height: 0 });
  const [zoom, setZoom] = useState(0);
  const [offset, setOffset] = useState<Point>({ x: 0, y: 0 });
  const [processing, setProcessing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    if (!file) {
      sourceImageRef.current = null;
      setImage({ width: 0, height: 0 });
      setLoading(false);
      setLoadError("");
      return;
    }

    let cancelled = false;
    const reader = new FileReader();
    sourceImageRef.current = null;
    setImage({ width: 0, height: 0 });
    setZoom(0);
    setOffset({ x: 0, y: 0 });
    setLoading(true);
    setLoadError("");

    reader.onload = () => {
      if (cancelled || typeof reader.result !== "string") return;
      const dataUrl = reader.result;
      const probe = document.createElement("img");
      probe.onload = () => {
        if (cancelled) return;
        setImage({
          width: probe.naturalWidth,
          height: probe.naturalHeight,
        });
        sourceImageRef.current = probe;
        setLoading(false);
      };
      probe.onerror = () => {
        if (cancelled) return;
        setLoadError("Não foi possível abrir essa imagem. Tente usar JPG, PNG ou WEBP.");
        setLoading(false);
      };
      probe.src = dataUrl;
    };
    reader.onerror = () => {
      if (cancelled) return;
      setLoadError("Não foi possível ler o arquivo selecionado.");
      setLoading(false);
    };
    reader.readAsDataURL(file);

    return () => {
      cancelled = true;
      if (reader.readyState === FileReader.LOADING) reader.abort();
    };
  }, [file]);

  const outputHeight = Math.round(outputWidth / aspect);
  const geometry = useMemo(() => {
    if (!image.width || !image.height) {
      return {
        scale: 1,
        renderedWidth: 0,
        renderedHeight: 0,
        maxX: 0,
        maxY: 0,
      };
    }
    const containScale = Math.min(outputWidth / image.width, outputHeight / image.height);
    const coverScale = Math.max(outputWidth / image.width, outputHeight / image.height);
    const scale = zoom <= 1 ? containScale + (coverScale - containScale) * zoom : coverScale * zoom;
    const renderedWidth = image.width * scale;
    const renderedHeight = image.height * scale;
    return {
      scale,
      renderedWidth,
      renderedHeight,
      maxX: Math.max(0, (renderedWidth - outputWidth) / 2),
      maxY: Math.max(0, (renderedHeight - outputHeight) / 2),
    };
  }, [image.height, image.width, outputHeight, outputWidth, zoom]);

  useEffect(() => {
    setOffset((current) => ({
      x: clamp(current.x, -geometry.maxX, geometry.maxX),
      y: clamp(current.y, -geometry.maxY, geometry.maxY),
    }));
  }, [geometry.maxX, geometry.maxY]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const source = sourceImageRef.current;
    if (!canvas || !source || !image.width || !image.height) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    canvas.width = outputWidth;
    canvas.height = outputHeight;
    context.clearRect(0, 0, outputWidth, outputHeight);
    context.fillStyle = "#0f172a";
    context.fillRect(0, 0, outputWidth, outputHeight);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(
      source,
      (outputWidth - geometry.renderedWidth) / 2 + offset.x,
      (outputHeight - geometry.renderedHeight) / 2 + offset.y,
      geometry.renderedWidth,
      geometry.renderedHeight,
    );
  }, [
    geometry.renderedHeight,
    geometry.renderedWidth,
    image.height,
    image.width,
    offset.x,
    offset.y,
    outputHeight,
    outputWidth,
  ]);

  function moveOffset(point: Point) {
    setOffset({
      x: clamp(point.x, -geometry.maxX, geometry.maxX),
      y: clamp(point.y, -geometry.maxY, geometry.maxY),
    });
  }

  function pointerDown(event: React.PointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      start: { x: event.clientX, y: event.clientY },
      offset,
    };
  }

  function pointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const displayScale = bounds.width ? outputWidth / bounds.width : 1;
    moveOffset({
      x: drag.offset.x + (event.clientX - drag.start.x) * displayScale,
      y: drag.offset.y + (event.clientY - drag.start.y) * displayScale,
    });
  }

  function pointerEnd(event: React.PointerEvent<HTMLDivElement>) {
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null;
    }
  }

  async function confirmCrop() {
    const canvas = canvasRef.current;
    if (!canvas || !sourceImageRef.current || !file || !image.width) return;
    setProcessing(true);
    try {
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/webp", 0.9),
      );
      if (!blob) throw new Error("Não foi possível recortar a imagem.");
      const baseName = file.name.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9._-]/g, "_");
      onConfirm(
        new File([blob], `${baseName}-enquadrada.webp`, {
          type: "image/webp",
          lastModified: Date.now(),
        }),
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível ajustar a imagem.");
    } finally {
      setProcessing(false);
    }
  }

  return (
    <Dialog open={Boolean(file)} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Crop className="h-5 w-5 text-amber-500" />
            Ajustar imagem
          </DialogTitle>
          <DialogDescription>
            Arraste a foto e ajuste o zoom para escolher como ela aparecerá no quadro.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div
            className="relative mx-auto w-full max-w-xl touch-none cursor-grab overflow-hidden rounded-xl bg-slate-950 active:cursor-grabbing"
            style={{ aspectRatio: String(aspect) }}
            onPointerDown={pointerDown}
            onPointerMove={pointerMove}
            onPointerUp={pointerEnd}
            onPointerCancel={pointerEnd}
          >
            <canvas
              ref={canvasRef}
              width={outputWidth}
              height={outputHeight}
              className="pointer-events-none block h-full w-full"
              aria-label="Pré-visualização do enquadramento"
            />
            {loading && (
              <div className="absolute inset-0 grid place-items-center text-sm text-white/80">
                Carregando imagem...
              </div>
            )}
            {loadError && (
              <div className="absolute inset-0 grid place-items-center px-8 text-center text-sm text-red-300">
                {loadError}
              </div>
            )}
            <div className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-white/70">
              <div className="absolute inset-y-0 left-1/3 border-l border-white/45" />
              <div className="absolute inset-y-0 left-2/3 border-l border-white/45" />
              <div className="absolute inset-x-0 top-1/3 border-t border-white/45" />
              <div className="absolute inset-x-0 top-2/3 border-t border-white/45" />
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-lg border bg-muted/30 px-4 py-3">
            <ZoomOut className="h-4 w-4 shrink-0 text-muted-foreground" />
            <Slider
              min={0}
              max={3}
              step={0.01}
              value={[zoom]}
              onValueChange={([value]) => setZoom(value ?? 0)}
              aria-label="Zoom da imagem"
            />
            <ZoomIn className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="w-12 shrink-0 text-right text-xs font-medium tabular-nums text-muted-foreground">
              {Math.round(zoom * 100)}%
            </span>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={onCancel} disabled={processing}>
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={() => void confirmCrop()}
            disabled={processing || loading || Boolean(loadError) || !image.width}
          >
            {processing ? "Ajustando..." : "Confirmar enquadramento"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

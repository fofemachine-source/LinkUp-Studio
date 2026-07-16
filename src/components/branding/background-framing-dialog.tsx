import { useEffect, useMemo, useRef, useState } from "react";
import { Crop, Monitor, Smartphone, ZoomIn, ZoomOut } from "lucide-react";
import { ImmersiveBackground } from "@/components/branding/immersive-background";
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
import {
  getBookingBrandingFrame,
  normalizeBookingBranding,
  type BookingBranding,
  type BrandingViewport,
} from "@/lib/booking-branding";
import { cn } from "@/lib/utils";

export type FramingViewport = Extract<BrandingViewport, "mobile" | "desktop">;

export type BackgroundFrame = {
  x: number;
  y: number;
  zoom: number;
};

export type BackgroundFramingFrames = Record<FramingViewport, BackgroundFrame>;

type BackgroundFramingDialogProps = {
  open: boolean;
  imageUrl: string | null;
  branding: BookingBranding;
  initialViewport?: FramingViewport;
  onCancel: () => void;
  onConfirm: (frames: BackgroundFramingFrames, viewport: FramingViewport) => void;
};

type DragState = {
  pointerId: number;
  startX: number;
  startY: number;
  frame: BackgroundFrame;
};

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

function framesFromBranding(branding: BookingBranding): BackgroundFramingFrames {
  return {
    mobile: getBookingBrandingFrame(branding, "mobile"),
    desktop: getBookingBrandingFrame(branding, "desktop"),
  };
}

export function BackgroundFramingDialog({
  open,
  imageUrl,
  branding,
  initialViewport = "mobile",
  onCancel,
  onConfirm,
}: BackgroundFramingDialogProps) {
  const dragRef = useRef<DragState | null>(null);
  const [viewport, setViewport] = useState<FramingViewport>(initialViewport);
  const [frames, setFrames] = useState<BackgroundFramingFrames>(() => framesFromBranding(branding));
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (!open) return;
    setViewport(initialViewport);
    setFrames(framesFromBranding(branding));
    dragRef.current = null;
    setDragging(false);
  }, [branding, initialViewport, open]);

  useEffect(() => {
    if (!open || !imageUrl) {
      setImageSize({ width: 0, height: 0 });
      return;
    }

    let cancelled = false;
    const image = new Image();
    image.decoding = "async";
    image.onload = () => {
      if (cancelled) return;
      setImageSize({
        width: image.naturalWidth,
        height: image.naturalHeight,
      });
    };
    image.onerror = () => {
      if (!cancelled) setImageSize({ width: 0, height: 0 });
    };
    image.src = imageUrl;

    return () => {
      cancelled = true;
      image.onload = null;
      image.onerror = null;
    };
  }, [imageUrl, open]);

  const currentFrame = frames[viewport];
  const previewBranding = useMemo(
    () =>
      normalizeBookingBranding({
        ...branding,
        background_asset_id: null,
        background_source_path: null,
        background_mobile_path: null,
        background_tablet_path: null,
        background_desktop_path: null,
        mobile_position_mode: "free",
        mobile_position_x: frames.mobile.x,
        mobile_position_y: frames.mobile.y,
        mobile_zoom: frames.mobile.zoom,
        desktop_position_mode: "free",
        desktop_position_x: frames.desktop.x,
        desktop_position_y: frames.desktop.y,
        desktop_zoom: frames.desktop.zoom,
        overlay_opacity: 0,
      }),
    [branding, frames],
  );

  function updateCurrentFrame(patch: Partial<BackgroundFrame>) {
    setFrames((current) => ({
      ...current,
      [viewport]: {
        ...current[viewport],
        ...patch,
      },
    }));
  }

  function pointerDown(event: React.PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      frame: { ...currentFrame },
    };
    setDragging(true);
  }

  function pointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    const bounds = event.currentTarget.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;

    if (!imageSize.width || !imageSize.height) return;

    const cover = Math.max(bounds.width / imageSize.width, bounds.height / imageSize.height);
    const zoomScale = 1 + drag.frame.zoom;
    const renderedWidth = imageSize.width * cover * zoomScale;
    const renderedHeight = imageSize.height * cover * zoomScale;
    const overflowX = Math.max(0, renderedWidth - bounds.width);
    const overflowY = Math.max(0, renderedHeight - bounds.height);
    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;
    const nextX =
      overflowX > 0.5 ? clamp(drag.frame.x - (deltaX / overflowX) * 100, 0, 100) : drag.frame.x;
    const nextY =
      overflowY > 0.5 ? clamp(drag.frame.y - (deltaY / overflowY) * 100, 0, 100) : drag.frame.y;

    setFrames((current) => ({
      ...current,
      [viewport]: {
        ...current[viewport],
        x: nextX,
        y: nextY,
      },
    }));
  }

  function pointerEnd(event: React.PointerEvent<HTMLDivElement>) {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setDragging(false);
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onCancel()}>
      <DialogContent className="max-h-[94vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Crop className="h-5 w-5 text-amber-500" />
            Ajustar enquadramento
          </DialogTitle>
          <DialogDescription>
            Arraste a imagem para escolher o foco e ajuste o zoom separadamente para cada tela.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="mx-auto inline-flex rounded-lg bg-muted p-1">
            <Button
              type="button"
              size="sm"
              variant={viewport === "mobile" ? "default" : "ghost"}
              onClick={() => setViewport("mobile")}
            >
              <Smartphone />
              Mobile 9:16
            </Button>
            <Button
              type="button"
              size="sm"
              variant={viewport === "desktop" ? "default" : "ghost"}
              onClick={() => setViewport("desktop")}
            >
              <Monitor />
              Desktop 16:9
            </Button>
          </div>

          <div
            className={cn(
              "relative mx-auto touch-none select-none overflow-hidden rounded-xl bg-slate-950 shadow-inner",
              viewport === "mobile"
                ? "aspect-[9/16] h-[min(58vh,620px)] max-w-full"
                : "aspect-video w-full max-w-3xl",
              dragging ? "cursor-grabbing" : "cursor-grab",
            )}
            onPointerDown={pointerDown}
            onPointerMove={pointerMove}
            onPointerUp={pointerEnd}
            onPointerCancel={pointerEnd}
          >
            <ImmersiveBackground
              branding={previewBranding}
              fallbackUrl={imageUrl}
              previewViewport={viewport}
              className="pointer-events-none absolute inset-0 h-full w-full"
              priority
            />

            {!imageUrl && (
              <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center px-6 text-center text-sm text-white/65">
                Nenhuma imagem disponível para enquadrar.
              </div>
            )}

            <div className="pointer-events-none absolute inset-0 z-20 ring-1 ring-inset ring-white/70">
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
              max={2}
              step={0.01}
              value={[currentFrame.zoom]}
              onValueChange={([zoom]) =>
                updateCurrentFrame({
                  zoom: Math.round((zoom ?? currentFrame.zoom) * 100) / 100,
                })
              }
              aria-label={`Zoom da imagem para ${viewport === "mobile" ? "mobile" : "desktop"}`}
            />
            <ZoomIn className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="w-12 shrink-0 text-right text-xs font-medium tabular-nums text-muted-foreground">
              {Math.round(currentFrame.zoom * 100)}%
            </span>
          </div>

          <p className="text-center text-xs text-muted-foreground">
            Arraste para reposicionar. O zoom começa em 0% e mantém o enquadramento salvo de cada
            formato.
          </p>
        </div>

        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancelar
          </Button>
          <Button type="button" disabled={!imageUrl} onClick={() => onConfirm(frames, viewport)}>
            Confirmar enquadramento
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

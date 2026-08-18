/**
 * Фото тарелки: Gemini Vision распознаёт блюдо и добавляет КБЖУ в дневник.
 * Вынесено из Meals.tsx.
 */

import { Button } from "@/components/ui/button";
import { Camera, Loader2, Sparkles } from "lucide-react";

interface PhotoMealDialogProps {
  photoDataUrl: string | null;
  analyzingPhoto: boolean;
  photoError: string | null;
  onFileChange: (file: File | undefined) => void;
  onAnalyze: () => void;
}

export function PhotoMealDialog({
  photoDataUrl,
  analyzingPhoto,
  photoError,
  onFileChange,
  onAnalyze,
}: PhotoMealDialogProps) {
  return (
    <div className="space-y-2 rounded-lg border border-dashed p-3">
      <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
        Или фото тарелки
      </p>
      {photoDataUrl ? (
        <div className="flex items-center gap-3">
          <img
            src={photoDataUrl}
            alt="Фото тарелки"
            className="size-16 shrink-0 rounded-lg object-cover"
          />
          <div className="min-w-0 flex-1 space-y-1.5">
            <Button className="w-full" disabled={analyzingPhoto} onClick={onAnalyze}>
              {analyzingPhoto ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Sparkles className="size-4" />
              )}
              {analyzingPhoto ? "Распознаём…" : "Распознать и добавить"}
            </Button>
            <label className="block cursor-pointer text-center text-[11px] text-muted-foreground underline-offset-4 hover:underline">
              Другое фото
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                onChange={(e) => onFileChange(e.target.files?.[0])}
              />
            </label>
          </div>
        </div>
      ) : (
        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed px-3 py-3 text-xs text-muted-foreground transition-colors hover:border-brand hover:text-brand">
          <Camera className="size-4" />
          Выбрать фото тарелки
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            onChange={(e) => onFileChange(e.target.files?.[0])}
          />
        </label>
      )}
      {photoError && <p className="text-[11px] text-destructive">{photoError}</p>}
      <p className="text-[10px] leading-relaxed text-muted-foreground/80">
        Фото используется только для распознавания блюда и расчёта КБЖУ — оно не
        сохраняется.
      </p>
    </div>
  );
}

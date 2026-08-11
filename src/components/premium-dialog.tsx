import { toast } from "sonner";
import { Sparkles, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  FREE_FEATURES,
  PREMIUM_FEATURES,
  PREMIUM_FEATURE_LABELS,
  type PremiumFeature,
} from "@/lib/premium";

/**
 * Paywall-заглушка KILO Premium (UX-подготовка к монетизации).
 *
 * Оплата ещё не подключена, поэтому кнопка «Попробовать Premium» — плейсхолдер
 * (честное «скоро»), никакого фейкового checkout. Когда появится Stripe/
 * ЮKassa, кнопка заменится на реальный запуск оформления — контейнер готов.
 */
export function PremiumDialog({
  open,
  onOpenChange,
  feature,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Какая фича запросила Premium (для заголовка). */
  feature?: PremiumFeature;
}) {
  const handleTry = () => {
    toast("Оплата появится скоро", {
      description: "Контур Premium уже готов — осталось подключить платежи.",
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="mb-3 flex size-11 items-center justify-center rounded-full bg-gradient-to-br from-brand to-brand-deep text-brand-foreground">
            <Sparkles className="size-5" />
          </div>
          <DialogTitle className="pr-8">KILO Premium</DialogTitle>
          <DialogDescription>
            {feature ? (
              <>
                «{PREMIUM_FEATURE_LABELS[feature]}» — это функция Premium.
                Подписка открывает все возможности коуча и аналитики.
              </>
            ) : (
              <>
                Больше от персонального коуча: умные рекомендации и полная
                аналитика прогресса.
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border bg-secondary/30 p-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Бесплатно
            </p>
            <ul className="mt-3 space-y-2">
              {FREE_FEATURES.map((f) => (
                <li key={f} className="flex items-start gap-2 text-xs text-muted-foreground">
                  <Check className="mt-0.5 size-3.5 shrink-0 text-muted-foreground/60" />
                  {f}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-lg border border-brand/30 bg-brand/5 p-4">
            <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-brand">
              <Sparkles className="size-3" />
              Premium
            </p>
            <ul className="mt-3 space-y-2">
              {PREMIUM_FEATURES.map((key) => (
                <li key={key} className="flex items-start gap-2 text-xs">
                  <Sparkles className="mt-0.5 size-3.5 shrink-0 text-brand" />
                  {PREMIUM_FEATURE_LABELS[key]}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-2 flex flex-col gap-2">
          <Button className="w-full" onClick={handleTry}>
            <Sparkles className="size-4" />
            Попробовать Premium
          </Button>
          <Button
            variant="ghost"
            className="w-full text-muted-foreground"
            onClick={() => onOpenChange(false)}
          >
            <X className="size-4" />
            Пока нет
          </Button>
        </div>
        <p className="text-center text-[11px] text-muted-foreground">
          Оплата появится скоро — приложение уже готово к подписке.
        </p>
      </DialogContent>
    </Dialog>
  );
}

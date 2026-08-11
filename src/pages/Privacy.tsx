import { Link } from "react-router";
import { PageAurora } from "@/components/page-aurora";
import { ShieldCheck, Download, Trash2 } from "lucide-react";

/** Статичная страница политики конфиденциальности (не требует авторизации).
 *  Доступна с лендинга, /auth и Профиля; экспорт/удаление данных — на
 *  Профиле (account.exportMyData / account.deleteMyAccount). */
export default function Privacy() {
  return (
    <div className="relative min-h-screen">
      <PageAurora />
      <div className="relative mx-auto w-full max-w-3xl px-6 py-16 sm:py-24">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition hover:text-foreground"
        >
          ← На главную
        </Link>
        <h1 className="mt-6 text-3xl font-semibold tracking-tight sm:text-4xl">
          Политика конфиденциальности
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Приложение «КИЛО» — фитнес и питание в цифрах. Обновлено:{" "}
          {new Date().toLocaleDateString("ru-RU")}.
        </p>

        <div className="mt-8 space-y-6 rounded-2xl border bg-card p-6 shadow-elev-1 sm:p-8">
          <section>
            <h2 className="text-lg font-semibold">Какие данные мы храним</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-foreground/90">
              <li>Профиль: возраст, пол, рост, вес, цель, уровень, инвентарь, ограничения;</li>
              <li>Дневник питания, свои продукты, вода, записи веса, логи тренировок и планы;</li>
              <li>Данные входа: email, которым вы вошли;</li>
              <li>Служебные счётчики лимитов (анти-спам) — без персональных данных.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold">Как мы используем данные</h2>
            <p className="mt-2 text-sm text-foreground/90">
              Только для работы приложения: расчёт калорий и макросов, генерация
              планов питания и тренировок, графики прогресса, синхронизация между
              устройствами. Мы не продаём данные и не показываем рекламу на их основе.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">Где хранятся данные</h2>
            <p className="mt-2 text-sm text-foreground/90">
              В защищённой облачной базе Convex (шифрование в покое и при
              передаче). Доступ к данным — только через авторизованный клиент
              по персональным токенам; cookie-аутентификации нет.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">ИИ-анализ и фото блюд</h2>
            <p className="mt-2 text-sm text-foreground/90">
              Фото тарелки отправляется в ИИ-модель Gemini Vision (Google) только
              для распознавания блюда и расчёта КБЖУ. Фото не сохраняется: после
              анализа оно удаляется, а в дневник попадают лишь распознанные
              калории и макросы. Текстовые запросы к ассистенту обрабатывает та же
              ИИ-модель — не отправляйте в чат данные, которые не нужны для
              ответа (например, документы или пароли). Ответы ИИ носят
              рекомендательный характер и не заменяют консультацию врача или
              диетолога.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">Ваши права (GDPR)</h2>
            <div className="mt-3 space-y-3">
              <div className="flex items-start gap-3 rounded-lg border border-border/60 p-3">
                <Download className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Переносимость</p>
                  <p className="text-xs text-muted-foreground">
                    Профиль → «Данные и приватность» → «Экспортировать все данные» —
                    один JSON-файл со всеми записями.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3 rounded-lg border border-border/60 p-3">
                <Trash2 className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Забвение</p>
                  <p className="text-xs text-muted-foreground">
                    Там же — «Удалить аккаунт»: стираются все данные, сессии и
                    привязанные входы без возможности восстановления.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3 rounded-lg border border-border/60 p-3">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Запросы и вопросы</p>
                  <p className="text-xs text-muted-foreground">
                    По любым вопросам о данных пишите на privacy@kilo.app — отвечаем
                    в течение 30 дней.
                  </p>
                </div>
              </div>
            </div>
          </section>

          <p className="text-xs text-muted-foreground/80">
            Ребёнок до 14 лет не должен пользоваться приложением без согласия
            родителей. Мы не собираем данные платежей — платных функций нет.
          </p>
        </div>
      </div>
    </div>
  );
}

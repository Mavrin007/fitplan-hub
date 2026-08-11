import { Link } from "react-router";
import { PageAurora } from "@/components/page-aurora";
import { FileText, ShieldCheck, Sparkles, UserX } from "lucide-react";

/** Статичная страница условий использования (не требует авторизации).
 *  Доступна с лендинга; политика данных — на /privacy. */
export default function Terms() {
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
          Условия использования
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Приложение «КИЛО» — фитнес и питание в цифрах. Обновлено:{" "}
          {new Date().toLocaleDateString("ru-RU")}.
        </p>

        <div className="mt-8 space-y-6 rounded-2xl border bg-card p-6 shadow-elev-1 sm:p-8">
          <section>
            <div className="flex items-start gap-3">
              <FileText className="mt-0.5 size-4 shrink-0 text-brand" />
              <div>
                <h2 className="text-lg font-semibold">Услуга</h2>
                <p className="mt-2 text-sm text-foreground/90">
                  «КИЛО» помогает вести дневник питания и тренировок, считать
                  калории и макросы, планировать приёмы пищи и тренировки,
                  отслеживать прогресс и получать рекомендации ИИ-ассистента.
                  Сервис предоставляется «как есть» и может меняться: мы вправе
                  добавлять, изменять или убирать функции.
                </p>
              </div>
            </div>
          </section>

          <section>
            <div className="flex items-start gap-3">
              <UserX className="mt-0.5 size-4 shrink-0 text-brand" />
              <div>
                <h2 className="text-lg font-semibold">Аккаунт</h2>
                <p className="mt-2 text-sm text-foreground/90">
                  Вы можете пользоваться приложением как гость или привязать
                  email. Гостевой режим создаёт анонимный профиль в нашей базе:
                  при привязке почты ваши записи сохраняются и не теряются. Вы
                  отвечаете за корректность введённых данных и обязаны не
                  использовать сервис для незаконных целей. Удалить аккаунт
                  вместе со всеми данными можно в любой момент: Профиль → «Данные
                  и приватность» → «Удалить аккаунт».
                </p>
              </div>
            </div>
          </section>

          <section>
            <div className="flex items-start gap-3">
              <Sparkles className="mt-0.5 size-4 shrink-0 text-brand" />
              <div>
                <h2 className="text-lg font-semibold">ИИ-функции и здоровье</h2>
                <p className="mt-2 text-sm text-foreground/90">
                  Ответы ассистента, распознавание фото тарелки, планы питания и
                  тренировок генерируются автоматически и могут содержать
                  ошибки. Результаты носят рекомендательный характер и не
                  заменяют консультацию врача, диетолога или тренера. Перед
                  серьёзными изменениями питания или нагрузок проконсультируйтесь
                  со специалистом — особенно при заболеваниях, беременности или
                  реабилитации.
                </p>
              </div>
            </div>
          </section>

          <section>
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-brand" />
              <div>
                <h2 className="text-lg font-semibold">Данные и приватность</h2>
                <p className="mt-2 text-sm text-foreground/90">
                  Как мы храним и используем ваши данные, описано в{" "}
                  <Link
                    to="/privacy"
                    className="text-brand underline underline-offset-4 hover:opacity-80"
                  >
                    Политике конфиденциальности
                  </Link>
                  . Вы можете выгрузить все свои данные (экспорт) или полностью
                  удалить аккаунт — это доступно в Профиле.
                </p>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-lg font-semibold">Ответственность</h2>
            <p className="mt-2 text-sm text-foreground/90">
              Мы прилагаем разумные усилия, чтобы сервис работал стабильно, но
              не гарантируем бесперебойную работу. Приложение не несёт
              ответственности за результаты, достигнутые (или не достигнутые)
              при использовании рекомендаций, а также за ущерб от форс-мажорных
              обстоятельств. Вы используете сервис на свой риск.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">Изменение условий</h2>
            <p className="mt-2 text-sm text-foreground/90">
              Мы можем обновлять эти условия — при существенных изменениях
              сообщим об этом в приложении. Продолжение использования сервиса
              после обновления означает согласие с новой редакцией.
            </p>
          </section>

          <p className="text-xs text-muted-foreground/80">
            Вопросы по условиям: support@kilo.app. Вопросы по данным:
            privacy@kilo.app.
          </p>
        </div>
      </div>
    </div>
  );
}

// THIS FILE IS READ ONLY. Do not touch this file unless you are correctly adding a new auth provider in accordance to the vly auth documentation

import { convexAuth, getAuthSessionId } from "@convex-dev/auth/server";
import { Anonymous } from "@convex-dev/auth/providers/Anonymous";
import { emailOtp } from "./auth/emailOtp";
import { telegramLogin } from "./auth/telegramLogin";
import { ROLES } from "./schema";


export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [emailOtp, Anonymous, telegramLogin],
  signIn: {
    // Лимит неудачных попыток ввода OTP/пароля в час (встроенный rate-limit
    // @convex-dev/auth, таблица authRateLimits). 10 по умолчанию — ужесточаем
    // до 5. Отправка кода дополнительно ограничена 60-секундным интервалом
    // (см. convex/otpRateLimit.ts), поэтому брутфорс по коду также упирается
    // в перевыпуск кода.
    // (Ключ maxFailedAttempsPerHour с «опечаткой» Attemps — так он назван
    // в @convex-dev/auth; не «исправлять», иначе лимит молча отключится.)
    maxFailedAttempsPerHour: 5,
  },
  callbacks: {
    // Линковка анонимной сессии к email. Дефолтный createOrUpdateUser создаёт
    // НОВОГО пользователя при привязке почты гостем — данные гостя (профиль,
    // логи, план) остаются у старого userId и «теряются». Здесь мы сохраняем
    // userId анонимной сессии: email-аккаунт привязывается к тому же
    // пользователю, и все данные остаются на месте.
    createOrUpdateUser: async (ctx, { existingUserId, type, profile }) => {
      let userId = existingUserId;
      if (userId === null) {
        const sessionId = await getAuthSessionId(ctx);
        if (sessionId !== null) {
          const session = await ctx.db.get(sessionId);
          const sessionUser =
            session === null ? null : await ctx.db.get(session.userId);
          if (sessionUser?.isAnonymous === true) {
            userId = session.userId;
          }
        }
      }
      const { emailVerified, phoneVerified, ...profileRest } = profile;
      // Код подтверждён (email-OTP) — аккаунт перестаёт быть анонимным,
      // email и время верификации сохраняются. (На шаге «отправить код»,
      // type: "email", почта ещё не верифицирована — признак не ставим.)
      const isVerifiedSignIn = type === "verification";
      // Линковка по подтверждённой почте (email-OTP): при входе с другого
      // устройства данные (профиль, логи) не теряются — аккаунт привязывается
      // к существующему пользователю с этим адресом. Только после ввода кода;
      // на шаге «отправить код» линковки не происходит, чтобы не «приклеить»
      // чужой аккаунт к непроверенному адресу.
      if (userId === null) {
        const email =
          typeof profileRest.email === "string" ? profileRest.email : null;
        const verified =
          emailVerified === true || (isVerifiedSignIn && email !== null);
        if (email !== null && verified) {
          // ctx колбэка типизирован GenericMutationCtx<AnyDataModel> (без
          // конкретной схемы), поэтому индексный запрос идёт через локальный
          // структурный каст — как в rateLimit.ts.
          const db = ctx.db as unknown as {
            query(table: string): {
              withIndex(
                name: string,
                fn: (q: { eq(f: string, v: unknown): unknown }) => void,
              ): {
                filter(fn: (q: {
                  field(f: string): unknown;
                  gte(a: unknown, b: unknown): boolean;
                }) => boolean): {
                  take(n: number): Promise<Array<{ _id: string }>>;
                };
              };
            };
          };
          const existing = await db
            .query("users")
            .withIndex("email", (q) => q.eq("email", email))
            .filter((q) =>
              q.gte(q.field("emailVerificationTime"), 1),
            )
            .take(2);
          // Привязываемся только когда кандидат ровно один — при дублях
          // лучше создать нового пользователя, чем «склеить» чужие данные.
          if (existing.length === 1) {
            userId = existing[0]._id as unknown as typeof userId;
          }
        }
      }
      // Поля users-таблицы, известные схеме; profile может содержать и
      // посторонние ключи провайдера — отбрасываем их, чтобы не сломать
      // валидацию при вставке.
      const userData: {
        name?: string;
        image?: string;
        email?: string;
        emailVerificationTime?: number;
        phoneVerificationTime?: number;
        isAnonymous?: boolean;
      } = {
        ...(typeof profileRest.name === "string"
          ? { name: profileRest.name }
          : null),
        ...(typeof profileRest.image === "string"
          ? { image: profileRest.image }
          : null),
        // Провайдер Anonymous шлёт profile { isAnonymous: true } — сохраняем
        // флаг, иначе гостевой пользователь теряет признак анонимности и
        // последующая привязка email (линковка к sessionUser.isAnonymous)
        // не сработает.
        ...(typeof profileRest.isAnonymous === "boolean"
          ? { isAnonymous: profileRest.isAnonymous }
          : null),
        // Email записываем только после подтверждения кода (email-OTP) — на
        // этапе «отправить код» (type: "email") аккаунт ещё не привязан,
        // иначе форма привязки пропала бы раньше времени.
        ...(isVerifiedSignIn && typeof profileRest.email === "string"
          ? { email: profileRest.email }
          : null),
        // Время верификации: явный флаг провайдера после ввода кода.
        ...(emailVerified === true ||
        (isVerifiedSignIn && typeof profileRest.email === "string")
          ? { emailVerificationTime: Date.now() }
          : null),
        ...(phoneVerified === true
          ? { phoneVerificationTime: Date.now() }
          : null),
        // Код подтверждён — аккаунт больше не анонимный (уходит из гостевого
        // флоу: оверлей «привяжите почту» и автовыход при 0 записей).
        ...(isVerifiedSignIn && typeof profileRest.email === "string"
          ? { isAnonymous: false }
          : null),
        // Явный дефолт роли при создании (см. src/convex/roles.ts): новые
        // аккаунты — USER. При patch (уже существующий пользователь) роль
        // не трогаем, чтобы не затирать назначенные админом роли.
        ...(userId === null ? { role: ROLES.USER } : null),
      };
      if (userId !== null) {
        await ctx.db.patch(userId, userData);
        return userId;
      }
      return await ctx.db.insert("users", userData);
    },
  },
});

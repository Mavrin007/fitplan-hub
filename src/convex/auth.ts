// THIS FILE IS READ ONLY. Do not touch this file unless you are correctly adding a new auth provider in accordance to the vly auth documentation

import { convexAuth, getAuthSessionId } from "@convex-dev/auth/server";
import { Anonymous } from "@convex-dev/auth/providers/Anonymous";
import Google from "@auth/core/providers/google";
import { emailOtp } from "./auth/emailOtp";


export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [emailOtp, Google, Anonymous],
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
      // Google OAuth: email приходит уже верифицированным провайдером —
      // аккаунт сразу не-анонимный, email и время верификации сохраняются.
      // (Для email-OTP это происходит только после подтверждения кода.)
      const isVerifiedSignIn = type === "verification" || type === "oauth";
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
        // Email записываем только после подтверждения кода (email-OTP) или
        // сразу для OAuth — на этапе «отправить код» (type: "email") аккаунт
        // ещё не привязан, иначе форма привязки пропала бы раньше времени.
        ...(isVerifiedSignIn && typeof profileRest.email === "string"
          ? { email: profileRest.email }
          : null),
        // Время верификации: явный флаг провайдера, либо Google OAuth с
        // реальным email в профиле (Google подтверждает адрес при выдаче).
        ...(emailVerified === true ||
        (type === "oauth" && typeof profileRest.email === "string")
          ? { emailVerificationTime: Date.now() }
          : null),
        ...(phoneVerified === true
          ? { phoneVerificationTime: Date.now() }
          : null),
        // Код подтверждён / OAuth-вход — аккаунт больше не анонимный (уходит
        // из гостевого флоу: оверлей «привяжите почту» и автовыход при 0
        // записей).
        ...(isVerifiedSignIn && typeof profileRest.email === "string"
          ? { isAnonymous: false }
          : null),
      };
      if (userId !== null) {
        await ctx.db.patch(userId, userData);
        return userId;
      }
      return await ctx.db.insert("users", userData);
    },
  },
});

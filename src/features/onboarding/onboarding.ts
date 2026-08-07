/** Ключ localStorage: пользователь пропустил онбординг в этом браузере. */
export const ONBOARDING_SKIP_KEY = "kilo:onboarding-skipped";

/** Показывать ли визард при первом входе.
 *
 *  Только явное `null` (профиль точно ещё не создан) открывает визард;
 *  `undefined` — это «запрос ещё грузится», и показывать визард в этот момент
 *  нельзя: он бы мигал на каждом заходе пользователя, у которого профиль уже
 *  есть. Дополнительно учитывается пропуск онбординга в этом браузере. */
export function shouldShowOnboarding(
  profile: unknown,
  storage: Storage = localStorage,
): boolean {
  if (profile !== null) return false;
  try {
    return storage.getItem(ONBOARDING_SKIP_KEY) !== "1";
  } catch {
    return true;
  }
}

/** Запомнить пропуск онбординга (не бросаем, если storage недоступен). */
export function rememberOnboardingSkip(storage: Storage = localStorage): void {
  try {
    storage.setItem(ONBOARDING_SKIP_KEY, "1");
  } catch {
    // localStorage может быть недоступен (приватный режим) — не блокируем.
  }
}

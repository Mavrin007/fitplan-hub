/**
 * Клиентский idempotency-ключ: один ключ = одно «намерение» пользователя.
 * Двойной клик, сетевой ретрай или повторная отправка формы с тем же ключом
 * не создадут дубликат записи (сервер проверяет ключ в idempotencyKeys).
 */
export function newIdempotencyKey(scope: string): string {
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `${scope}:${rand}`;
}

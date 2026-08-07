/**
 * Ролевая модель для SaaS-масштабирования.
 *
 * ROLES / roleValidator объявлены в schema.ts, но раньше не использовались —
 * поле `role` в users никто не читал и не писал. Здесь роль становится
 * функциональной:
 *
 * - `myRole` — запрос роли текущего пользователя (null — аноним);
 * - `getUserRole` — общий помощник для других мутаций/запросов (дефолт USER,
 *   если роль ещё не назначена — так старые пользователи не ломаются);
 * - `setUserRole` — единственная мутация, меняющая роль: только для админа,
 *   защита от само-демоции последнего админа.
 *
 * Типичное расширение для SaaS: `requireRole(ctx, [...roles])`-обёртки в
 * конкретных хендлерах (например, «только admin может смотреть статистику
 * всех пользователей»).
 */
import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { ROLES, roleValidator, type Role } from "./schema";

/** Роль пользователя из документа users; дефолт — USER (мягкая миграция).
 *  `db.get` объявлен методом (вариантность параметров — бивариантная), чтобы
 *  хелпер принимал и реальный Convex-контекст, и фейковый ctx.db в тестах. */
export async function getUserRole(
  ctx: { db: { get(id: unknown): unknown } },
  userId: unknown,
): Promise<Role> {
  const user = (await ctx.db.get(userId)) as { role?: Role } | null;
  return user?.role ?? ROLES.USER;
}

/** Текущая роль: null — не авторизован, иначе роль (с дефолтом USER). */
export const myRole = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    return getUserRole(ctx, userId);
  },
});

/** Кидает ConvexError, если текущая роль не входит в разрешённый набор. */
export function assertRole(role: Role | null | undefined, allowed: Role[]): void {
  const current = role ?? ROLES.USER;
  if (!allowed.includes(current)) {
    throw new ConvexError({
      message: `Недостаточно прав: требуется роль ${allowed.join(" / ")}.`,
    });
  }
}

/** Меняет роль пользователя. Доступно только администратору; нельзя лишить
 *  роли последнего админа (иначе доступ к управлению потеряется навсегда). */
export const setUserRole = mutation({
  args: { userId: v.id("users"), role: roleValidator },
  handler: async (ctx, { userId, role }) => {
    const me = await getAuthUserId(ctx);
    if (me === null) throw new ConvexError({ message: "Не авторизован." });
    const myRoleValue = await getUserRole(ctx, me);
    assertRole(myRoleValue, [ROLES.ADMIN]);

    // Защита от потери последнего админа: нельзя снять admin с себя самого,
    // если больше никого с ролью admin нет. Достаточно взять до двух строк
    // (нужно знать лишь «есть ли второй админ»); полный скан таблицы users
    // по полю role без индекса допустим — путь редкий.
    if (userId === me && role !== ROLES.ADMIN) {
      const admins = await ctx.db
        .query("users")
        .filter((q) => q.eq(q.field("role"), ROLES.ADMIN))
        .take(2);
      if (admins.length <= 1) {
        throw new ConvexError({
          message: "Нельзя убрать роль у последнего администратора.",
        });
      }
    }

    await ctx.db.patch(userId, { role });
    return { userId, role };
  },
});

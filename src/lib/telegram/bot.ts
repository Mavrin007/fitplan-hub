/**
 * Мозг Telegram-бота КИЛО: чистый диспетчер апдейтов без зависимостей от
 * Convex. Вход — нормализованный апдейт Telegram, выход — план операций
 * Bot API (sendMessage / editMessageText / answerCallbackQuery).
 *
 * Все данные приходят через интерфейс BotDeps: в проде его реализует
 * `src/convex/telegram.ts` (Convex db), в тестах — фейк. Поэтому сценарии
 * бота (команды, инлайн-кнопки, флоу «поиск → порция → добавить») покрыты
 * юнит-тестами без рантайма Convex и Telegram.
 */

import { escapeHtml, type InlineKeyboardButton } from "./api";

/* ------------------------------------------------------------------ */
/* Типы                                                               */
/* ------------------------------------------------------------------ */

export interface TgUser {
  id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
}

export interface NormalizedUpdate {
  updateId: number;
  kind: "message" | "callback";
  chatId: number;
  from: TgUser;
  /** Текст сообщения (для message). */
  text?: string;
  /** id сообщения (для message). */
  messageId?: number;
  /** callback_data (для callback). */
  callbackData?: string;
  callbackQueryId?: string;
  /** id сообщения, на котором нажата кнопка (для callback). */
  callbackMessageId?: number;
}

/** Продукт из поиска: макросы на 100 г + базовая порция. */
export interface SearchFood {
  key: string;
  name: string;
  unit: string;
  servingGrams: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

/** Недавно записанный продукт: SearchFood + последний размер порции. */
export interface RecentFood extends SearchFood {
  grams: number;
}

export interface DaySummary {
  calories: number;
  caloriesTarget: number;
  protein: number;
  proteinTarget: number;
  carbs: number;
  carbsTarget: number;
  fat: number;
  fatTarget: number;
  waterMl: number;
  waterTarget: number;
}

export interface TodayWorkout {
  focus: string;
  approxMinutes?: number;
  exercises: {
    name: string;
    sets: number;
    reps: string;
    last?: string;
    advice?: string;
  }[];
}

/** Состояние диалога с чатом (одна строка на чат, живёт на сервере). */
export type ChatState =
  | {
      kind: "meal_search";
      query: string;
      results: SearchFood[];
    }
  | {
      kind: "meal_portion";
      food: SearchFood;
      grams: number;
    };

/** Доступ к данным и отправка сообщений — всё, что нужно боту. */
export interface BotDeps {
  /** URL Mini App (https). Когда задан — в меню бота появляется кнопка
   *  «Открыть приложение», ведущая в КИЛО внутри Telegram. */
  webAppUrl?: string;
  findUserByTelegram(telegramUserId: number): Promise<{ userId: string } | null>;
  linkByCode(
    code: string,
    meta: TgUser & { chatId?: number },
  ): Promise<{ ok: boolean; error?: string }>;
  getDaySummary(userId: string): Promise<DaySummary | null>;
  searchFoods(query: string, limit?: number): Promise<SearchFood[]>;
  getRecentFoods(userId: string, limit?: number): Promise<RecentFood[]>;
  addMealEntry(
    userId: string,
    food: SearchFood,
    grams: number,
  ): Promise<{ grams: number; calories: number; protein: number; carbs: number; fat: number }>;
  addWater(
    userId: string,
    amountMl: number,
  ): Promise<{ totalMl: number; goalMl: number }>;
  getTodayWorkout(userId: string): Promise<TodayWorkout | null>;
  getChatState(chatId: number): Promise<ChatState | null>;
  setChatState(chatId: number, state: ChatState): Promise<void>;
  clearChatState(chatId: number): Promise<void>;
}

/** Одна операция Bot API, которую бот просит выполнить. */
export type BotOp =
  | { op: "sendMessage"; chatId: number; text: string; buttons?: InlineKeyboardButton[][] }
  | {
      op: "editMessage";
      chatId: number;
      messageId: number;
      text: string;
      buttons?: InlineKeyboardButton[][] | null;
    }
  | { op: "answerCallback"; callbackQueryId: string; text?: string };

/* ------------------------------------------------------------------ */
/* Нормализация апдейта                                               */
/* ------------------------------------------------------------------ */

/** Сырой апдейт Telegram: record с неизвестными ключами. */
type RawRecord = Record<string, unknown>;

/** unknown → record (или undefined), чтобы безопасно ходить по полям апдейта. */
function asRecord(value: unknown): RawRecord | undefined {
  return value !== null && typeof value === "object"
    ? (value as RawRecord)
    : undefined;
}

/** Разбирает сырой JSON апдейта Telegram в NormalizedUpdate (или null). */
export function normalizeUpdate(raw: unknown): NormalizedUpdate | null {
  const u = asRecord(raw);
  if (!u || typeof u.update_id !== "number") return null;

  const msg = asRecord(u.message);
  if (msg) {
    const chat = asRecord(msg.chat);
    const from = asRecord(msg.from);
    const chatId = typeof chat?.id === "number" ? chat.id : undefined;
    if (typeof chatId !== "number" || !from || typeof from.id !== "number") {
      return null;
    }
    const text = typeof msg.text === "string" ? msg.text : undefined;
    // Без текста (стикеры, фото и т.п.) игнорируем.
    if (text === undefined && msg.message_id !== undefined) {
      // Фото с подписью приходит как caption, а не text — поддерживаем его.
      const caption = typeof msg.caption === "string" ? msg.caption : undefined;
      if (caption === undefined) return null;
      return {
        updateId: u.update_id,
        kind: "message",
        chatId,
        from: userFrom(from),
        text: caption,
        messageId: msg.message_id as number,
      };
    }
    return {
      updateId: u.update_id,
      kind: "message",
      chatId,
      from: userFrom(from),
      text,
      messageId: msg.message_id as number,
    };
  }

  const cq = asRecord(u.callback_query);
  if (cq) {
    const from = asRecord(cq.from);
    const message = asRecord(cq.message);
    const chat = asRecord(message?.chat);
    const chatId = typeof chat?.id === "number" ? chat.id : undefined;
    if (
      !from ||
      typeof from.id !== "number" ||
      typeof chatId !== "number" ||
      typeof cq.id !== "string"
    ) {
      return null;
    }
    return {
      updateId: u.update_id,
      kind: "callback",
      chatId,
      from: userFrom(from),
      callbackData: typeof cq.data === "string" ? cq.data : undefined,
      callbackQueryId: cq.id,
      callbackMessageId:
        typeof message?.message_id === "number" ? message.message_id : undefined,
    };
  }

  return null;
}

function userFrom(from: RawRecord): TgUser {
  return {
    id: from.id as number,
    username:
      typeof from.username === "string" ? from.username : undefined,
    first_name:
      typeof from.first_name === "string" ? from.first_name : undefined,
    last_name: typeof from.last_name === "string" ? from.last_name : undefined,
  };
}

/* ------------------------------------------------------------------ */
/* Обработка апдейта                                                   */
/* ------------------------------------------------------------------ */

export async function handleUpdate(
  update: NormalizedUpdate,
  deps: BotDeps,
): Promise<BotOp[]> {
  if (update.kind === "callback") return handleCallback(update, deps);
  return handleMessage(update, deps);
}

/** «Премиум»-кнопки главного меню (переиспользуются во многих экранах). */
const MENU_BUTTONS: InlineKeyboardButton[][] = [
  [
    { text: "📊 День", callback_data: "day" },
    { text: "💧 Вода", callback_data: "water" },
  ],
  [
    { text: "🍗 Еда", callback_data: "meal" },
    { text: "🏋️ Тренировка", callback_data: "today" },
  ],
  [{ text: "🔄 Недавнее", callback_data: "recent" }],
];

/** Главное меню + кнопка Mini App (если настроен TELEGRAM_MINI_APP_URL). */
function menuButtons(webAppUrl?: string): InlineKeyboardButton[][] {
  const rows: InlineKeyboardButton[][] = [
    [...MENU_BUTTONS[0]],
    [...MENU_BUTTONS[1]],
    [...MENU_BUTTONS[2]],
  ];
  if (webAppUrl) {
    rows.push([{ text: "📱 Открыть приложение", web_app: { url: webAppUrl } }]);
  }
  return rows;
}

const NOT_LINKED_HINT =
  "Сначала привяжите аккаунт: откройте приложение КИЛО → Профиль → Telegram → «Получить код», затем отправьте сюда /link <код>.";

function greeting(user: TgUser): string {
  return user.first_name || user.username || "друг";
}

/* ----------------------------- Сообщения ----------------------------- */

async function handleMessage(
  update: NormalizedUpdate,
  deps: BotDeps,
): Promise<BotOp[]> {
  const { chatId, from } = update;
  const rawText = (update.text ?? "").trim();

  if (rawText.startsWith("/")) {
    const body = rawText.slice(1).split(/\s+/);
    const command = (body[0] ?? "").split("@")[0].toLowerCase();
    const arg = body.slice(1).join(" ").trim();
    return handleCommand(command, arg, update, deps);
  }

  // Текст без команды = поиск еды (главный сценарий «быстро записать»).
  const account = await deps.findUserByTelegram(from.id);
  if (!account) {
    return [
      {
        op: "sendMessage",
        chatId,
        text: "Чтобы я понимал, что вы едите, привяжите аккаунт.\n\n" + NOT_LINKED_HINT,
      },
    ];
  }
  return mealSearch(chatId, account.userId, rawText, deps);
}

async function handleCommand(
  command: string,
  arg: string,
  update: NormalizedUpdate,
  deps: BotDeps,
): Promise<BotOp[]> {
  const { chatId, from } = update;

  switch (command) {
    case "start":
      return startMessage(chatId, from, deps);
    case "help":
      return [{ op: "sendMessage", chatId, text: helpText() }];
    case "menu":
      return [
        {
          op: "sendMessage",
          chatId,
          text: "Меню:",
          buttons: menuButtons(deps.webAppUrl),
        },
      ];
    case "link":
      return linkMessage(chatId, from, arg, deps);
    case "day":
      return dayMessage(chatId, from, deps);
    case "water":
      return waterMessage(chatId, from, deps);
    case "meal": {
      const account = await deps.findUserByTelegram(from.id);
      if (!account) {
        return [{ op: "sendMessage", chatId, text: NOT_LINKED_HINT }];
      }
      return mealSearch(chatId, account.userId, arg, deps);
    }
    case "recent":
      return recentMessage(chatId, from, deps);
    case "today":
      return todayMessage(chatId, from, deps);
    default:
      return [
        {
          op: "sendMessage",
          chatId,
          text: "Не знаю такой команды 🤔\n\n" + helpText(),
        },
      ];
  }
}

async function startMessage(
  chatId: number,
  from: TgUser,
  deps: BotDeps,
): Promise<BotOp[]> {
  const account = await deps.findUserByTelegram(from.id);
  if (account) {
    return [
      {
        op: "sendMessage",
        chatId,
        text:
          `Привет, ${escapeHtml(greeting(from))}! Аккаунт привязан ✅\n\n` +
          "Вот что я умею:\n" +
          "· /day — итог дня\n" +
          "· /meal <продукт> — быстро записать еду (или просто напишите название)\n" +
          "· /water — вода\n" +
          "· /recent — повторить недавнее\n" +
          "· /today — план тренировки на сегодня",
        buttons: menuButtons(deps.webAppUrl),
      },
    ];
  }
  const openAppHint = deps.webAppUrl
    ? "\n\n📱 Или откройте приложение прямо в Telegram — кнопка ниже."
    : "";
  return [
    {
      op: "sendMessage",
      chatId,
      text:
        `Привет, ${escapeHtml(greeting(from))}! Я бот КИЛО — помощник по питанию и тренировкам 💪\n\n` +
        "Чтобы начать, привяжите аккаунт — это займёт минуту:\n" +
        "1. Откройте приложение КИЛО (можно прямо здесь — кнопка ниже)\n" +
        "2. Профиль → Telegram → «Получить код»\n" +
        "3. Отправьте сюда: <b>/link <код></b>" +
        openAppHint,
      buttons: deps.webAppUrl
        ? [[{ text: "📱 Открыть приложение", web_app: { url: deps.webAppUrl } }]]
        : undefined,
    },
  ];
}

function helpText(): string {
  return (
    "Доступные команды:\n" +
    "/day — итог дня (калории, БЖУ, вода)\n" +
    "/meal <продукт> — записать еду\n" +
    "/water — добавить воду\n" +
    "/recent — повторить недавнее\n" +
    "/today — план тренировки на сегодня\n" +
    "/menu — кнопки\n" +
    "/link <код> — привязать аккаунт\n" +
    "/help — эта справка"
  );
}

async function linkMessage(
  chatId: number,
  from: TgUser,
  code: string,
  deps: BotDeps,
): Promise<BotOp[]> {
  const normalized = code.trim().toUpperCase().replace(/\s+/g, "");
  if (!normalized) {
    return [
      {
        op: "sendMessage",
        chatId,
        text:
          "Отправьте код привязки так:\n<b>/link ABC123</b>\n\n" +
          "Где взять код: приложение КИЛО → Профиль → Telegram → «Получить код».",
      },
    ];
  }
  const result = await deps.linkByCode(normalized, { ...from, chatId });
  if (!result.ok) {
    return [
      { op: "sendMessage", chatId, text: result.error ?? "Не удалось привязать аккаунт." },
    ];
  }
  return [
    {
      op: "sendMessage",
      chatId,
      text:
        "✅ Аккаунт привязан! Теперь можно:\n" +
        "· писать названия еды — например: <i>курица 150</i>\n" +
        "· или пользоваться кнопками ниже",
      buttons: menuButtons(deps.webAppUrl),
    },
  ];
}

/* ------------------------------ День ------------------------------ */

async function dayMessage(
  chatId: number,
  from: TgUser,
  deps: BotDeps,
): Promise<BotOp[]> {
  const account = await deps.findUserByTelegram(from.id);
  if (!account) {
    return [{ op: "sendMessage", chatId, text: NOT_LINKED_HINT }];
  }
  const summary = await deps.getDaySummary(account.userId);
  if (!summary) {
    return [
      {
        op: "sendMessage",
        chatId,
        text:
          "Профиль ещё не заполнен — откройте приложение КИЛО и пройдите «С чего начать», " +
          "тогда я смогу считать цели по калориям и воде.",
      },
    ];
  }
  const proteinLeft = Math.max(0, Math.round(summary.proteinTarget - summary.protein));
  const kcalPct =
    summary.caloriesTarget > 0
      ? Math.round((summary.calories / summary.caloriesTarget) * 100)
      : 0;
  const lines = [
    "📊 <b>Итог дня</b>",
    `Ккал: <b>${summary.calories.toLocaleString("ru-RU")}</b> / ${summary.caloriesTarget.toLocaleString("ru-RU")} (${kcalPct}%)`,
    `Белок: ${summary.protein} / ${summary.proteinTarget} г` +
      (proteinLeft > 0 ? ` · осталось <b>${proteinLeft} г</b>` : " · ✅ цель закрыта"),
    `Углеводы: ${summary.carbs} / ${summary.carbsTarget} г`,
    `Жиры: ${summary.fat} / ${summary.fatTarget} г`,
    `💧 Вода: ${summary.waterMl.toLocaleString("ru-RU")} / ${summary.waterTarget.toLocaleString("ru-RU")} мл`,
  ];
  return [
    {
      op: "sendMessage",
      chatId,
      text: lines.join("\n"),
      buttons: [
        [
          { text: "💧 Вода", callback_data: "water" },
          { text: "🍗 Записать еду", callback_data: "meal" },
        ],
        [{ text: "🔄 Обновить", callback_data: "day" }],
      ],
    },
  ];
}

/* ------------------------------ Вода ------------------------------ */

function waterCardText(totalMl: number, goalMl: number): string {
  const pct = goalMl > 0 ? Math.round((totalMl / goalMl) * 100) : 0;
  return (
    "💧 <b>Вода</b>\n" +
    `Сегодня: <b>${totalMl.toLocaleString("ru-RU")}</b> / ${goalMl.toLocaleString("ru-RU")} мл (${pct}%)`
  );
}

const WATER_BUTTONS: InlineKeyboardButton[][] = [
  [
    { text: "+250", callback_data: "water:250" },
    { text: "+500", callback_data: "water:500" },
    { text: "−250", callback_data: "water:-250" },
  ],
  [
    { text: "📊 День", callback_data: "day" },
    { text: "🍗 Еда", callback_data: "meal" },
  ],
];

async function waterMessage(
  chatId: number,
  from: TgUser,
  deps: BotDeps,
): Promise<BotOp[]> {
  const account = await deps.findUserByTelegram(from.id);
  if (!account) {
    return [{ op: "sendMessage", chatId, text: NOT_LINKED_HINT }];
  }
  const summary = await deps.getDaySummary(account.userId);
  if (!summary) {
    return [
      {
        op: "sendMessage",
        chatId,
        text:
          "Сначала заполните профиль в приложении — без него я не знаю норму воды.",
      },
    ];
  }
  return [
    {
      op: "sendMessage",
      chatId,
      text: waterCardText(summary.waterMl, summary.waterTarget),
      buttons: WATER_BUTTONS,
    },
  ];
}

/* ------------------------------ Еда ------------------------------ */

const SEARCH_LIMIT = 8;

function searchListText(query: string, results: SearchFood[]): string {
  if (results.length === 0) {
    return `Ничего не нашёл по «${escapeHtml(query)}» 😔\n\nПопробуйте иначе: например, «курица», «рис», «творог» — или добавьте свой продукт в приложении.`;
  }
  return (
    `🔍 По «${escapeHtml(query)}»:\n` +
    results
      .map(
        (f, i) =>
          `${i + 1}. ${escapeHtml(f.name)} · ${f.calories} ккал · Б ${f.protein} · Ж ${f.fat}`,
      )
      .join("\n") +
    "\n\nНажмите номер, чтобы выбрать продукт:"
  );
}

function searchButtons(results: SearchFood[]): InlineKeyboardButton[][] {
  const rows: InlineKeyboardButton[][] = [];
  for (let i = 0; i < results.length; i += 2) {
    rows.push(
      [
        { text: String(i + 1), callback_data: `meal_pick:${i}` },
        ...(results[i + 1]
          ? [{ text: String(i + 2), callback_data: `meal_pick:${i + 1}` }]
          : []),
      ].map((b) => b as InlineKeyboardButton),
    );
  }
  rows.push([{ text: "🔙 В меню", callback_data: "menu" }]);
  return rows;
}

async function mealSearch(
  chatId: number,
  userId: string,
  query: string,
  deps: BotDeps,
): Promise<BotOp[]> {
  const q = query.trim();
  if (!q) {
    return [
      {
        op: "sendMessage",
        chatId,
        text:
          "Что съели? Напишите название, например:\n<i>/meal курица</i>\n\nИли просто отправьте текст без команды — я сам пойму.",
      },
    ];
  }
  const results = await deps.searchFoods(q, SEARCH_LIMIT);
  await deps.setChatState(chatId, { kind: "meal_search", query: q, results });
  return [
    {
      op: "sendMessage",
      chatId,
      text: searchListText(q, results),
      buttons: searchButtons(results),
    },
  ];
}

/** Формат порции: «150 г» / «2 шт». */
export function formatGrams(unit: string, servingGrams: number, grams: number): string {
  if (unit === "г") return `${Math.round(grams)} г`;
  const pieces = Math.round((grams / servingGrams) * 2) / 2;
  return `${pieces.toLocaleString("ru-RU")} ${unit}`;
}

function portionText(food: SearchFood, grams: number): string {
  const ratio = grams / 100;
  const cal = Math.round(food.calories * ratio);
  const p = Math.round(food.protein * ratio * 10) / 10;
  const c = Math.round(food.carbs * ratio * 10) / 10;
  const f = Math.round(food.fat * ratio * 10) / 10;
  return (
    `🍗 ${escapeHtml(food.name)}\n` +
    `${formatGrams(food.unit, food.servingGrams, grams)} · <b>${cal} ккал</b>\n` +
    `Б ${p} · У ${c} · Ж ${f}`
  );
}

function portionButtons(
  food: SearchFood,
  grams: number,
): InlineKeyboardButton[][] {
  const step = food.unit === "г" ? 50 : food.servingGrams;
  return [
    [
      { text: `−${step}`, callback_data: "meal_gram:-" + step },
      {
        text: formatGrams(food.unit, food.servingGrams, grams),
        callback_data: "meal_gram:0",
      },
      { text: `+${step}`, callback_data: "meal_gram:+" + step },
    ],
    [
      { text: "✅ Добавить", callback_data: "meal_add" },
      { text: "🔙 Назад", callback_data: "meal_back" },
    ],
  ];
}

/* --------------------------- Обратные вызовы --------------------------- */

async function handleCallback(
  update: NormalizedUpdate,
  deps: BotDeps,
): Promise<BotOp[]> {
  const { chatId, from, callbackData, callbackMessageId } = update;
  const callbackQueryId = update.callbackQueryId;
  if (!callbackQueryId) return [];
  if (!callbackData) {
    return answerOnly(callbackQueryId, "Не понял 🤔");
  }

  const account = await deps.findUserByTelegram(from.id);
  const data = callbackData;

  // Не требует аккаунта: меню, справка.
  if (data === "menu") {
    return [
      answer(callbackQueryId),
      {
        op: "sendMessage",
        chatId,
        text: "Меню:",
        buttons: menuButtons(deps.webAppUrl),
      },
    ];
  }

  if (!account) {
    return [
      answer(callbackQueryId, "Сначала привяжите аккаунт (/start)"),
      { op: "sendMessage", chatId, text: NOT_LINKED_HINT },
    ];
  }

  switch (data) {
    case "day": {
      const ops = await dayMessage(chatId, from, deps);
      return [answer(callbackQueryId), ...ops];
    }
    case "water": {
      const ops = await waterMessage(chatId, from, deps);
      return [answer(callbackQueryId), ...ops];
    }
    case "meal":
      return [
        answer(callbackQueryId),
        {
          op: "sendMessage",
          chatId,
          text: "Что съели? Напишите название продукта.",
        },
      ];
    case "today": {
      const ops = await todayMessage(chatId, from, deps);
      return [answer(callbackQueryId), ...ops];
    }
    case "recent": {
      const ops = await recentMessage(chatId, from, deps);
      return [answer(callbackQueryId), ...ops];
    }
    default:
      break;
  }

  // Вода: +250 / +500 / −250.
  const waterMatch = /^water:([+-]?\d+)$/.exec(data);
  if (waterMatch) {
    const delta = Number(waterMatch[1]);
    const result = await deps.addWater(account.userId, delta);
    const text = waterCardText(result.totalMl, result.goalMl);
    if (callbackMessageId) {
      return [
        answer(callbackQueryId),
        {
          op: "editMessage",
          chatId,
          messageId: callbackMessageId,
          text,
          buttons: WATER_BUTTONS,
        },
      ];
    }
    return [answer(callbackQueryId), { op: "sendMessage", chatId, text, buttons: WATER_BUTTONS }];
  }

  // Поиск еды: выбор продукта из списка.
  const pickMatch = /^meal_pick:(\d+)$/.exec(data);
  if (pickMatch) {
    const state = await deps.getChatState(chatId);
    if (!state || state.kind !== "meal_search") {
      return answerOnly(callbackQueryId, "Поиск устарел — начните заново (/meal)");
    }
    const index = Number(pickMatch[1]);
    const food = state.results[index];
    if (!food) return answerOnly(callbackQueryId, "Продукт не найден");
    const grams = food.unit === "г" ? food.servingGrams : food.servingGrams;
    await deps.setChatState(chatId, { kind: "meal_portion", food, grams });
    const text = portionText(food, grams);
    if (callbackMessageId) {
      return [
        answer(callbackQueryId),
        {
          op: "editMessage",
          chatId,
          messageId: callbackMessageId,
          text,
          buttons: portionButtons(food, grams),
        },
      ];
    }
    return [answer(callbackQueryId), { op: "sendMessage", chatId, text, buttons: portionButtons(food, grams) }];
  }

  // Порция: шаг −/+.
  const gramMatch = /^meal_gram:([+-]\d+)$/.exec(data);
  if (gramMatch) {
    const state = await deps.getChatState(chatId);
    if (!state || state.kind !== "meal_portion") {
      return answerOnly(callbackQueryId, "Начните поиск заново (/meal)");
    }
    const delta = Number(gramMatch[1]);
    const min = state.food.unit === "г" ? 10 : state.food.servingGrams;
    const max = 2000;
    const grams = Math.min(max, Math.max(min, state.grams + delta));
    await deps.setChatState(chatId, { ...state, grams });
    const text = portionText(state.food, grams);
    if (callbackMessageId) {
      return [
        answer(callbackQueryId),
        {
          op: "editMessage",
          chatId,
          messageId: callbackMessageId,
          text,
          buttons: portionButtons(state.food, grams),
        },
      ];
    }
    return [answer(callbackQueryId), { op: "sendMessage", chatId, text, buttons: portionButtons(state.food, grams) }];
  }

  // Порция: назад к списку.
  if (data === "meal_back") {
    const state = await deps.getChatState(chatId);
    if (!state || state.kind !== "meal_portion") {
      return answerOnly(callbackQueryId, "Начните поиск заново (/meal)");
    }
    const search = await deps.searchFoods(state.food.name, SEARCH_LIMIT);
    await deps.setChatState(chatId, {
      kind: "meal_search",
      query: state.food.name,
      results: search,
    });
    const text = searchListText(state.food.name, search);
    if (callbackMessageId) {
      return [
        answer(callbackQueryId),
        { op: "editMessage", chatId, messageId: callbackMessageId, text, buttons: searchButtons(search) },
      ];
    }
    return [answer(callbackQueryId), { op: "sendMessage", chatId, text, buttons: searchButtons(search) }];
  }

  // Порция: добавить.
  if (data === "meal_add") {
    const state = await deps.getChatState(chatId);
    if (!state || state.kind !== "meal_portion") {
      return answerOnly(callbackQueryId, "Начните поиск заново (/meal)");
    }
    const added = await deps.addMealEntry(account.userId, state.food, state.grams);
    await deps.clearChatState(chatId);
    const food = state.food;
    const text =
      `✅ Добавлено: ${escapeHtml(food.name)} ${formatGrams(food.unit, food.servingGrams, state.grams)}\n` +
      `${added.calories} ккал · Б ${added.protein} · У ${added.carbs} · Ж ${added.fat}`;
    return [
      answer(callbackQueryId),
      {
        op: "sendMessage",
        chatId,
        text,
        buttons: [
          [
            { text: "📊 День", callback_data: "day" },
            { text: "➕ Ещё", callback_data: "meal" },
          ],
          [{ text: "💧 Вода", callback_data: "water" }],
        ],
      },
    ];
  }

  // Недавнее: повторить запись.
  const recentMatch = /^recent_pick:(\d+)$/.exec(data);
  if (recentMatch) {
    const recent = await deps.getRecentFoods(account.userId, SEARCH_LIMIT);
    const index = Number(recentMatch[1]);
    const item = recent[index];
    if (!item) return answerOnly(callbackQueryId, "Запись не найдена");
    const added = await deps.addMealEntry(account.userId, item, item.grams);
    const text =
      `✅ Добавлено: ${escapeHtml(item.name)} ${formatGrams(item.unit, item.servingGrams, item.grams)}\n` +
      `${added.calories} ккал · Б ${added.protein} · У ${added.carbs} · Ж ${added.fat}`;
    return [
      answer(callbackQueryId),
      {
        op: "sendMessage",
        chatId,
        text,
        buttons: [
          [
            { text: "📊 День", callback_data: "day" },
            { text: "➕ Ещё", callback_data: "recent" },
          ],
        ],
      },
    ];
  }

  return answerOnly(callbackQueryId, "Не понял 🤔");
}

/* ------------------------------ Недавнее ------------------------------ */

async function recentMessage(
  chatId: number,
  from: TgUser,
  deps: BotDeps,
): Promise<BotOp[]> {
  const account = await deps.findUserByTelegram(from.id);
  if (!account) {
    return [{ op: "sendMessage", chatId, text: NOT_LINKED_HINT }];
  }
  const recent = await deps.getRecentFoods(account.userId, SEARCH_LIMIT);
  if (recent.length === 0) {
    return [
      {
        op: "sendMessage",
        chatId,
        text:
          "Пока нечего повторять — сначала запишите еду в приложении или через /meal.",
        buttons: [[{ text: "🍗 Записать еду", callback_data: "meal" }]],
      },
    ];
  }
  const text =
    "🔄 <b>Недавнее</b>\n" +
    recent
      .map(
        (f, i) =>
          `${i + 1}. ${escapeHtml(f.name)} · ${f.calories} ккал`,
      )
      .join("\n") +
    "\n\nНажмите номер, чтобы добавить снова:";
  const rows: InlineKeyboardButton[][] = [];
  for (let i = 0; i < recent.length; i += 2) {
    rows.push(
      [
        { text: String(i + 1), callback_data: `recent_pick:${i}` },
        ...(recent[i + 1]
          ? [{ text: String(i + 2), callback_data: `recent_pick:${i + 1}` }]
          : []),
      ].map((b) => b as InlineKeyboardButton),
    );
  }
  rows.push([{ text: "🔙 В меню", callback_data: "menu" }]);
  return [{ op: "sendMessage", chatId, text, buttons: rows }];
}

/* ------------------------------ Тренировка ------------------------------ */

async function todayMessage(
  chatId: number,
  from: TgUser,
  deps: BotDeps,
): Promise<BotOp[]> {
  const account = await deps.findUserByTelegram(from.id);
  if (!account) {
    return [{ op: "sendMessage", chatId, text: NOT_LINKED_HINT }];
  }
  const workout = await deps.getTodayWorkout(account.userId);
  if (!workout) {
    return [
      {
        op: "sendMessage",
        chatId,
        text:
          "На сегодня плана нет — соберите план в приложении (раздел «Тренировки»), и я буду подсказывать веса.",
        buttons: [[{ text: "📊 День", callback_data: "day" }]],
      },
    ];
  }
  const header =
    `🏋️ <b>Сегодня: ${escapeHtml(workout.focus)}</b>` +
    (workout.approxMinutes ? ` · ~${workout.approxMinutes} мин` : "");
  const lines = workout.exercises.map(
    (ex, i) =>
      `${i + 1}. <b>${escapeHtml(ex.name)}</b> ${ex.sets}×${escapeHtml(ex.reps)}` +
      (ex.last ? ` · было ${escapeHtml(ex.last)}` : "") +
      (ex.advice ? ` → <i>${escapeHtml(ex.advice)}</i>` : ""),
  );
  const text =
    header +
    "\n\n" +
    (lines.length > 0 ? lines.join("\n") : "Упражнений в плане нет 🤷");
  return [
    {
      op: "sendMessage",
      chatId,
      text,
      buttons: [
        [
          { text: "📊 День", callback_data: "day" },
          { text: "💧 Вода", callback_data: "water" },
        ],
      ],
    },
  ];
}

/* ------------------------------ Хелперы ------------------------------ */

function answer(callbackQueryId: string, text?: string): BotOp {
  return { op: "answerCallback", callbackQueryId, ...(text ? { text } : {}) };
}

function answerOnly(callbackQueryId: string, text: string): BotOp[] {
  return [answer(callbackQueryId, text)];
}

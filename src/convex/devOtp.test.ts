/**
 * Юнит-тесты `devOtp` (src/convex/devOtp.ts): dev-перехват кодов.
 *
 * Проверяем серверный гейт (VLY_EMAIL_DEV_CAPTURE=1 + localhost в
 * CONVEX_SITE_URL), вставку и чистку устаревших кодов, а также чтение
 * последнего кода через getByEmail.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getByEmail, insert } from "./devOtp";
import {
  makeConvexDb,
  type ConvexDbMock,
  type ConvexDoc,
} from "@/test/convex-db-mock";

type InsertArgs = { email: string; code: string; createdAt: number };
type GetArgs = { email: string };

const runInsert = (
  insert as unknown as {
    _handler: (ctx: { db: ConvexDbMock }, args: InsertArgs) => Promise<void>;
  }
)._handler;
const runGet = (
  getByEmail as unknown as {
    _handler: (ctx: { db: ConvexDbMock }, args: GetArgs) => Promise<string | null>;
  }
)._handler;

function codeDoc(id: string, email: string, createdAt: number): ConvexDoc {
  return { _id: id, _creationTime: 0, email, code: `code-${id}`, createdAt };
}

describe("devOtp", () => {
  const OLD_SITE = process.env.CONVEX_SITE_URL;
  const OLD_CAPTURE = process.env.VLY_EMAIL_DEV_CAPTURE;

  beforeEach(() => {
    process.env.VLY_EMAIL_DEV_CAPTURE = "1";
    process.env.CONVEX_SITE_URL = "http://127.0.0.1:3210";
  });

  afterEach(() => {
    // Возвращаем окружение, каким оно было до теста.
    if (OLD_SITE === undefined) delete process.env.CONVEX_SITE_URL;
    else process.env.CONVEX_SITE_URL = OLD_SITE;
    if (OLD_CAPTURE === undefined) delete process.env.VLY_EMAIL_DEV_CAPTURE;
    else process.env.VLY_EMAIL_DEV_CAPTURE = OLD_CAPTURE;
  });

  it("при выключенном флаге коды не пишутся и не читаются", async () => {
    process.env.VLY_EMAIL_DEV_CAPTURE = "0";
    const { db, store } = makeConvexDb();
    await runInsert({ db }, { email: "a@b.c", code: "123456", createdAt: 1000 });
    expect(store.devOtpCodes).toHaveLength(0);
    await expect(runGet({ db }, { email: "a@b.c" })).resolves.toBeNull();
  });

  it("на не-localhost сайте перехват выключен (защита от утечки кодов)", async () => {
    process.env.CONVEX_SITE_URL = "https://my-project.convex.cloud";
    const { db, store } = makeConvexDb();
    await runInsert({ db }, { email: "a@b.c", code: "123456", createdAt: 1000 });
    expect(store.devOtpCodes).toHaveLength(0);
  });

  it("localhost в CONVEX_SITE_URL тоже включает перехват", async () => {
    process.env.CONVEX_SITE_URL = "http://localhost:3210";
    const { db, store } = makeConvexDb();
    await runInsert({ db }, { email: "a@b.c", code: "123456", createdAt: 1000 });
    expect(store.devOtpCodes).toHaveLength(1);
  });

  it("вставляет код и чистит коды старше 15 минут для того же адреса", async () => {
    const now = Date.now();
    const { db, store } = makeConvexDb({
      devOtpCodes: [
        codeDoc("old1", "a@b.c", now - 20 * 60 * 1000), // устарел
        codeDoc("old2", "other@x.y", now - 30 * 60 * 1000), // другой адрес
      ],
    });
    await runInsert(
      { db },
      { email: "a@b.c", code: "654321", createdAt: now },
    );

    // Старый код a@b.c удалён, чужой адрес не тронут, новый вставлен.
    expect(store.devOtpCodes.map((d) => d._id)).toEqual(["old2", "devOtpCodes:1"]);
    expect(store.devOtpCodes[1]).toMatchObject({ email: "a@b.c", code: "654321" });
  });

  it("свежие коды того же адреса не чистятся", async () => {
    const now = Date.now();
    const { db, store } = makeConvexDb({
      devOtpCodes: [codeDoc("fresh", "a@b.c", now - 60 * 1000)],
    });
    await runInsert(
      { db },
      { email: "a@b.c", code: "654321", createdAt: now },
    );
    expect(store.devOtpCodes.map((d) => d._id)).toEqual(["fresh", "devOtpCodes:1"]);
  });

  it("getByEmail возвращает последний код адреса", async () => {
    const { db } = makeConvexDb({
      devOtpCodes: [
        codeDoc("c1", "a@b.c", 1000),
        codeDoc("c2", "a@b.c", 2000),
        codeDoc("c3", "other@x.y", 3000),
      ],
    });
    await expect(runGet({ db }, { email: "a@b.c" })).resolves.toBe("code-c2");
  });

  it("getByEmail для неизвестного адреса возвращает null", async () => {
    const { db } = makeConvexDb();
    await expect(runGet({ db }, { email: "nobody@x.y" })).resolves.toBeNull();
  });
});

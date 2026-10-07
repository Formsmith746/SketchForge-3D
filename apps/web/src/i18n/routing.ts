import { cookies, headers } from "next/headers";

import { locales, type Locale } from "./navigation";

/**
 * Определяет язык интерфейса для текущего запроса.
 *
 * Порядок выбора:
 * 1. Выбор пользователя — он хранится в cookie и важнее всего.
 * 2. Язык браузера из заголовка Accept-Language.
 * 3. Первый язык из списка поддерживаемых.
 *
 * Так интерфейс открывается на языке пользователя без ручной настройки.
 *
 * @returns Код языка из списка поддерживаемых.
 */
export async function getRequestLocale(): Promise<Locale> {
  const cookieStore = await cookies();
  const saved = cookieStore.get("NEXT_LOCALE")?.value;
  if (saved && isSupported(saved)) {
    return saved;
  }

  const headerStore = await headers();
  const preferred = parseAcceptLanguage(headerStore.get("accept-language"));
  if (preferred) {
    return preferred;
  }

  return locales[0];
}

/**
 * Проверяет, что код языка поддерживается.
 *
 * @param value Значение из cookie.
 * @returns true, если язык есть в списке.
 */
function isSupported(value: string): value is Locale {
  return (locales as readonly string[]).includes(value);
}

/**
 * Достаёт подходящий язык из заголовка Accept-Language.
 *
 * Заголовок приходит в виде «ru-RU,ru;q=0.9,en;q=0.8». Сравниваем
 * только основную часть кода: «ru-RU» соответствует русскому.
 *
 * @param header Значение заголовка.
 * @returns Код языка или null, если ничего не подошло.
 */
function parseAcceptLanguage(header: string | null): Locale | null {
  if (!header) {
    return null;
  }

  const requested = header
    .split(",")
    .map((part) => {
      const [tag, quality] = part.trim().split(";q=");
      return {
        code: tag.trim().toLowerCase().split("-")[0],
        weight: quality ? Number(quality) : 1,
      };
    })
    .filter((entry) => Number.isFinite(entry.weight))
    .sort((a, b) => b.weight - a.weight);

  for (const entry of requested) {
    if (isSupported(entry.code)) {
      return entry.code;
    }
  }
  return null;
}

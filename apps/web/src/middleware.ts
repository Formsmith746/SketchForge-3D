import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export const locales = ["en", "ru"] as const;
export const defaultLocale = "en";

/**
 * Запоминает язык интерфейса в cookie.
 *
 * Если пользователь ещё не выбирал язык, он берётся из заголовка
 * Accept-Language: браузер сообщает предпочитаемые языки сам.
 * Дальше выбор хранится в cookie и не меняется.
 *
 * @param request Входящий запрос.
 * @returns Ответ с установленным языком при первом посещении.
 */
export function middleware(request: NextRequest) {
  const saved = request.cookies.get("NEXT_LOCALE")?.value;

  if (!saved || !isSupported(saved)) {
    const response = NextResponse.next();
    response.cookies.set("NEXT_LOCALE", detectLocale(request), {
      maxAge: 31536000,
      path: "/",
    });
    return response;
  }

  return NextResponse.next();
}

/**
 * Проверяет, что язык поддерживается.
 *
 * @param value Значение из cookie.
 * @returns true, если язык есть в списке.
 */
function isSupported(value: string): boolean {
  return (locales as readonly string[]).includes(value);
}

/**
 * Определяет язык по заголовку Accept-Language.
 *
 * @param request Входящий запрос.
 * @returns Код языка из списка поддерживаемых.
 */
function detectLocale(request: NextRequest): string {
  const header = request.headers.get("accept-language");
  if (!header) {
    return defaultLocale;
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
  return defaultLocale;
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon|assets|manifold|.*\\.worker\\.ts|.*\\.png|.*\\.webp|.*\\.jpg|.*\\.jpeg|.*\\.gif).*)"],
};

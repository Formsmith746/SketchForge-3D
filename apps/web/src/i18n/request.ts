import { getRequestConfig } from "next-intl/server";
import { getRequestLocale } from "./routing";

export default getRequestConfig(async () => {
  const locale = await getRequestLocale();
  const messages = await import(`./messages/${locale}.json`).then((m) => m.default);
  return { locale, messages };
});

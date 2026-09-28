import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import en from "./locales/en.json";
import zhCN from "./locales/zh-CN.json";

export const locales = ["en", "zh-CN"] as const;

export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "en";

const resources = {
    en: {
        translation: en,
    },
    "zh-CN": {
        translation: zhCN,
    },
};

function getLocale(): Locale {
    if (typeof navigator === "undefined") {
        return defaultLocale;
    }

    return navigator.language.toLowerCase().startsWith("zh")
        ? "zh-CN"
        : defaultLocale;
}

i18n.use(initReactI18next).init({
    resources,
    lng: getLocale(),
    fallbackLng: defaultLocale,
    interpolation: {
        escapeValue: false,
    },
});

export default i18n;
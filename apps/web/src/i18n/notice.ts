import { translatorFor, type Translator } from "./translator";

/**
 * A status line message kept untranslated until it is read: the UI renders it in the current language
 * (again after a language switch), the MCP bridge and the automation state read it in English.
 */
export type Notice = { readonly text: (t: Translator) => string };

/**
 * Call sites name the parameter `t`, shadowing the component's translator, so nothing inside the
 * message can be translated in the UI language by mistake: `notice((t) => t("editor.notice.cut", { count }))`.
 */
export function notice(text: (t: Translator) => string): Notice {
  return { text };
}

const english = translatorFor("en");

export function englishNotice(value: Notice): string {
  return value.text(english);
}

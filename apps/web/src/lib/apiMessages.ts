const ACCEPT_LANGUAGE_RU_PATTERN = /(^|[\s,;])ru([\s,;]|$)/i;

function detectLocaleFromRequest(request: Request): "en" | "ru" {
  const acceptLanguage = request.headers.get("accept-language");
  if (acceptLanguage && ACCEPT_LANGUAGE_RU_PATTERN.test(acceptLanguage)) {
    return "ru";
  }
  return "en";
}

const apiMessages: Record<string, Record<string, string>> = {
  "shared-projects.missingSkf": {
    en: "Shared project upload is missing its .skf file",
    ru: "При загрузке общего проекта отсутствует файл .skf",
  },
  "shared-projects.missingThumbnail": {
    en: "Shared project upload is missing its thumbnail",
    ru: "При загрузке общего проекта отсутствует миниатюра",
  },
  "shared-projects.thumbnailTooLarge": {
    en: "Shared project thumbnail exceeds the 5 MB size limit",
    ru: "Миниатюра общего проекта превышает лимит 5 МБ",
  },
  "shared-projects.thumbnailNotPng": {
    en: "Shared project thumbnail must be a PNG image",
    ru: "Миниатюра общего проекта должна быть изображением PNG",
  },
  "shared-projects.notConfigured": {
    en: "SKETCHFORGE_SHARED_PROJECTS_DIR is not configured",
    ru: "Параметр SKETCHFORGE_SHARED_PROJECTS_DIR не настроен",
  },
  "shared-projects.invalidName": {
    en: "Invalid shared project name",
    ru: "Недопустимое имя общего проекта",
  },
  "shared-projects.notFound": {
    en: "Shared project was not found",
    ru: "Общий проект не найден",
  },
  "shared-projects.thumbnailStale": {
    en: "Shared project thumbnail revision is stale",
    ru: "Устаревшая версия миниатюры общего проекта",
  },
  "shared-projects.thumbnailNotFound": {
    en: "Shared project thumbnail was not found",
    ru: "Миниатюра общего проекта не найдена",
  },
  "shared-projects.couldNotRead": {
    en: "Could not read shared projects",
    ru: "Не удалось прочитать общие проекты",
  },
  "shared-projects.disabled": {
    en: "Shared project storage is disabled",
    ru: "Хранилище общих проектов отключено",
  },
  "shared-projects.sameOriginRequired": {
    en: "Shared projects only accept same-origin saves",
    ru: "Общие проекты принимают сохранения только с того же источника",
  },
  "shared-projects.sameOriginDelete": {
    en: "Shared projects only accept same-origin deletes",
    ru: "Общие проекты принимают удаление только с того же источника",
  },
  "shared-projects.nameRequired": {
    en: "Shared project name is required",
    ru: "Требуется имя общего проекта",
  },
  "shared-projects.beingChanged": {
    en: "This shared project is currently being changed by someone else",
    ru: "Этот общий проект в данный момент изменяется кем-то другим",
  },
  "shared-projects.reloadBeforeDelete": {
    en: "Reload shared projects before deleting so the current revision can be verified",
    ru: "Обновите список общих проектов перед удалением, чтобы проверить текущую версию",
  },
  "shared-projects.changedWhileLoading": {
    en: "The shared project changed after you loaded it. Refresh the shared projects list and try again.",
    ru: "Общий проект изменился после загрузки. Обновите список общих проектов и повторите попытку.",
  },
  "shared-projects.fileTooLarge": {
    en: ".skf file exceeds the shared storage size limit",
    ru: "Файл .skf превышает лимит размера общего хранилища",
  },
  "shared-projects.beingSaved": {
    en: "This shared project is currently being saved by someone else",
    ru: "Этот общий проект в данный момент сохраняется кем-то другим",
  },
  "shared-projects.changedWhileOpened": {
    en: "The shared project changed after you opened it. Reload it or save under a different name.",
    ru: "Общий проект изменился после открытия. Откройте его заново или сохраните под другим именем.",
  },
  "shared-projects.noLongerExists": {
    en: "The shared project no longer exists. Save it under a different name.",
    ru: "Общий проект больше не существует. Сохраните его под другим именем.",
  },
  "shared-projects.couldNotSave": {
    en: "Could not save shared project",
    ru: "Не удалось сохранить общий проект",
  },
  "app-update.sameOriginRequired": {
    en: "Updates only accept same-origin requests",
    ru: "Обновления принимают запросы только с того же источника",
  },
  "app-update.alreadyRequested": {
    en: "An update was already requested. Wait a moment before trying again.",
    ru: "Обновление уже запрошено. Подождите немного перед повторной попыткой.",
  },
  "app-update.alreadyUpToDate": {
    en: "SketchForge is already up to date",
    ru: "SketchForge уже обновлён до последней версии",
  },
  "app-update.couldNotUpdateLocal": {
    en: "Could not update local SketchForge",
    ru: "Не удалось обновить локальный SketchForge",
  },
  "app-update.notConfigured": {
    en: "One-click installation is not configured on this server",
    ru: "Установка в один клик не настроена на этом сервере",
  },
  "app-update.incorrectKey": {
    en: "The update key is incorrect",
    ru: "Ключ обновления неверен",
  },
  "app-update.couldNotStart": {
    en: "Could not start the update",
    ru: "Не удалось запустить обновление",
  },
  "local-download.onlyLocalhost": {
    en: "Local folder downloads are only available from this localhost app",
    ru: "Загрузка в локальную папку доступна только из этого приложения на localhost",
  },
  "local-download.invalidBinary": {
    en: "Invalid binary download request",
    ru: "Недопустимый запрос на скачивание двоичного файла",
  },
  "local-download.fileTooLarge": {
    en: "File is too large for local folder download",
    ru: "Файл слишком большой для загрузки в локальную папку",
  },
  "local-download.invalidRequest": {
    en: "Invalid download request",
    ru: "Недопустимый запрос на скачивание",
  },
  "local-download.chooseFolder": {
    en: "Choose a folder first",
    ru: "Сначала выберите папку",
  },
  "local-download.invalidPath": {
    en: "Invalid file path",
    ru: "Недопустимый путь к файлу",
  },
  "local-download.couldNotSave": {
    en: "Could not save file",
    ru: "Не удалось сохранить файл",
  },
  "project-thumbnail.sameOriginRequired": {
    en: "Project thumbnails require a same-origin request",
    ru: "Миниатюры проектов требуют запроса с того же источника",
  },
  "project-thumbnail.invalidProjectId": {
    en: "Invalid project id",
    ru: "Недопустимый идентификатор проекта",
  },
  "project-thumbnail.notFound": {
    en: "Thumbnail not found",
    ru: "Миниатюра не найдена",
  },
  "project-thumbnail.couldNotSave": {
    en: "Could not save thumbnail",
    ru: "Не удалось сохранить миниатюру",
  },
  "project-thumbnail.tooLarge": {
    en: "Thumbnail image is too large",
    ru: "Изображение миниатюры слишком большое",
  },
  "project-thumbnail.invalidRequest": {
    en: "Invalid thumbnail request",
    ru: "Недопустимый запрос миниатюры",
  },
  "project-thumbnail.invalidImage": {
    en: "Invalid thumbnail image",
    ru: "Недопустимое изображение миниатюры",
  },
  "codex-screenshot.notAvailable": {
    en: "Codex screenshot capture is only available in local development.",
    ru: "Создание снимков Codex доступно только в локальной разработке.",
  },
  "codex-screenshot.localOnly": {
    en: "Codex screenshot capture only accepts local requests.",
    ru: "Создание снимков Codex принимает только локальные запросы.",
  },
  "codex-screenshot.tooLarge": {
    en: "Screenshot image is too large.",
    ru: "Изображение снимка слишком большое.",
  },
  "codex-screenshot.invalidRequest": {
    en: "Invalid screenshot request.",
    ru: "Недопустимый запрос снимка.",
  },
  "codex-screenshot.expectedPng": {
    en: "Expected a PNG data URL.",
    ru: "Ожидался URL с данными PNG.",
  },
};

export function getApiMessage(id: string, locale: "en" | "ru"): string {
  return apiMessages[id]?.[locale] ?? apiMessages[id]?.en ?? id;
}

export function getApiMessagesForRequest(request: Request): Record<string, string> {
  const locale = detectLocaleFromRequest(request);
  const messages: Record<string, string> = {};
  for (const [id, translations] of Object.entries(apiMessages)) {
    messages[id] = translations[locale] ?? translations.en;
  }
  return messages;
}

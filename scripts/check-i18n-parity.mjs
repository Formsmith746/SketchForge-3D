// Проверка паритета ключей перевода.
//
// Сравнивает русский и английский каталоги: пропущенные ключи,
// пустые строки, ключи без перевода. Это главная проверка для
// русификации — 264 теста проекта её не покрывают.
//
// Запуск:
//     node scripts/check-i18n-parity.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const messagesDir = path.join(root, "apps", "web", "src", "i18n", "messages");

/**
 * Собирает плоский список ключей вида "namespace.key.path".
 *
 * @param {object} node - узел каталога.
 * @param {string} prefix - накопленный путь.
 * @returns {string[]} список ключей.
 */
function collectKeys(node, prefix = "") {
  const keys = [];
  for (const [key, value] of Object.entries(node)) {
    const full = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      keys.push(...collectKeys(value, full));
    } else {
      keys.push(full);
    }
  }
  return keys;
}

/**
 * Достаёт значение по пути ключа.
 *
 * @param {object} node - каталог.
 * @param {string} key - путь ключа.
 * @returns {unknown} значение.
 */
function getByKey(node, key) {
  return key.split(".").reduce((acc, part) => (acc ? acc[part] : undefined), node);
}

const en = JSON.parse(fs.readFileSync(path.join(messagesDir, "en.json"), "utf8"));
const ru = JSON.parse(fs.readFileSync(path.join(messagesDir, "ru.json"), "utf8"));

const enKeys = collectKeys(en);
const ruKeys = collectKeys(ru);

const missingInRu = enKeys.filter((key) => !ruKeys.includes(key));
const extraInRu = ruKeys.filter((key) => !enKeys.includes(key));

const emptyRu = ruKeys.filter((key) => {
  const value = getByKey(ru, key);
  return typeof value !== "string" || value.trim() === "";
});

// Ключи, где русский текст совпадает с английским: чаще всего это
// забытый перевод, но бывают и намеренные совпадения.
const sameAsEnglish = ruKeys.filter((key) => {
  const ruValue = getByKey(ru, key);
  const enValue = getByKey(en, key);
  return (
    typeof ruValue === "string" &&
    typeof enValue === "string" &&
    ruValue === enValue &&
    /[A-Za-z]/.test(ruValue) &&
    ruValue.length > 3
  );
});

console.log(`ключей в en.json: ${enKeys.length}`);
console.log(`ключей в ru.json: ${ruKeys.length}`);
console.log();

/**
 * Печатает раздел отчёта.
 *
 * @param {string} title - название раздела.
 * @param {string[]} list - список ключей.
 */
function report(title, list) {
  console.log(`${title}: ${list.length}`);
  for (const key of list.slice(0, 15)) {
    console.log(`    ${key}`);
  }
  if (list.length > 15) {
    console.log(`    ... и ещё ${list.length - 15}`);
  }
  console.log();
}

report("НЕТ в русском каталоге", missingInRu);
report("ЛИШНИЕ в русском каталоге", extraInRu);
report("ПУСТЫЕ значения в русском", emptyRu);
report("СОВПАДАЮТ с английским", sameAsEnglish);

const ok = missingInRu.length === 0 && emptyRu.length === 0;
console.log(ok ? "ПАРИТЕТ В ПОРЯДКЕ" : "ЕСТЬ ПРОБЛЕМЫ");
process.exit(ok ? 0 : 1);

/** Browser-safe exports (no database or Node APIs). */
export { ROLES, type Role, SCOPES, type Scope } from "./auth";
export { DEFAULT_CATEGORIES, TERMINOLOGY, type Terminology } from "./defaults";
export { slugify } from "./ids";
export { isLocale, LOCALE_CODES, LOCALES, type LocaleInfo, localeInfo } from "./locales";

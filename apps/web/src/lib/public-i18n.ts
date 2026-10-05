/**
 * UI strings for the public changelog pages, RSS and the widget, in every supported locale.
 * (The panel uses next-intl; public surfaces use this tiny dictionary instead.)
 */

export type Terminology = "changelog" | "release_notes" | "changes" | "updates" | "news";

export type PublicStrings = {
  allUpdates: string;
  olderUpdates: string;
  newerUpdates: string;
  noUpdates: string;
  noUpdatesHint: string;
  noUpdatesCategory: string;
  filterAll: string;
  filterLabel: string;
  readMore: string;
  poweredBy: string;
  /** Contains `{language}`. */
  fallbackNotice: string;
  rss: string;
  website: string;
  language: string;
  privateTitle: string;
  privateBody: string;
  notFoundTitle: string;
  notFoundBody: string;
  terminology: Record<Terminology, string>;
};

export type WidgetStrings = {
  title: string;
  readMore: string;
  footer: string;
  back: string;
  empty: string;
  newBadge: string;
  poweredBy: string;
};

const PUBLIC: Record<string, PublicStrings> = {
  en: {
    allUpdates: "All updates",
    olderUpdates: "Show older updates",
    newerUpdates: "Back to the latest updates",
    noUpdates: "No updates yet",
    noUpdatesHint: "Check back soon — new updates will appear here.",
    noUpdatesCategory: "No updates in this category yet.",
    filterAll: "All",
    filterLabel: "Filter by category",
    readMore: "Read more",
    poweredBy: "Powered by Featherlog",
    fallbackNotice: "Translation not available — shown in {language}.",
    rss: "RSS feed",
    website: "Website",
    language: "Language",
    privateTitle: "This changelog is private",
    privateBody:
      "You need a valid link to view these updates. Ask the team that shared it with you for a new one.",
    notFoundTitle: "Page not found",
    notFoundBody: "The page you're looking for doesn't exist or has been removed.",
    terminology: {
      changelog: "Changelog",
      release_notes: "Release notes",
      changes: "Changes",
      updates: "Updates",
      news: "News",
    },
  },
  es: {
    allUpdates: "Todas las novedades",
    olderUpdates: "Ver novedades anteriores",
    newerUpdates: "Volver a las últimas novedades",
    noUpdates: "Aún no hay novedades",
    noUpdatesHint: "Vuelve pronto: las nuevas actualizaciones aparecerán aquí.",
    noUpdatesCategory: "Aún no hay novedades en esta categoría.",
    filterAll: "Todas",
    filterLabel: "Filtrar por categoría",
    readMore: "Leer más",
    poweredBy: "Con la tecnología de Featherlog",
    fallbackNotice: "Traducción no disponible: se muestra en {language}.",
    rss: "Feed RSS",
    website: "Sitio web",
    language: "Idioma",
    privateTitle: "Este registro de cambios es privado",
    privateBody:
      "Necesitas un enlace válido para ver estas novedades. Pide uno nuevo al equipo que te lo compartió.",
    notFoundTitle: "Página no encontrada",
    notFoundBody: "La página que buscas no existe o ha sido eliminada.",
    terminology: {
      changelog: "Registro de cambios",
      release_notes: "Notas de la versión",
      changes: "Cambios",
      updates: "Novedades",
      news: "Noticias",
    },
  },
  fr: {
    allUpdates: "Toutes les nouveautés",
    olderUpdates: "Afficher les nouveautés précédentes",
    newerUpdates: "Revenir aux dernières nouveautés",
    noUpdates: "Aucune nouveauté pour l'instant",
    noUpdatesHint: "Revenez bientôt : les nouveautés apparaîtront ici.",
    noUpdatesCategory: "Aucune nouveauté dans cette catégorie pour l'instant.",
    filterAll: "Toutes",
    filterLabel: "Filtrer par catégorie",
    readMore: "Lire la suite",
    poweredBy: "Propulsé par Featherlog",
    fallbackNotice: "Traduction non disponible — affiché en {language}.",
    rss: "Flux RSS",
    website: "Site web",
    language: "Langue",
    privateTitle: "Ce journal des modifications est privé",
    privateBody:
      "Vous avez besoin d'un lien valide pour voir ces nouveautés. Demandez-en un nouveau à l'équipe qui vous l'a partagé.",
    notFoundTitle: "Page introuvable",
    notFoundBody: "La page que vous cherchez n'existe pas ou a été supprimée.",
    terminology: {
      changelog: "Journal des modifications",
      release_notes: "Notes de version",
      changes: "Modifications",
      updates: "Mises à jour",
      news: "Actualités",
    },
  },
  de: {
    allUpdates: "Alle Neuigkeiten",
    olderUpdates: "Ältere Neuigkeiten anzeigen",
    newerUpdates: "Zurück zu den neuesten Neuigkeiten",
    noUpdates: "Noch keine Neuigkeiten",
    noUpdatesHint: "Schau bald wieder vorbei – neue Updates erscheinen hier.",
    noUpdatesCategory: "In dieser Kategorie gibt es noch keine Neuigkeiten.",
    filterAll: "Alle",
    filterLabel: "Nach Kategorie filtern",
    readMore: "Weiterlesen",
    poweredBy: "Bereitgestellt von Featherlog",
    fallbackNotice: "Übersetzung nicht verfügbar – wird auf {language} angezeigt.",
    rss: "RSS-Feed",
    website: "Website",
    language: "Sprache",
    privateTitle: "Dieses Changelog ist privat",
    privateBody:
      "Du benötigst einen gültigen Link, um diese Neuigkeiten zu sehen. Bitte das Team, das ihn mit dir geteilt hat, um einen neuen.",
    notFoundTitle: "Seite nicht gefunden",
    notFoundBody: "Die gesuchte Seite existiert nicht oder wurde entfernt.",
    terminology: {
      changelog: "Changelog",
      release_notes: "Versionshinweise",
      changes: "Änderungen",
      updates: "Updates",
      news: "Neuigkeiten",
    },
  },
  it: {
    allUpdates: "Tutte le novità",
    olderUpdates: "Mostra novità precedenti",
    newerUpdates: "Torna alle ultime novità",
    noUpdates: "Ancora nessuna novità",
    noUpdatesHint: "Torna presto: i nuovi aggiornamenti appariranno qui.",
    noUpdatesCategory: "Ancora nessuna novità in questa categoria.",
    filterAll: "Tutte",
    filterLabel: "Filtra per categoria",
    readMore: "Leggi di più",
    poweredBy: "Realizzato con Featherlog",
    fallbackNotice: "Traduzione non disponibile: mostrato in {language}.",
    rss: "Feed RSS",
    website: "Sito web",
    language: "Lingua",
    privateTitle: "Questo changelog è privato",
    privateBody:
      "Ti serve un link valido per vedere questi aggiornamenti. Chiedine uno nuovo al team che te lo ha condiviso.",
    notFoundTitle: "Pagina non trovata",
    notFoundBody: "La pagina che cerchi non esiste o è stata rimossa.",
    terminology: {
      changelog: "Changelog",
      release_notes: "Note di rilascio",
      changes: "Modifiche",
      updates: "Aggiornamenti",
      news: "Notizie",
    },
  },
  pt: {
    allUpdates: "Todas as novidades",
    olderUpdates: "Mostrar novidades anteriores",
    newerUpdates: "Voltar às últimas novidades",
    noUpdates: "Ainda não há novidades",
    noUpdatesHint: "Volte em breve — as novas atualizações aparecerão aqui.",
    noUpdatesCategory: "Ainda não há novidades nesta categoria.",
    filterAll: "Todas",
    filterLabel: "Filtrar por categoria",
    readMore: "Ler mais",
    poweredBy: "Desenvolvido com Featherlog",
    fallbackNotice: "Tradução indisponível — exibido em {language}.",
    rss: "Feed RSS",
    website: "Site",
    language: "Idioma",
    privateTitle: "Este registro de alterações é privado",
    privateBody:
      "Você precisa de um link válido para ver estas novidades. Peça um novo à equipe que o compartilhou com você.",
    notFoundTitle: "Página não encontrada",
    notFoundBody: "A página que você procura não existe ou foi removida.",
    terminology: {
      changelog: "Registro de alterações",
      release_notes: "Notas de versão",
      changes: "Alterações",
      updates: "Atualizações",
      news: "Notícias",
    },
  },
  nl: {
    allUpdates: "Alle updates",
    olderUpdates: "Oudere updates tonen",
    newerUpdates: "Terug naar de nieuwste updates",
    noUpdates: "Nog geen updates",
    noUpdatesHint: "Kom snel terug — nieuwe updates verschijnen hier.",
    noUpdatesCategory: "Nog geen updates in deze categorie.",
    filterAll: "Alle",
    filterLabel: "Filteren op categorie",
    readMore: "Lees meer",
    poweredBy: "Mogelijk gemaakt door Featherlog",
    fallbackNotice: "Vertaling niet beschikbaar — getoond in het {language}.",
    rss: "RSS-feed",
    website: "Website",
    language: "Taal",
    privateTitle: "Deze changelog is privé",
    privateBody:
      "Je hebt een geldige link nodig om deze updates te bekijken. Vraag het team dat hem met je deelde om een nieuwe.",
    notFoundTitle: "Pagina niet gevonden",
    notFoundBody: "De pagina die je zoekt bestaat niet of is verwijderd.",
    terminology: {
      changelog: "Changelog",
      release_notes: "Release notes",
      changes: "Wijzigingen",
      updates: "Updates",
      news: "Nieuws",
    },
  },
  ca: {
    allUpdates: "Totes les novetats",
    olderUpdates: "Mostra novetats anteriors",
    newerUpdates: "Torna a les últimes novetats",
    noUpdates: "Encara no hi ha novetats",
    noUpdatesHint: "Torna aviat: les noves actualitzacions apareixeran aquí.",
    noUpdatesCategory: "Encara no hi ha novetats en aquesta categoria.",
    filterAll: "Totes",
    filterLabel: "Filtra per categoria",
    readMore: "Llegeix-ne més",
    poweredBy: "Amb la tecnologia de Featherlog",
    fallbackNotice: "Traducció no disponible: es mostra en {language}.",
    rss: "Canal RSS",
    website: "Lloc web",
    language: "Idioma",
    privateTitle: "Aquest registre de canvis és privat",
    privateBody:
      "Necessites un enllaç vàlid per veure aquestes novetats. Demana'n un de nou a l'equip que te'l va compartir.",
    notFoundTitle: "Pàgina no trobada",
    notFoundBody: "La pàgina que cerques no existeix o s'ha eliminat.",
    terminology: {
      changelog: "Registre de canvis",
      release_notes: "Notes de la versió",
      changes: "Canvis",
      updates: "Novetats",
      news: "Notícies",
    },
  },
  pl: {
    allUpdates: "Wszystkie aktualizacje",
    olderUpdates: "Pokaż starsze aktualizacje",
    newerUpdates: "Wróć do najnowszych aktualizacji",
    noUpdates: "Brak aktualizacji",
    noUpdatesHint: "Zajrzyj wkrótce — nowe aktualizacje pojawią się tutaj.",
    noUpdatesCategory: "Brak aktualizacji w tej kategorii.",
    filterAll: "Wszystkie",
    filterLabel: "Filtruj według kategorii",
    readMore: "Czytaj dalej",
    poweredBy: "Działa dzięki Featherlog",
    fallbackNotice: "Tłumaczenie niedostępne — wyświetlono w języku: {language}.",
    rss: "Kanał RSS",
    website: "Strona internetowa",
    language: "Język",
    privateTitle: "Ten dziennik zmian jest prywatny",
    privateBody:
      "Aby zobaczyć te aktualizacje, potrzebujesz ważnego linku. Poproś zespół, który go udostępnił, o nowy.",
    notFoundTitle: "Nie znaleziono strony",
    notFoundBody: "Strona, której szukasz, nie istnieje lub została usunięta.",
    terminology: {
      changelog: "Dziennik zmian",
      release_notes: "Informacje o wydaniu",
      changes: "Zmiany",
      updates: "Aktualizacje",
      news: "Nowości",
    },
  },
  sv: {
    allUpdates: "Alla uppdateringar",
    olderUpdates: "Visa äldre uppdateringar",
    newerUpdates: "Tillbaka till de senaste uppdateringarna",
    noUpdates: "Inga uppdateringar ännu",
    noUpdatesHint: "Titta in snart – nya uppdateringar visas här.",
    noUpdatesCategory: "Inga uppdateringar i den här kategorin ännu.",
    filterAll: "Alla",
    filterLabel: "Filtrera efter kategori",
    readMore: "Läs mer",
    poweredBy: "Drivs av Featherlog",
    fallbackNotice: "Översättning saknas – visas på {language}.",
    rss: "RSS-flöde",
    website: "Webbplats",
    language: "Språk",
    privateTitle: "Den här ändringsloggen är privat",
    privateBody:
      "Du behöver en giltig länk för att se de här uppdateringarna. Be teamet som delade den med dig om en ny.",
    notFoundTitle: "Sidan hittades inte",
    notFoundBody: "Sidan du letar efter finns inte eller har tagits bort.",
    terminology: {
      changelog: "Ändringslogg",
      release_notes: "Versionsinformation",
      changes: "Ändringar",
      updates: "Uppdateringar",
      news: "Nyheter",
    },
  },
  ja: {
    allUpdates: "すべてのアップデート",
    olderUpdates: "以前のアップデートを表示",
    newerUpdates: "最新のアップデートに戻る",
    noUpdates: "まだアップデートはありません",
    noUpdatesHint: "新しいアップデートはここに表示されます。またお越しください。",
    noUpdatesCategory: "このカテゴリにはまだアップデートがありません。",
    filterAll: "すべて",
    filterLabel: "カテゴリで絞り込む",
    readMore: "続きを読む",
    poweredBy: "Powered by Featherlog",
    fallbackNotice: "翻訳はありません — {language}で表示しています。",
    rss: "RSS フィード",
    website: "ウェブサイト",
    language: "言語",
    privateTitle: "この変更履歴は非公開です",
    privateBody:
      "これらのアップデートを見るには有効なリンクが必要です。共有したチームに新しいリンクを依頼してください。",
    notFoundTitle: "ページが見つかりません",
    notFoundBody: "お探しのページは存在しないか、削除されました。",
    terminology: {
      changelog: "変更履歴",
      release_notes: "リリースノート",
      changes: "変更点",
      updates: "アップデート",
      news: "お知らせ",
    },
  },
  zh: {
    allUpdates: "所有更新",
    olderUpdates: "查看更早的更新",
    newerUpdates: "返回最新更新",
    noUpdates: "暂无更新",
    noUpdatesHint: "敬请期待，新的更新将显示在这里。",
    noUpdatesCategory: "此分类下暂无更新。",
    filterAll: "全部",
    filterLabel: "按分类筛选",
    readMore: "阅读更多",
    poweredBy: "由 Featherlog 提供支持",
    fallbackNotice: "暂无翻译 — 以{language}显示。",
    rss: "RSS 订阅",
    website: "网站",
    language: "语言",
    privateTitle: "此更新日志为私密内容",
    privateBody: "你需要有效的链接才能查看这些更新。请向分享链接的团队索取新链接。",
    notFoundTitle: "页面未找到",
    notFoundBody: "你要查找的页面不存在或已被删除。",
    terminology: {
      changelog: "更新日志",
      release_notes: "发行说明",
      changes: "变更",
      updates: "更新",
      news: "新闻",
    },
  },
  ko: {
    allUpdates: "모든 업데이트",
    olderUpdates: "이전 업데이트 보기",
    newerUpdates: "최신 업데이트로 돌아가기",
    noUpdates: "아직 업데이트가 없습니다",
    noUpdatesHint: "곧 다시 확인해 주세요. 새 업데이트가 여기에 표시됩니다.",
    noUpdatesCategory: "이 카테고리에는 아직 업데이트가 없습니다.",
    filterAll: "전체",
    filterLabel: "카테고리별 필터",
    readMore: "더 보기",
    poweredBy: "Powered by Featherlog",
    fallbackNotice: "번역을 사용할 수 없어 {language}(으)로 표시합니다.",
    rss: "RSS 피드",
    website: "웹사이트",
    language: "언어",
    privateTitle: "비공개 변경 로그입니다",
    privateBody:
      "이 업데이트를 보려면 유효한 링크가 필요합니다. 링크를 공유한 팀에 새 링크를 요청하세요.",
    notFoundTitle: "페이지를 찾을 수 없습니다",
    notFoundBody: "찾으시는 페이지가 없거나 삭제되었습니다.",
    terminology: {
      changelog: "변경 로그",
      release_notes: "릴리스 노트",
      changes: "변경 사항",
      updates: "업데이트",
      news: "소식",
    },
  },
  ar: {
    allUpdates: "جميع التحديثات",
    olderUpdates: "عرض التحديثات الأقدم",
    newerUpdates: "العودة إلى أحدث التحديثات",
    noUpdates: "لا توجد تحديثات بعد",
    noUpdatesHint: "عد قريبًا — ستظهر التحديثات الجديدة هنا.",
    noUpdatesCategory: "لا توجد تحديثات في هذه الفئة بعد.",
    filterAll: "الكل",
    filterLabel: "التصفية حسب الفئة",
    readMore: "اقرأ المزيد",
    poweredBy: "مدعوم من Featherlog",
    fallbackNotice: "الترجمة غير متوفرة — معروض باللغة {language}.",
    rss: "موجز RSS",
    website: "الموقع الإلكتروني",
    language: "اللغة",
    privateTitle: "سجل التغييرات هذا خاص",
    privateBody:
      "تحتاج إلى رابط صالح لعرض هذه التحديثات. اطلب رابطًا جديدًا من الفريق الذي شاركه معك.",
    notFoundTitle: "الصفحة غير موجودة",
    notFoundBody: "الصفحة التي تبحث عنها غير موجودة أو تمت إزالتها.",
    terminology: {
      changelog: "سجل التغييرات",
      release_notes: "ملاحظات الإصدار",
      changes: "التغييرات",
      updates: "التحديثات",
      news: "الأخبار",
    },
  },
  he: {
    allUpdates: "כל העדכונים",
    olderUpdates: "הצגת עדכונים ישנים יותר",
    newerUpdates: "חזרה לעדכונים האחרונים",
    noUpdates: "אין עדכונים עדיין",
    noUpdatesHint: "חזרו בקרוב — עדכונים חדשים יופיעו כאן.",
    noUpdatesCategory: "אין עדכונים בקטגוריה זו עדיין.",
    filterAll: "הכול",
    filterLabel: "סינון לפי קטגוריה",
    readMore: "קראו עוד",
    poweredBy: "מופעל על ידי Featherlog",
    fallbackNotice: "התרגום אינו זמין — מוצג ב{language}.",
    rss: "פיד RSS",
    website: "אתר אינטרנט",
    language: "שפה",
    privateTitle: "יומן השינויים הזה פרטי",
    privateBody:
      "יש צורך בקישור תקף כדי לצפות בעדכונים האלה. בקשו קישור חדש מהצוות ששיתף אותו איתכם.",
    notFoundTitle: "הדף לא נמצא",
    notFoundBody: "הדף שחיפשתם אינו קיים או שהוסר.",
    terminology: {
      changelog: "יומן שינויים",
      release_notes: "הערות גרסה",
      changes: "שינויים",
      updates: "עדכונים",
      news: "חדשות",
    },
  },
};

const WIDGET: Record<string, WidgetStrings> = {
  en: {
    title: "Latest updates",
    readMore: "Read the full post",
    footer: "See all updates",
    back: "Back",
    empty: "No updates yet",
    newBadge: "New",
    poweredBy: "Powered by Featherlog",
  },
  es: {
    title: "Últimas novedades",
    readMore: "Leer la publicación completa",
    footer: "Ver todas las novedades",
    back: "Volver",
    empty: "Aún no hay novedades",
    newBadge: "Nuevo",
    poweredBy: "Con la tecnología de Featherlog",
  },
  fr: {
    title: "Dernières nouveautés",
    readMore: "Lire l'article complet",
    footer: "Voir toutes les nouveautés",
    back: "Retour",
    empty: "Aucune nouveauté pour l'instant",
    newBadge: "Nouveau",
    poweredBy: "Propulsé par Featherlog",
  },
  de: {
    title: "Neueste Updates",
    readMore: "Ganzen Beitrag lesen",
    footer: "Alle Updates ansehen",
    back: "Zurück",
    empty: "Noch keine Updates",
    newBadge: "Neu",
    poweredBy: "Bereitgestellt von Featherlog",
  },
  it: {
    title: "Ultime novità",
    readMore: "Leggi l'articolo completo",
    footer: "Vedi tutte le novità",
    back: "Indietro",
    empty: "Ancora nessuna novità",
    newBadge: "Nuovo",
    poweredBy: "Realizzato con Featherlog",
  },
  pt: {
    title: "Últimas novidades",
    readMore: "Ler a publicação completa",
    footer: "Ver todas as novidades",
    back: "Voltar",
    empty: "Ainda não há novidades",
    newBadge: "Novo",
    poweredBy: "Desenvolvido com Featherlog",
  },
  nl: {
    title: "Laatste updates",
    readMore: "Lees het volledige bericht",
    footer: "Bekijk alle updates",
    back: "Terug",
    empty: "Nog geen updates",
    newBadge: "Nieuw",
    poweredBy: "Mogelijk gemaakt door Featherlog",
  },
  ca: {
    title: "Últimes novetats",
    readMore: "Llegeix la publicació completa",
    footer: "Mostra totes les novetats",
    back: "Enrere",
    empty: "Encara no hi ha novetats",
    newBadge: "Nou",
    poweredBy: "Amb la tecnologia de Featherlog",
  },
  pl: {
    title: "Najnowsze aktualizacje",
    readMore: "Przeczytaj cały wpis",
    footer: "Zobacz wszystkie aktualizacje",
    back: "Wstecz",
    empty: "Brak aktualizacji",
    newBadge: "Nowe",
    poweredBy: "Działa dzięki Featherlog",
  },
  sv: {
    title: "Senaste uppdateringarna",
    readMore: "Läs hela inlägget",
    footer: "Se alla uppdateringar",
    back: "Tillbaka",
    empty: "Inga uppdateringar ännu",
    newBadge: "Ny",
    poweredBy: "Drivs av Featherlog",
  },
  ja: {
    title: "最新のアップデート",
    readMore: "記事全文を読む",
    footer: "すべてのアップデートを見る",
    back: "戻る",
    empty: "まだアップデートはありません",
    newBadge: "新着",
    poweredBy: "Powered by Featherlog",
  },
  zh: {
    title: "最新更新",
    readMore: "阅读全文",
    footer: "查看所有更新",
    back: "返回",
    empty: "暂无更新",
    newBadge: "新",
    poweredBy: "由 Featherlog 提供支持",
  },
  ko: {
    title: "최신 업데이트",
    readMore: "전체 글 읽기",
    footer: "모든 업데이트 보기",
    back: "뒤로",
    empty: "아직 업데이트가 없습니다",
    newBadge: "새 글",
    poweredBy: "Powered by Featherlog",
  },
  ar: {
    title: "آخر التحديثات",
    readMore: "اقرأ المنشور كاملًا",
    footer: "عرض جميع التحديثات",
    back: "رجوع",
    empty: "لا توجد تحديثات بعد",
    newBadge: "جديد",
    poweredBy: "مدعوم من Featherlog",
  },
  he: {
    title: "העדכונים האחרונים",
    readMore: "לקריאת הפוסט המלא",
    footer: "לכל העדכונים",
    back: "חזרה",
    empty: "אין עדכונים עדיין",
    newBadge: "חדש",
    poweredBy: "מופעל על ידי Featherlog",
  },
};

const EN_PUBLIC = PUBLIC.en!;
const EN_WIDGET = WIDGET.en!;

export function publicStrings(locale: string): PublicStrings {
  return PUBLIC[locale] ?? EN_PUBLIC;
}

/** Terminology label ("Changelog", "Release notes"…) in `locale`. */
export function terminologyLabel(terminology: string, locale: string) {
  const t = publicStrings(locale).terminology;
  return t[terminology as Terminology] ?? t.changelog;
}

/**
 * Widget strings in `locale`, with per-workspace overrides (empty overrides are ignored;
 * `poweredBy` can't be overridden — use whitelabel instead).
 */
export function widgetStrings(
  locale: string,
  overrides?: Partial<Record<keyof WidgetStrings, string>> | null,
): WidgetStrings {
  const base = { ...EN_WIDGET, ...(WIDGET[locale] ?? {}) };
  if (overrides) {
    for (const [k, v] of Object.entries(overrides)) {
      if (k === "poweredBy" || !(k in base) || typeof v !== "string" || !v.trim()) continue;
      base[k as keyof WidgetStrings] = v.trim();
    }
  }
  return base;
}

/** Localized display name of a language ("inglés" for `en` in Spanish). */
export function languageName(code: string, inLocale: string) {
  try {
    return new Intl.DisplayNames([inLocale], { type: "language" }).of(code) ?? code;
  } catch {
    return code;
  }
}

/** Replaces `{name}` placeholders. */
export function fmt(template: string, vars: Record<string, string>) {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => vars[k] ?? m);
}

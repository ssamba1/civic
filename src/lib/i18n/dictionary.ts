/* ==================================================================
   UI string dictionary, typed, no external dep.
   Covers report-status labels + key CTAs in 4 languages.
   New keys: add to `Dictionary`, fill en, then other locales.
   Missing non-en strings fall back to `en` via `t()` in t.ts.
   ================================================================== */

export type Locale = "en" | "es" | "fr" | "zh";

export interface Dictionary {
  // Status labels
  status_open: string;
  status_dispatched: string;
  status_in_progress: string;
  status_closed: string;
  status_merged: string;
  status_rejected: string;
  // CTAs
  cta_report: string;
  cta_upvote: string;
  cta_view_map: string;
  cta_share: string;
  // Trending page
  trending_title: string;
  trending_subtitle: string;
  trending_empty: string;
  // i18n switcher aria label
  lang_select: string;
}

const en: Dictionary = {
  status_open: "Open",
  status_dispatched: "Dispatched",
  status_in_progress: "In Progress",
  status_closed: "Resolved",
  status_merged: "Merged",
  status_rejected: "Rejected",
  cta_report: "Report a problem",
  cta_upvote: "Upvote",
  cta_view_map: "View on map",
  cta_share: "Share",
  trending_title: "What your city wants fixed most",
  trending_subtitle:
    "Open issues ranked by how many neighbors upvoted them. Add your voice. The top of this list is where the pressure is.",
  trending_empty: "No open reports right now. The whole backlog is clear.",
  lang_select: "Select language",
};

const es: Dictionary = {
  status_open: "Abierto",
  status_dispatched: "Enviado",
  status_in_progress: "En proceso",
  status_closed: "Resuelto",
  status_merged: "Fusionado",
  status_rejected: "Rechazado",
  cta_report: "Reportar un problema",
  cta_upvote: "Apoyar",
  cta_view_map: "Ver en el mapa",
  cta_share: "Compartir",
  trending_title: "Lo que tu ciudad quiere solucionar más",
  trending_subtitle:
    "Problemas abiertos clasificados por cuántos vecinos los apoyaron. Añade tu voz, lo que está en la cima es donde está la presión.",
  trending_empty: "No hay reportes abiertos ahora, todo está al día.",
  lang_select: "Seleccionar idioma",
};

const fr: Dictionary = {
  status_open: "Ouvert",
  status_dispatched: "Envoyé",
  status_in_progress: "En cours",
  status_closed: "Résolu",
  status_merged: "Fusionné",
  status_rejected: "Rejeté",
  cta_report: "Signaler un problème",
  cta_upvote: "Soutenir",
  cta_view_map: "Voir sur la carte",
  cta_share: "Partager",
  trending_title: "Ce que votre ville veut réparer le plus",
  trending_subtitle:
    "Problèmes ouverts classés par nombre de voisins qui les ont soutenus. Ajoutez votre voix, le sommet de cette liste est là où se trouve la pression.",
  trending_empty: "Aucun rapport ouvert pour l'instant, le carnet est vide.",
  lang_select: "Choisir la langue",
};

const zh: Dictionary = {
  status_open: "未处理",
  status_dispatched: "已派遣",
  status_in_progress: "处理中",
  status_closed: "已解决",
  status_merged: "已合并",
  status_rejected: "已拒绝",
  cta_report: "举报问题",
  cta_upvote: "支持",
  cta_view_map: "在地图上查看",
  cta_share: "分享",
  trending_title: "城市居民最想解决的问题",
  trending_subtitle:
    "按邻居支持数量排名的未解决问题。添加您的声音,, 列表顶部是关注最多的地方。",
  trending_empty: "目前没有未解决的报告,, 待办事项全部完成。",
  lang_select: "选择语言",
};

export const DICTIONARIES: Record<Locale, Dictionary> = { en, es, fr, zh };

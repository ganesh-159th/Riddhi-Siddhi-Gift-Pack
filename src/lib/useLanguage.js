import { useTranslation } from "react-i18next";

export const LANGUAGES = [
  { code: "en", label: "EN", full: "English" },
  { code: "te", label: "తెలుగు", full: "Telugu" },
  { code: "hi", label: "हिंदी", full: "Hindi" },
];

export function useLanguage() {
  const { i18n } = useTranslation();
  return {
    lang: i18n.language,
    setLang: (code) => i18n.changeLanguage(code),
  };
}

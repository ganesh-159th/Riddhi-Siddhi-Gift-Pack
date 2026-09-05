import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "../locales/en.json";
import te from "../locales/te.json";
import hi from "../locales/hi.json";

const LANG_KEY = "rsp-lang";

const savedLang =
  typeof localStorage !== "undefined" ? localStorage.getItem(LANG_KEY) : null;

const browserLang = navigator.language || navigator.userLanguage || "";
const detected = savedLang || (browserLang.startsWith("te") ? "te" : browserLang.startsWith("hi") ? "hi" : "en");

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    te: { translation: te },
    hi: { translation: hi },
  },
  lng: detected,
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

i18n.on("languageChanged", (lng) => {
  document.documentElement.lang = lng;
  localStorage.setItem(LANG_KEY, lng);
});

document.documentElement.lang = i18n.language;

export default i18n;

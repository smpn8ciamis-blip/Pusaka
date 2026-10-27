// src/hooks/useStudentDashboardView.ts
// Menentukan tampilan dashboard siswa: desktop (layar >= 1024px) atau mobile.
// Di layar lebar pengguna dapat memilih tampilan mobile; pilihan diingat di peramban.
import { useCallback, useEffect, useState } from "react";

const QUERY = "(min-width: 1024px)";
const KEY = "student-dashboard-view";

const readWide = () => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(QUERY).matches;
const readPref = (): "auto" | "mobile" => {
  try { return localStorage.getItem(KEY) === "mobile" ? "mobile" : "auto"; } catch { return "auto"; }
};

export function useStudentDashboardView() {
  const [wide, setWide] = useState(readWide);
  const [pref, setPref] = useState<"auto" | "mobile">(readPref);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia(QUERY);
    const onChange = () => setWide(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const setPreference = useCallback((p: "auto" | "mobile") => {
    setPref(p);
    try { localStorage.setItem(KEY, p); } catch { /* abaikan */ }
  }, []);

  return {
    /** true = tampilkan layout desktop (sidebar + grid) */
    isDesktop: wide && pref !== "mobile",
    /** true = layar cukup lebar sehingga pengguna boleh memilih desktop/mobile */
    canChoose: wide,
    setPreference,
  };
}

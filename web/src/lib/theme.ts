import { useCallback, useEffect, useState } from "react";

export type Theme = "light" | "dark";

const KEY = "gb-theme";

function stored(): Theme | null {
  try {
    const t = localStorage.getItem(KEY);
    return t === "light" || t === "dark" ? t : null;
  } catch {
    return null;
  }
}

const system = (): Theme => (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");

/** The theme lives on <html data-theme>, set before first paint by index.html. Defaults to the system. */
export function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(() => (document.documentElement.dataset.theme as Theme) ?? stored() ?? system());

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => stored() === null && setTheme(system());
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const toggle = useCallback(() => {
    setTheme((t) => {
      const next = t === "dark" ? "light" : "dark";
      try {
        localStorage.setItem(KEY, next);
      } catch {
        /* private mode: the choice lasts for this page only */
      }
      return next;
    });
  }, []);

  return [theme, toggle];
}

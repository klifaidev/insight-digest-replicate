import { useEffect } from "react";

export function usePageTitle(title?: string) {
  useEffect(() => {
    document.title = title
      ? `${title} — Pricing Analytics`
      : "Pricing Analytics — Harald";
    return () => {
      document.title = "Pricing Analytics — Harald";
    };
  }, [title]);
}

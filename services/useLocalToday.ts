import { useEffect, useState } from "react";
import { localDateKey } from "./localDate";
/** Local calendar boundaries, including a page left open across midnight. */
export function useLocalToday() {
  const [today, setToday] = useState(localDateKey);
  useEffect(() => {
    let midnightTimer: ReturnType<typeof setTimeout>;
    const update = () => {
      const now = new Date();
      setToday(localDateKey(now));
      clearTimeout(midnightTimer);
      const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      midnightTimer = setTimeout(update, midnight.getTime() - now.getTime() + 10);
    };
    update();
    const timer = window.setInterval(update, 60000);
    window.addEventListener("focus", update);
    window.addEventListener("pageshow", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      clearInterval(timer);
      clearTimeout(midnightTimer);
      window.removeEventListener("focus", update);
      window.removeEventListener("pageshow", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, []);
  return today;
}

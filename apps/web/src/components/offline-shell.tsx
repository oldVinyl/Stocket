"use client";
import { useEffect } from "react";
export default function OfflineShell() {
  useEffect(() => {
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator)
      void navigator.serviceWorker.register("/sw.js");
  }, []);
  return null;
}

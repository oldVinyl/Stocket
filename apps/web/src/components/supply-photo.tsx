"use client";
import { useEffect, useState } from "react";
import { openDB } from "idb";
const photoDB = () =>
  openDB("stocket-catalog-photos", 1, {
    upgrade(db) {
      db.createObjectStore("photos");
    },
  });
export default function SupplyPhoto({
  path,
  fallback,
}: {
  path?: string | null;
  fallback: React.ReactNode;
}) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let alive = true,
      url: string | undefined;
    setSrc(null);
    if (!path) return;
    if (path.startsWith("data:image/")) {
      setSrc(path);
      return;
    }
    void (async () => {
      try {
        const db = await photoDB();
        let blob = (await db.get("photos", path)) as Blob | undefined;
        if (!blob) {
          const res = await fetch(
            "/api/image?path=" + encodeURIComponent(path),
          );
          if (!res.ok) return;
          blob = await res.blob();
          await db.put("photos", blob, path);
        }
        url = URL.createObjectURL(blob);
        if (alive) setSrc(url);
      } catch {}
    })();
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [path]);
  return src ? (
    <img
      className="supply-photo"
      src={src}
      alt=""
      onError={() => setSrc(null)}
    />
  ) : (
    fallback
  );
}

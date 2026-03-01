"use client";

import { useEffect, useRef } from "react";
import { useAuth } from "@/lib/auth-context";

declare global {
  interface Window {
    adsbygoogle: unknown[];
  }
}

/** Load the AdSense script once globally (only when first AdUnit mounts). */
let _scriptLoaded = false;
function ensureAdsenseScript(client: string) {
  if (_scriptLoaded) return;
  _scriptLoaded = true;
  const s = document.createElement("script");
  s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${client}`;
  s.async = true;
  s.crossOrigin = "anonymous";
  document.head.appendChild(s);
}

interface AdUnitProps {
  slot: string;
  format?: "auto" | "fluid" | "rectangle";
  className?: string;
}

export function AdUnit({ slot, format = "auto", className = "" }: AdUnitProps) {
  const { isAuthenticated } = useAuth();
  const adRef = useRef<HTMLModElement>(null);
  const pushed = useRef(false);

  const client = process.env.NEXT_PUBLIC_ADSENSE_CLIENT;

  useEffect(() => {
    if (!client || isAuthenticated || pushed.current) return;
    ensureAdsenseScript(client);
    // Wait for script to load before pushing
    const timer = setTimeout(() => {
      try {
        (window.adsbygoogle = window.adsbygoogle || []).push({});
        pushed.current = true;
      } catch {
        // AdSense not loaded yet
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [client, isAuthenticated]);

  // Don't render for logged-in users or if no client ID
  if (!client || isAuthenticated) return null;

  return (
    <div className={className}>
      <ins
        ref={adRef}
        className="adsbygoogle"
        style={{ display: "block" }}
        data-ad-client={client}
        data-ad-slot={slot}
        data-ad-format={format}
        data-full-width-responsive="true"
      />
    </div>
  );
}

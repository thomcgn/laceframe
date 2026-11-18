import { useEffect, useState, useSyncExternalStore } from "react";
import { AppLifecycle } from "./app-lifecycle";
import { initializeApplication } from "./components/SplashScreen";
export function useAppLifecycle() {
  const [lifecycle] = useState(() => new AppLifecycle(initializeApplication));
  const state = useSyncExternalStore(
    lifecycle.subscribe,
    lifecycle.getSnapshot,
  );
  useEffect(() => {
    lifecycle.displayed();
    void lifecycle.initialize();
  }, [lifecycle]);
  useEffect(() => {
    if (state.phase !== "booting") return;
    let frame = 0,
      live = true;
    const tick = () => {
      if (!live) return;
      lifecycle.tick();
      if (lifecycle.getSnapshot().phase === "booting")
        frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      live = false;
      cancelAnimationFrame(frame);
    };
  }, [lifecycle, state.phase]);
  return { lifecycle, state };
}

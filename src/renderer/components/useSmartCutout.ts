import { useEffect, useRef, useState } from "react";
import {
  type CutoutDraft,
  type CutoutHistory,
  type CutoutImage,
  defaultCutoutSettings,
  commitCutout,
  undoCutout,
  redoCutout,
} from "../../shared/smart-cutout";
export function useSmartCutout(
  enabled: boolean,
  id: string,
  width: number,
  height: number,
  initial?: Uint8Array,
  recipeId?: string,
) {
  const empty: CutoutDraft = {
    settings: defaultCutoutSettings(),
    manual: new Uint8Array(),
    protected: new Uint8Array(),
    forced: new Uint8Array(),
  };
  const [history, setHistory] = useState<CutoutHistory>({
    past: [],
    present: empty,
    future: [],
  });
  const current = useRef(history);
  const [image, setImage] = useState<CutoutImage>(),
    [error, setError] = useState(""),
    [dirty, setDirty] = useState(false),
    [running, setRunning] = useState(false),
    [cancelled, setCancelled] = useState(false);
  const [result, setResult] = useState<{
    weights: Uint8Array;
    selection: Uint8Array;
    protectedMask: Uint8Array;
    forcedMask: Uint8Array;
    limited: Uint8Array;
    polygonProtected: Uint8Array;
    polygonForced: Uint8Array;
    conflicts: number;
    removed: number;
    durationMs: number;
    draft: CutoutDraft;
  }>();
  const worker = useRef<Worker | undefined>(undefined),
    wanted = useRef<{ draft: CutoutDraft; serial: number } | undefined>(
      undefined,
    ),
    serial = useRef(0),
    inflight = useRef(false),
    sentImage = useRef(false);
  const stop = () => {
    worker.current?.terminate();
    worker.current = undefined;
    inflight.current = false;
    sentImage.current = false;
    serial.current++;
    setRunning(false);
  };
  function queue(draft: CutoutDraft) {
    // Invalidate synchronously, before a queued old worker message can arrive.
    wanted.current = { draft, serial: ++serial.current };
    setRunning(true);
    setError("");
  }
  function update(next: CutoutDraft, record = true, previous?: CutoutDraft) {
    const h = record
      ? commitCutout(current.current, next, previous)
      : { ...current.current, present: next };
    current.current = h;
    if (record) setHistory(h);
    queue(next);
    setDirty(true);
    setCancelled(false);
  }
  function undo() {
    const h = undoCutout(current.current);
    current.current = h;
    setHistory(h);
    queue(h.present);
    setDirty(true);
    setCancelled(false);
  }
  function redo() {
    const h = redoCutout(current.current);
    current.current = h;
    setHistory(h);
    queue(h.present);
    setDirty(true);
    setCancelled(false);
  }
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    void (async () => {
      const source = await window.laceframe.cutoutSource(id);
      if (!source.ok) throw new Error(source.error);
      let d: CutoutDraft = {
        settings: defaultCutoutSettings(),
        manual: initial
          ? new Uint8Array(initial)
          : new Uint8Array(width * height).fill(255),
        protected: new Uint8Array(width * height),
        forced: new Uint8Array(width * height),
      };
      if (recipeId) {
        const r = await window.laceframe.smartCutoutRecipe(recipeId);
        if (!r.ok) throw new Error(r.error);
        d = r.value;
      }
      if (live) {
        const h = { past: [], present: d, future: [] };
        current.current = h;
        setHistory(h);
        setImage(source.value);
      }
    })().catch((e) => {
      if (live)
        setError(
          e instanceof Error ? e.message : "Bild konnte nicht geladen werden",
        );
    });
    return () => {
      live = false;
      stop();
    };
  }, [enabled, id, width, height, recipeId]);
  useEffect(() => {
    if (!enabled || !image || cancelled) return;
    queue(current.current.present);
  }, [enabled, image, cancelled]);
  useEffect(() => {
    if (!enabled || !image) return;
    const interval = window.setInterval(() => {
      if (cancelled || inflight.current || !wanted.current) return;
      const request = wanted.current;
      wanted.current = undefined;
      if (!worker.current) {
        const w = new Worker(
          new URL("../workers/smart-cutout.worker.ts", import.meta.url),
          { type: "module" },
        );
        worker.current = w;
        w.onerror = () => {
          stop();
          wanted.current = undefined;
          setCancelled(true);
          setError(
            "Freistellungs-Worker fehlgeschlagen. Neu berechnen oder Dialog erneut öffnen.",
          );
        };
      }
      // Handler must retain the draft for this exact request, not the first worker request.
      const w = worker.current;
      w.onmessage = (e) => {
        inflight.current = false;
        if (
          e.data.serial !== serial.current ||
          request.draft !== current.current.present
        )
          return;
        if (e.data.error) {
          setError(e.data.error);
          setRunning(false);
        } else {
          setResult({ ...e.data, draft: request.draft });
          setRunning(false);
        }
      };
      inflight.current = true;
      w.postMessage({ ...request, ...(!sentImage.current ? { image } : {}) });
      sentImage.current = true;
    }, 40);
    return () => window.clearInterval(interval);
  }, [enabled, image, cancelled]);
  return {
    history,
    image,
    error,
    dirty,
    result,
    running,
    cancelled,
    update,
    undo,
    redo,
    ready:
      !!image &&
      !!result &&
      !running &&
      !error &&
      !cancelled &&
      result.draft === current.current.present,
    cancel: () => {
      stop();
      wanted.current = undefined;
      setCancelled(true);
    },
    resume: () => {
      setCancelled(false);
      wanted.current = {
        draft: current.current.present,
        serial: ++serial.current,
      };
      setRunning(true);
      setError("");
    },
    current,
  };
}

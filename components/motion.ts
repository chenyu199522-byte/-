import { RefObject, useLayoutEffect, useRef, useState } from "react";
import "./motion.css";

// Input modality affects only presentation, never the action or its timing.
let keyboard = true;
const setInput = (next: boolean) => {
  keyboard = next;
  const value = next ? "keyboard" : "pointer";
  if (document.documentElement.dataset.motionInput !== value) {
    document.documentElement.dataset.motionInput = value;
  }
};
if (typeof document !== "undefined") {
  document.addEventListener("pointerdown", () => setInput(false), true);
  document.addEventListener("keydown", () => setInput(true), true);
}
export const instantMotion = () => keyboard;
export const reducedMotion = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Keep an exiting surface briefly, inert; retarget from the live presentation. */
export function useSurfacePresence(open: boolean, ref: RefObject<HTMLElement>, kind: "menu" | "modal" | "toast") {
  const [present, setPresent] = useState(open);
  const active = useRef<Animation[]>([]);
  const revision = useRef(0);
  const latestOpen = useRef(open);
  latestOpen.current = open;
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const token = ++revision.current;
    const root = kind === "modal" ? node.firstElementChild as HTMLElement : node;
    if (!root) { setPresent(false); return; }
    const panel = kind === "modal" && root.tagName !== "DIALOG" ? root.firstElementChild as HTMLElement : root;
    const wasAnimating = active.current.some(a => a.playState === "running");
    const opacity = wasAnimating ? getComputedStyle(root).opacity : open ? "0" : "1";
    const restingTransform = kind === "toast" ? "translateY(12px)" : "scale(0.97)";
    const transform = wasAnimating && panel ? getComputedStyle(panel).transform : open ? restingTransform : "none";
    active.current.forEach(a => a.cancel());
    active.current = [];
    setPresent(open || present);
    if (instantMotion() || document.hidden || typeof root.animate !== "function") { setPresent(open); return; }
    const reduced = reducedMotion();
    const duration = reduced ? 150 : kind === "menu" || kind === "toast" ? (open ? 180 : 150) : (open ? 220 : 180);
    const easing = getComputedStyle(node).getPropertyValue("--ease-out").trim() || "cubic-bezier(0.23,1,0.32,1)";
    const options: KeyframeAnimationOptions = {duration, easing, fill:"both"};
    active.current.push(root.animate([{opacity}, {opacity:open ? 1 : 0}], options));
    if (panel && !reduced) active.current.push(panel.animate([{transform}, {transform:open ? "none" : restingTransform}], options));
    Promise.all(active.current.map(a => a.finished)).then(() => {
      if (revision.current !== token) return;
      active.current.forEach(a => a.cancel());
      active.current = [];
      setPresent(open);
    }).catch(() => { /* A new gesture interrupted this transition. */ });
  }, [open]);
  useLayoutEffect(() => {
    const media = typeof matchMedia === "function" ? matchMedia("(prefers-reduced-motion: reduce)") : null;
    const settle = () => {
      if (!active.current.length) return;
      ++revision.current;
      active.current.forEach(a => a.cancel());
      active.current = [];
      setPresent(latestOpen.current);
    };
    // A preference change or a minimized app must not leave a paused outgoing
    // surface around or resume an unwanted scale animation on return.
    const preferenceChanged = () => { if (media?.matches) settle(); };
    const visibilityChanged = () => { if (document.hidden) settle(); };
    media?.addEventListener("change", preferenceChanged);
    document.addEventListener("visibilitychange", visibilityChanged);
    return () => {
      ++revision.current;
      active.current.forEach(a => a.cancel());
      active.current = [];
      media?.removeEventListener("change", preferenceChanged);
      document.removeEventListener("visibilitychange", visibilityChanged);
    };
  }, []);
  return open || present;
}

import { useEffect, useRef } from "react";

export function useRevealSelf() {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.classList.add("js");
    let timeout = null;
    if (typeof IntersectionObserver === "undefined") {
      el.classList.add("visible");
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            el.classList.add("visible");
            io.disconnect();
            clearTimeout(timeout);
          }
        });
      },
      { threshold: 0.12 }
    );
    io.observe(el);
    // Safety net: if the observer never fires (e.g. BFCache restore on
    // mobile Safari), never leave content invisible — reveal it anyway.
    timeout = setTimeout(() => {
      el.classList.add("visible");
      io.disconnect();
    }, 2500);
    return () => {
      clearTimeout(timeout);
      io.disconnect();
    };
  }, []);

  return ref;
}

export default function Reveal({ as: Tag = "div", className = "", delay = 0, children, ...rest }) {
  const ref = useRevealSelf();

  return (
    <Tag
      ref={ref}
      className={`reveal ${delay ? `reveal-delay-${delay}` : ""} ${className}`.trim()}
      {...rest}
    >
      {children}
    </Tag>
  );
}

export const delayClass = (i) =>
  ["", "reveal-delay-1", "reveal-delay-2", "reveal-delay-3"][i % 4];

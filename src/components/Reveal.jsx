import { useEffect, useRef } from "react";

export function useRevealSelf() {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            el.classList.add("visible");
            io.disconnect();
          }
        });
      },
      { threshold: 0.12 }
    );
    io.observe(el);
    return () => io.disconnect();
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

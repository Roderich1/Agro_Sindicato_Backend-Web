import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import './picker.css';

/**
 * Selector de variantes según `prototype/PICKER.md`, al pie de la letra:
 * píldora oscura abajo al centro, teclas 1–N y ←/→, R vuelve a montar, `?v=`
 * conserva la elección. Sin botón de repetir: ninguna variante tiene
 * animación de entrada. `position="top"` es la única modificación admitida
 * (cuando la parte inferior está ocupada, como la barra del teléfono).
 */
export function ProtoPicker({
  names,
  current,
  onSelect,
  onReplay,
  position,
}: {
  names: readonly string[];
  current: number;
  onSelect: (index: number) => void;
  onReplay: () => void;
  position?: 'top';
}) {
  const navRef = useRef<HTMLElement>(null);
  const highlightRef = useRef<HTMLSpanElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [ready, setReady] = useState(false);

  useLayoutEffect(() => {
    const move = () => {
      const el = itemRefs.current[current];
      const highlight = highlightRef.current;
      if (!el || !highlight) return;
      highlight.style.width = `${el.offsetWidth}px`;
      highlight.style.transform = `translateX(${el.offsetLeft}px)`;
    };
    move();
    window.addEventListener('resize', move);
    return () => window.removeEventListener('resize', move);
  }, [current, names.length]);

  // El deslizamiento se activa después del primer pintado: la carga no anima.
  useEffect(() => {
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => setReady(true));
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.isContentEditable)) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const num = parseInt(event.key, 10);
      if (num >= 1 && num <= names.length) onSelect(num - 1);
      else if (event.key === 'ArrowRight') onSelect((current + 1) % names.length);
      else if (event.key === 'ArrowLeft') onSelect((current - 1 + names.length) % names.length);
      else if (event.key === 'r' || event.key === 'R') onReplay();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [current, names.length, onSelect, onReplay]);

  return (
    <nav ref={navRef} className="proto-picker" aria-label="Prototype variants" data-ready={ready ? '' : undefined} data-position={position}>
      <span ref={highlightRef} className="proto-picker-highlight" aria-hidden="true" />
      {names.map((name, index) => (
        <button
          key={name}
          type="button"
          ref={(el) => {
            itemRefs.current[index] = el;
          }}
          className="proto-picker-item"
          data-active={index === current ? '' : undefined}
          aria-current={index === current ? 'true' : undefined}
          onClick={() => onSelect(index)}
        >
          {name}
        </button>
      ))}
    </nav>
  );
}

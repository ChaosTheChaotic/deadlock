import { useEffect, useRef, useState } from "react";

/**
 * Hook that delays updates until some time since last change
 * @param val Value to debounce
 * @param delay Delay in ms
 * @returns Debounced value
*/
export function useDebounce<T>(val: T, delay: number): T {
  const [d, sd] = useState(val);
  const tr = useRef<number | null>(null);

  useEffect(() => {
    if (tr.current !== null) {
      clearTimeout(tr.current);
    }

    tr.current = setTimeout(() => {
      sd(val);
    }, delay);

    return () => {
      if (tr.current !== null) {
	clearTimeout(tr.current);
      }
    };
  }, [val, delay]);

  return d;
}

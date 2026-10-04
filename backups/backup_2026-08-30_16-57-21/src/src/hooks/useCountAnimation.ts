import { useState, useEffect, useRef } from 'react';

interface UseCountAnimationOptions {
  duration?: number;
  delay?: number;
  easing?: 'linear' | 'easeOut' | 'easeInOut';
}

export function useCountAnimation(
  end: number,
  isLoading: boolean = false,
  options: UseCountAnimationOptions = {}
): number {
  const { duration = 1500, delay = 0, easing = 'easeOut' } = options;
  const [count, setCount] = useState(0);
  const previousEnd = useRef(0);
  const animationRef = useRef<number>();

  useEffect(() => {
    if (isLoading) {
      setCount(0);
      return;
    }

    const startValue = previousEnd.current;
    const endValue = end;
    previousEnd.current = end;

    if (startValue === endValue) return;

    let startTime: number | null = null;
    let delayTimeout: NodeJS.Timeout;

    const easingFunctions = {
      linear: (t: number) => t,
      easeOut: (t: number) => 1 - Math.pow(1 - t, 3),
      easeInOut: (t: number) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
    };

    const animate = (currentTime: number) => {
      if (startTime === null) startTime = currentTime;
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      const easedProgress = easingFunctions[easing](progress);
      const currentCount = Math.floor(startValue + (endValue - startValue) * easedProgress);
      
      setCount(currentCount);

      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate);
      } else {
        setCount(endValue);
      }
    };

    delayTimeout = setTimeout(() => {
      animationRef.current = requestAnimationFrame(animate);
    }, delay);

    return () => {
      clearTimeout(delayTimeout);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [end, isLoading, duration, delay, easing]);

  return count;
}

export function useCountAnimationCurrency(
  end: number,
  isLoading: boolean = false,
  options: UseCountAnimationOptions = {}
): string {
  const count = useCountAnimation(end, isLoading, options);
  
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(count);
}

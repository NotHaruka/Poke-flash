/**
 * Clamps a number between a minimum and maximum value.
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Linearly interpolates between two numbers.
 */
export function lerp(start: number, end: number, amount: number): number {
  return start + (end - start) * amount;
}

/**
 * Calculates the Euclidean distance between two points.
 */
export function distance(x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Calculates the angle in radians between two points.
 */
export function angle(x1: number, y1: number, x2: number, y2: number): number {
  return Math.atan2(y2 - y1, x2 - x1);
}

export interface Vector2D {
  x: number;
  y: number;
}

/**
 * Normalizes a 2D vector to a length of 1.
 */
export function normalize(vec: Vector2D): Vector2D {
  const len = Math.sqrt(vec.x * vec.x + vec.y * vec.y);
  if (len === 0) {
    return { x: 0, y: 0 };
  }
  return {
    x: vec.x / len,
    y: vec.y / len
  };
}

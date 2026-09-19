export const exponentialApproach = (current: number, target: number, delta: number, speed = 4) =>
  current + (target - current) * (1 - Math.exp(-delta * speed));

export const neuralBreath = (time: number) => Math.sin(time * 0.7) * 0.015;

export const hexColor = (hex: string): [number, number, number] => {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16 & 255) / 255, (value >> 8 & 255) / 255, (value & 255) / 255];
};

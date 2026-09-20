export const exponentialApproach = (current: number, target: number, delta: number, speed = 4) =>
  current + (target - current) * (1 - Math.exp(-delta * speed));

export const neuralBreath = (time: number) =>
  Math.sin(time * 0.62) * 0.016 + Math.sin(time * 0.21) * 0.006;

export function getAutonomousRotation(time: number) {
  return {
    x: Math.sin(time*.073+1.7)*.008+Math.sin(time*.021)*.003,
    y: Math.sin(time*.11)*.035+Math.sin(time*.037)*.014,
    z: Math.sin(time*.047+.8)*.005
  };
}

export function getAutonomousDrift(time: number) {
  return {
    x: Math.sin(time * 0.19) * 0.010,
    y: Math.sin(time * 0.13 + 1.4) * 0.008,
    z: Math.sin(time * 0.09 + 2.1) * 0.004
  };
}

export function getIdleEnergy(time: number) {
  return Math.max(0.84, 0.92 + Math.sin(time * 0.18) * 0.05 + Math.sin(time * 0.047) * 0.03);
}

export const hexColor = (hex: string): [number, number, number] => {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16 & 255) / 255, (value >> 8 & 255) / 255, (value & 255) / 255];
};

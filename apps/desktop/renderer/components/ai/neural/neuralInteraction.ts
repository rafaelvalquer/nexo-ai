import type { NeuralInteraction } from "./types";

export const createNeuralInteraction = (): NeuralInteraction => ({
  x: 0,
  y: 0,
  lastX: 0,
  lastY: 0,
  velocityX: 0,
  velocityY: 0,
  speed: 0,
  hovering: false,
  pressed: false,
  expanded: false,
  activeRegion: -1,
  wave: 0
});

export function updatePointer(interaction: NeuralInteraction, x: number, y: number) {
  interaction.lastX = interaction.x;
  interaction.lastY = interaction.y;
  interaction.x = Math.max(-1, Math.min(1, x));
  interaction.y = Math.max(-1, Math.min(1, y));
  interaction.velocityX = interaction.x - interaction.lastX;
  interaction.velocityY = interaction.y - interaction.lastY;
  const rawSpeed = Math.hypot(interaction.velocityX, interaction.velocityY);
  interaction.speed += (rawSpeed - interaction.speed) * 0.42;
  interaction.hovering = true;
  if (interaction.speed > 0.055) interaction.wave = Math.min(1, interaction.wave + interaction.speed * 3.6);
  return interaction;
}

export function leavePointer(interaction: NeuralInteraction) {
  interaction.hovering = false;
  interaction.pressed = false;
  interaction.speed *= 0.55;
  return interaction;
}

export function decayInteraction(interaction: NeuralInteraction, delta: number) {
  const smoothing = 1 - Math.exp(-delta * 6);
  if (!interaction.hovering) {
    interaction.x += (0 - interaction.x) * smoothing;
    interaction.y += (0 - interaction.y) * smoothing;
    interaction.velocityX *= Math.exp(-delta * 8);
    interaction.velocityY *= Math.exp(-delta * 8);
    interaction.speed *= Math.exp(-delta * 6);
  } else {
    interaction.speed *= Math.exp(-delta * 2.2);
  }
  interaction.wave *= Math.exp(-delta * 2.8);
  return interaction;
}

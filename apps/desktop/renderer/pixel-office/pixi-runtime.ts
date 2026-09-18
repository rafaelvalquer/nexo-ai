// Keep Pixel Office on one Pixi entry point while allowing Vite to tree-shake
// every renderer subsystem the scene does not use.
export {
  Application,
  Assets,
  Container,
  Graphics,
  Point,
  Rectangle,
  Sprite,
  Text,
  Texture,
  TextureStyle
} from "pixi.js";

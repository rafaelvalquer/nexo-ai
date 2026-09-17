import type { ButtonHTMLAttributes,ReactNode } from "react";
type Props=ButtonHTMLAttributes<HTMLButtonElement>&{variant?:"primary"|"secondary"|"ghost"|"danger";size?:"sm"|"md"|"icon";children:ReactNode};
export function Button({variant="secondary",size="md",className="",...props}:Props){return <button {...props} className={`uiButton ${variant} ${size} ${className}`.trim()}/>;}

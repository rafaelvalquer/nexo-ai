import { forwardRef,type HTMLAttributes } from "react";
export const ChatViewport=forwardRef<HTMLDivElement,HTMLAttributes<HTMLDivElement>>(function ChatViewport({children,...props},ref){return <div className="chatViewport" ref={ref} {...props}><div className="chatContent">{children}</div></div>;});

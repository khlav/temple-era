import Image from "next/image";
import { cn } from "~/lib/utils";

/** Warcraft Logs' own favicon — used wherever a link opens a WCL report, replacing the generic
 *  external-link glyph so it reads as "this specific site" rather than "opens elsewhere". */
export function WCLIcon({ size = 18, className }: { size?: number; className?: string }) {
  return (
    <Image
      src="/img/wcl-icon.png"
      alt="Warcraft Logs"
      width={size}
      height={size}
      className={cn("inline-block shrink-0 rounded-[2px]", className)}
      style={{ width: size, height: size }}
    />
  );
}

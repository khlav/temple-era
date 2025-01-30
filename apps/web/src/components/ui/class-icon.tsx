import Image from "next/image";

export const ClassIcon = ({
                         characterClass,
                         px,
                         className,
                       }: {
  characterClass: string;
  px?: number;
  className?: string;
}) => (
  <Image
    src={`/img/class_${characterClass}.png`.toLowerCase()}
    alt={characterClass}
    width={px ?? 128}
    height={px ?? 128}
    className={className ?? ""}
  />
);

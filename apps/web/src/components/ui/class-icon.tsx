import Image from "next/image";

export const ClassIcon = ({
  characterClass,
  px,
  className,
  style,
}: {
  characterClass: string;
  px?: number;
  className?: string;
  style?: React.CSSProperties;
}) => {
  const size = px ?? 128;

  // "Unknown" covers reserves we can't confidently attribute a class to (e.g. an
  // unmatched SoftRes reserve whose spec id didn't resolve to a class) - show a
  // plain "?" rather than requesting a class_unknown.png that doesn't exist.
  if (characterClass.toLowerCase() === "unknown") {
    return (
      <span
        title="Unknown class"
        className={`inline-flex items-center justify-center rounded-sm bg-muted text-muted-foreground ${className ?? ""}`}
        style={{ width: size, height: size, fontSize: size * 0.6, ...style }}
      >
        ?
      </span>
    );
  }

  return (
    <Image
      src={`/img/class/class_${characterClass}.png`.toLowerCase()}
      alt={characterClass}
      width={size}
      height={size}
      className={className ?? ""}
      style={style}
    />
  );
};

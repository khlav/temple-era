import {
  LayoutGrid,
  FlaskConical,
  Shirt,
  PawPrint,
  Sparkles,
  Cog,
  Anvil,
  ChefHat,
  type LucideIcon,
} from "lucide-react";

const PROFESSION_ICONS: Record<string, LucideIcon> = {
  All: LayoutGrid,
  Alchemy: FlaskConical,
  Tailoring: Shirt,
  Leatherworking: PawPrint,
  Enchanting: Sparkles,
  Engineering: Cog,
  Blacksmithing: Anvil,
  Cooking: ChefHat,
};

export function ProfessionGlyph({
  profession,
  className,
  size = 17,
}: {
  profession: string;
  className?: string;
  size?: number;
}) {
  const Icon = PROFESSION_ICONS[profession];
  if (!Icon) return null;

  return <Icon size={size} strokeWidth={1.3} className={className} aria-hidden="true" />;
}

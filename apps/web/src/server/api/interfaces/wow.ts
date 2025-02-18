interface LocalizedString {
  it_IT?: string;
  ru_RU?: string;
  en_GB?: string;
  zh_TW?: string;
  ko_KR?: string;
  en_US?: string;
  es_MX?: string;
  pt_BR?: string;
  es_ES?: string;
  zh_CN?: string;
  fr_FR?: string;
  de_DE?: string;
}

interface ItemKey {
  href: string;
}

interface ItemSubClass {
  name: LocalizedString;
  id: number;
}

interface ItemClass {
  name: LocalizedString;
  id: number;
}

interface ItemQuality {
  name: LocalizedString;
  type: string;
}

interface InventoryType {
  name: LocalizedString;
  type: string;
}

interface ItemMedia {
  id: number;
}

interface ItemData {
  level: number;
  required_level: number;
  sell_price: number;
  item_subclass: ItemSubClass;
  is_equippable: boolean;
  purchase_quantity: number;
  media: ItemMedia;
  item_class: ItemClass;
  quality: ItemQuality;
  max_count: number;
  is_stackable: boolean;
  name: LocalizedString;
  purchase_price: number;
  id: number;
  inventory_type: InventoryType;
}

interface WOWClassicItem {
  key: ItemKey;
  data: ItemData;
}

export interface WOWClassicItemSearchAPIResponse {
  page: number;
  pageSize: number;
  maxPageSize: number;
  pageCount: number;
  results: WOWClassicItem[];
}
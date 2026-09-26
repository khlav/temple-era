// A compact, searchable field index of the GraphQL v2 schema (TEMPLE-125). The SDL is readable but
// has to be loaded whole; this answers "which fields mention X" with one line per field instead.
import { isObjectType, isEnumType, type GraphQLSchema } from "graphql";

export interface GraphQLFieldEntry {
  /** Parent type — `Query` for root queries. */
  type: string;
  field: string;
  /** The field's return type as SDL writes it, e.g. `[EarnedAchievement!]!`. */
  returns: string;
  args: { name: string; type: string }[];
  description: string | null;
}

export interface GraphQLEnumEntry {
  type: string;
  values: string[];
}

export interface GraphQLIndex {
  fields: GraphQLFieldEntry[];
  enums: GraphQLEnumEntry[];
}

export function buildGraphQLIndex(schema: GraphQLSchema): GraphQLIndex {
  const fields: GraphQLFieldEntry[] = [];
  const enums: GraphQLEnumEntry[] = [];
  for (const type of Object.values(schema.getTypeMap())) {
    if (type.name.startsWith("__")) continue;
    if (isObjectType(type)) {
      for (const field of Object.values(type.getFields())) {
        fields.push({
          type: type.name,
          field: field.name,
          returns: String(field.type),
          args: field.args.map((arg) => ({ name: arg.name, type: String(arg.type) })),
          description: field.description ?? null,
        });
      }
    } else if (isEnumType(type)) {
      enums.push({ type: type.name, values: type.getValues().map((v) => v.name) });
    }
  }
  fields.sort((a, b) => a.type.localeCompare(b.type) || a.field.localeCompare(b.field));
  enums.sort((a, b) => a.type.localeCompare(b.type));
  return { fields, enums };
}

export interface GraphQLIndexQuery {
  q?: string | null;
  type?: string | null;
}

/** Every whitespace-separated term in `q` must appear in `Type.field`, the return type, an
 *  argument name, or the description (case-insensitive). `type` narrows to one parent type. Enums
 *  are kept when their name or a value matches, and are dropped when a `type` filter is set. */
export function searchGraphQLIndex(index: GraphQLIndex, query: GraphQLIndexQuery): GraphQLIndex {
  const terms = (query.q ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  const type = query.type?.toLowerCase();
  const fields = index.fields.filter((entry) => {
    if (type && entry.type.toLowerCase() !== type) return false;
    if (terms.length === 0) return true;
    const haystack = [
      `${entry.type}.${entry.field}`,
      entry.returns,
      ...entry.args.map((a) => a.name),
      entry.description ?? "",
    ]
      .join(" ")
      .toLowerCase();
    return terms.every((term) => haystack.includes(term));
  });
  const enums = type
    ? []
    : index.enums.filter((entry) => {
        const haystack = [entry.type, ...entry.values].join(" ").toLowerCase();
        return terms.every((term) => haystack.includes(term));
      });
  return { fields, enums };
}

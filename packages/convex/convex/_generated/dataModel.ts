/* eslint-disable */
/**
 * Generated data model types. Hand-maintained because we cannot run
 * `convex codegen` offline (no deployment credentials). The real CLI
 * would generate this file; the shape mirrors its template.
 */
import type {
  DataModelFromSchemaDefinition,
  DocumentByName,
  TableNamesInDataModel,
} from "convex/server";
import type { GenericId } from "convex/values";
import type schema from "../schema.js";

export type DataModel = DataModelFromSchemaDefinition<typeof schema>;
export type TableNames = TableNamesInDataModel<DataModel>;
export type Doc<TableName extends TableNames> = DocumentByName<DataModel, TableName>;
export type Id<TableName extends TableNames | "_storage" | "_scheduled_functions"> =
  GenericId<TableName>;

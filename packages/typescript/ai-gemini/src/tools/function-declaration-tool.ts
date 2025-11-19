interface FunctionDeclarationTool {
  /**
   * The name of the function. Must be a-z, A-Z, 0-9, or contain underscores, colons, dots, and dashes, with a maximum length of 64.
   */
  name: string;
  /**
   * A brief description of the function.
   */
  description: string;
  /**
   * Defines the function behavior.
   * - UNSPECIFIED:	This value is unused.
   * - BLOCKING:	If set, the system will wait to receive the function response before continuing the conversation.
   * - NON_BLOCKING:	If set, the system will not wait to receive the function response. Instead, it will attempt to handle function responses as they become available while maintaining the conversation between the user and the model.

   */
  behavior?: "UNSPECIFIED" | "BLOCKING" | "NON_BLOCKING";

  parameters?: Schema;
  /**
   * JSON Schema representation of the parameters. Mutually exclusive with 'parameters' field.
   */
  parametersJsonSchema?: Schema;
  /**
   * Describes the output from this function in JSON Schema format. Reflects the Open API 3.03 Response Object. The Schema defines the type used for the response value of the function.
   */
  response?: Schema;
  /**
   * Describes the output from this function in JSON Schema format. The value specified by the schema is the response value of the function.

This field is mutually exclusive with response.
   */
  responseJsonSchema?: Schema;
}


type Value = null | string | number | boolean | object | any[];

export interface Schema {
  type: "TYPE_UNSPECIFIED" | "OBJECT" | "ARRAY" | "STRING" | "NUMBER" | "INTEGER" | "BOOLEAN" | "NULL";
  /**
   * The format of the data. Any value is allowed, but most do not trigger any special functionality.
   */
  format?: string;
  /**
   * Title of the schema
   */
  title?: string;
  /**
   * A brief description of the parameter. This could contain examples of use. Parameter description may be formatted as Markdown.
   */
  description?: string;
  /**
   * Indicates if the value may be null.
   */
  nullable?: boolean;
  /**
   * Possible values of the element of Type.STRING with enum format. For example we can define an Enum Direction as : {type:STRING, format:enum, enum:["EAST", NORTH", "SOUTH", "WEST"]}
   */
  enum?: any[];
  /**
   * Maximum number of the elements for Type.ARRAY.
   */
  maxItems?: number;
  /**
   * Minimum number of the elements for Type.ARRAY.
   */
  minItems?: number;
  /**
   * An object containing a list of "key": value pairs. Example: { "name": "wrench", "mass": "1.3kg", "count": "3" }.
   */
  properties?: Record<string, Schema>;
  /**
   * Required properties of Type.OBJECT.
   */
  required?: string[];
  /**
   * Minimum number of the properties for Type.OBJECT.
   */
  minProperties?: string;
  /**
   * Maximum number of the properties for Type.OBJECT.
   */
  maxProperties?: string;
  /**
   * SCHEMA FIELDS FOR TYPE STRING Minimum length of the Type.STRING
   */
  minLength?: number;
  /**
   * Maximum length of the Type.STRING
   */
  maxLength?: number;
  /**
   * Pattern of the Type.STRING to restrict a string to a regular expression.
   */
  pattern?: string;
  /**
   *  Example of the object. Will only populated when the object is the root.
   */
  example?: Value;
  /**
   * The value should be validated against any (one or more) of the subschemas in the list.
   */
  anyOf?: [Schema, ...Schema[]];

  /**
   * The order of the properties. Not a standard field in open api spec. Used to determine the order of the properties in the response.
   */
  propertyOrdering?: string[];
  /**
   * Default value of the field. Per JSON Schema, this field is intended for documentation generators and doesn't affect validation. Thus it's included here and ignored so that developers who send schemas with a default field don't get unknown-field errors.
   */
  default?: Value;
  /**
   * Schema of the elements of Type.ARRAY.
   */
  items?: Schema;
  /**
   * SCHEMA FIELDS FOR TYPE INTEGER and NUMBER Minimum value of the Type.INTEGER and Type.NUMBER
   */
  minimum?: number;
  /**
   * Maximum value of the Type.INTEGER and Type.NUMBER
   */
  maximum?: number;
}

export const validateFunctionDeclarationTool = (tool: FunctionDeclarationTool) => {
  const nameRegex = /^[a-zA-Z0-9_:.-]{1,64}$/;
  const valid = nameRegex.test(tool.name);
  if (!valid) {
    throw new Error(`Invalid function name: ${tool.name}. Must be 1-64 characters long and contain only a-z, A-Z, 0-9, underscores, colons, dots, and dashes.`);
  }

  if (tool.parameters && tool.parametersJsonSchema) {
    throw new Error(`FunctionDeclarationTool cannot have both 'parameters' and 'parametersJsonSchema' defined. Please use only one.`);
  }

  if (tool.response && tool.responseJsonSchema) {
    throw new Error(`FunctionDeclarationTool cannot have both 'response' and 'responseJsonSchema' defined. Please use only one.`);
  }

}

export const functionDeclarationTools = (tools: FunctionDeclarationTool[]) => {
  tools.forEach(validateFunctionDeclarationTool);
  return {
    functionDeclarations: tools
  }
}
/** Known TypeSafe Jev evaluate models. Other aliases are accepted as strings. */
export const TYPESAFE_EVALUATE_MODELS = ['jev-latest', 'jev-1.13.0'] as const

/** Union of documented TypeSafe Jev model ids, plus any other string alias. */
export type TypesafeEvaluateModel =
  | (typeof TYPESAFE_EVALUATE_MODELS)[number]
  | (string & {})

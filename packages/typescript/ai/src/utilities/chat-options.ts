import { AIAdapter, ChatStreamOptionsUnion } from "../types";

export function chatOptions<
  TAdapter extends AIAdapter<any, any, any, any, any>,
  const TModel extends TAdapter extends AIAdapter<infer Models, any, any, any, any>
  ? Models[number]
  : string
>(
  options: Omit<ChatStreamOptionsUnion<TAdapter>, "providerOptions" | "model" | "messages" | "abortController"> & {
    adapter: TAdapter;
    model: TModel;
    providerOptions?: TAdapter extends AIAdapter<
      any,
      any,
      any,
      any,
      infer ModelProviderOptions
    >
    ? TModel extends keyof ModelProviderOptions
    ? ModelProviderOptions[TModel]
    : never
    : never;
  }
): typeof options {
  return options;
}


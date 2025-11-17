import { OpenAIImageModel } from "../openai-adapter";

interface ImageProviderOptions {
  /**
   * A text prompt describing the desired image. The maximum length is 32000 characters for gpt-image-1, 1000 characters for dall-e-2 and 4000 characters for dall-e-3.
   */
  prompt: string;
  /**
   * Allows to set transparency for the background of the generated image(s). This parameter is only supported for gpt-image-1. Must be one of transparent, opaque or auto (default value). When auto is used, the model will automatically determine the best background for the image.

If transparent, the output format needs to support transparency, so it should be set to either png (default value) or webp.
   */
  background?: "transparent" | "opaque" | "auto" | null;
  /**
   * The image model to use for generation.
   */
  model: OpenAIImageModel;
}

export const validateBackground = (options: ImageProviderOptions) => {
  if (options.background) {
    const supportedModels = ["gpt-image-1"];
    if (!supportedModels.includes(options.model)) {
      throw new Error(`The model ${options.model} does not support background option.`);
    }
  }
}

export const validatePrompt = (options: ImageProviderOptions) => {

  if (options.prompt.length === 0) {
    throw new Error("Prompt cannot be empty.");
  }
  if (options.model === "gpt-image-1" && options.prompt.length > 32000) {
    throw new Error("For gpt-image-1, prompt length must be less than or equal to 32000 characters.");
  }
  if (options.model === "dall-e-2" && options.prompt.length > 1000) {
    throw new Error("For dall-e-2, prompt length must be less than or equal to 1000 characters.");
  }
  if (options.model === "dall-e-3" && options.prompt.length > 4000) {
    throw new Error("For dall-e-3, prompt length must be less than or equal to 4000 characters.");
  }

}
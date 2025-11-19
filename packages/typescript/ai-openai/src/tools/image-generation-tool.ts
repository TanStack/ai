import type { Tool } from "@tanstack/ai";
import { OpenAIImageModel } from "../openai-adapter";

export interface ImageGenerationTool {
  type: "image_generation",
  /**
   * Background type for the generated image. 
   * @default "auto"
   */
  background?: "transparent" | "opaque" | "auto";
  /**
   * Control how much effort the model will exert to match the style and features, especially facial features, of input images. This parameter is only supported for gpt-image-1. Unsupported for gpt-image-1-mini.
   */
  input_fidelity?: "low" | "high";
  /**
   * Optional mask for inpainting.
   */
  input_image_mask?: {
    /**
     * File ID for the mask image.
     */
    file_id?: string;
    /**
     * Base64-encoded mask image.
     */
    image_url?: string;
  },
  /**
   * The model to use for image generation.
   * @default "gpt-image-1"
   */
  model?: OpenAIImageModel
  /**
   * Moderation level for the generated image
   * @default "auto"
   */
  moderation?: "strict" | "moderate" | "auto"
  /**
   * Compression level for the output images
   * @default 100
   */
  output_compression?: number;
  /**
   * The format of the generated image.
   * @default "png"
   */
  output_format?: "png" | "webp" | "jpeg"
  /**
   * Number of partial images to generate in streaming mode, from 0 (default value) to 3.
   * @default 0 
  */
  partial_images?: number;
  /**
   * The quality of the generated image
   * @default "auto"
   */
  quality?: "low" | "medium" | "high" | "auto";
  /**
   * The size of the generated image
   */
  size: "1024x1024" | "1024x1536" | "1536x1024" | "auto";
}

export const validatePartialImages = (value: number | undefined) => {
  if (value !== undefined && (value < 0 || value > 3)) {
    throw new Error("partial_images must be between 0 and 3");
  }
};

/**
 * Converts a standard Tool to OpenAI ImageGenerationTool format
 */
export function convertImageGenerationToolToAdapterFormat(tool: Tool): ImageGenerationTool {
  const metadata = tool.metadata as ImageGenerationTool;
  return {
    type: "image_generation",
    background: metadata.background,
    input_fidelity: metadata.input_fidelity,
    input_image_mask: metadata.input_image_mask,
    model: metadata.model,
    moderation: metadata.moderation,
    output_compression: metadata.output_compression,
    output_format: metadata.output_format,
    partial_images: metadata.partial_images,
    quality: metadata.quality,
    size: metadata.size,
  };
}

/**
 * Creates a standard Tool from ImageGenerationTool parameters
 */
export function imageGenerationTool(
  toolData: ImageGenerationTool
): Tool {

  validatePartialImages(toolData.partial_images);
  return {
    type: "function",
    function: {
      name: "image_generation",
      description: "Generate images based on text descriptions",
      parameters: {},
    },
    metadata: {
      ...toolData
    },
  };
}
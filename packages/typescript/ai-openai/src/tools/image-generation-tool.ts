import type { Tool } from "@tanstack/ai";
import OpenAI from "openai";

export type ImageGenerationTool = OpenAI.Responses.Tool.ImageGeneration;


export const validatePartialImages = (value: number | undefined) => {
  if (value !== undefined && (value < 0 || value > 3)) {
    throw new Error("partial_images must be between 0 and 3");
  }
};

/**
 * Converts a standard Tool to OpenAI ImageGenerationTool format
 */
export function convertImageGenerationToolToAdapterFormat(tool: Tool): ImageGenerationTool {
  const metadata = tool.metadata as Omit<ImageGenerationTool, "type">;
  return {
    type: "image_generation",
    ...metadata
  };
}

/**
 * Creates a standard Tool from ImageGenerationTool parameters
 */
export function imageGenerationTool(
  toolData: Omit<ImageGenerationTool, "type">
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
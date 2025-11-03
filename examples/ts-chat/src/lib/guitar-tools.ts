import { tool } from "@tanstack/ai";
import guitars from "@/data/example-guitars";

export const getGuitarsTool = tool({
  type: "function",
  function: {
    name: "getGuitars",
    description: "Get all products from the database",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  execute: async () => {
    return JSON.stringify(guitars);
  },
});

export const recommendGuitarTool = tool({
  type: "function",
  function: {
    name: "recommendGuitar",
    description:
      "REQUIRED tool to display a guitar recommendation to the user. This tool MUST be used whenever recommending a guitar - do NOT write recommendations yourself. This displays the guitar in a special appealing format with a buy button.",
    parameters: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description:
            "The ID of the guitar to recommend (from the getGuitars results)",
        },
      },
      required: ["id"],
    },
  },
  // No execute = client-side tool
});

export const getPersonalGuitarPreferenceTool = tool({
  type: "function",
  function: {
    name: "getPersonalGuitarPreference",
    description:
      "Get the user's guitar preference from their local browser storage",
    parameters: {
      type: "object",
      properties: {},
    },
  },
  // No execute = client-side tool
});

export const addToWishListTool = tool({
  type: "function",
  function: {
    name: "addToWishList",
    description: "Add a guitar to the user's wish list (requires approval)",
    parameters: {
      type: "object",
      properties: {
        guitarId: { type: "string" },
      },
      required: ["guitarId"],
    },
  },
  needsApproval: true,
  // No execute = client-side but needs approval
});

export const addToCartTool = tool({
  type: "function",
  function: {
    name: "addToCart",
    description: "Add a guitar to the shopping cart (requires approval)",
    parameters: {
      type: "object",
      properties: {
        guitarId: { type: "string" },
        quantity: { type: "number" },
      },
      required: ["guitarId", "quantity"],
    },
  },
  needsApproval: true,
  execute: async (args) => {
    return JSON.stringify({
      success: true,
      cartId: "CART_" + Date.now(),
      guitarId: args.guitarId,
      quantity: args.quantity,
      totalItems: args.quantity,
    });
  },
});

export const allTools = [
  getGuitarsTool,
  recommendGuitarTool,
  getPersonalGuitarPreferenceTool,
  addToWishListTool,
  addToCartTool,
];


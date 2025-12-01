"""
Example usage of TanStack AI Python SDK with agentic flow and tools.

This example demonstrates:
1. Setting up an Anthropic adapter
2. Defining tools with execute functions
3. Streaming chat with automatic tool execution
4. Using agent loop strategies
"""

import asyncio
import os

from tanstack_ai import (
    AnthropicAdapter,
    AIAdapterConfig,
    chat,
    tool,
    max_iterations,
)


# Define a simple weather tool
def get_weather(args):
    """Get weather for a location (simulated)."""
    location = args.get("location", "unknown")
    unit = args.get("unit", "fahrenheit")
    
    # Simulate weather data
    return {
        "location": location,
        "temperature": 72 if unit == "fahrenheit" else 22,
        "conditions": "sunny",
        "unit": unit,
    }


# Define a calculator tool
def calculate(args):
    """Perform a calculation."""
    operation = args.get("operation")
    a = args.get("a", 0)
    b = args.get("b", 0)
    
    if operation == "add":
        return {"result": a + b}
    elif operation == "subtract":
        return {"result": a - b}
    elif operation == "multiply":
        return {"result": a * b}
    elif operation == "divide":
        if b == 0:
            return {"error": "Division by zero"}
        return {"result": a / b}
    else:
        return {"error": f"Unknown operation: {operation}"}


# Define tools using the tool helper
weather_tool = tool(
    name="get_weather",
    description="Get the current weather for a location. Returns temperature, conditions, and forecast.",
    input_schema={
        "type": "object",
        "properties": {
            "location": {
                "type": "string",
                "description": "The city and state, e.g. San Francisco, CA",
            },
            "unit": {
                "type": "string",
                "enum": ["celsius", "fahrenheit"],
                "description": "Temperature unit",
            },
        },
        "required": ["location"],
    },
    execute=get_weather,
)

calculator_tool = tool(
    name="calculate",
    description="Perform a mathematical calculation (add, subtract, multiply, divide)",
    input_schema={
        "type": "object",
        "properties": {
            "operation": {
                "type": "string",
                "enum": ["add", "subtract", "multiply", "divide"],
                "description": "The operation to perform",
            },
            "a": {
                "type": "number",
                "description": "First operand",
            },
            "b": {
                "type": "number",
                "description": "Second operand",
            },
        },
        "required": ["operation", "a", "b"],
    },
    execute=calculate,
)


async def main():
    """Main example function."""
    # Set up the Anthropic adapter
    adapter = AnthropicAdapter(
        AIAdapterConfig(
            api_key=os.environ.get("ANTHROPIC_API_KEY"),
        )
    )

    # Example 1: Simple chat without tools
    print("=" * 80)
    print("Example 1: Simple chat without tools")
    print("=" * 80)
    
    async for chunk in chat(
        adapter=adapter,
        model="claude-3-5-sonnet-20241022",
        messages=[
            {"role": "user", "content": "Write a haiku about programming."}
        ],
    ):
        if chunk["type"] == "content":
            print(chunk["delta"], end="", flush=True)
        elif chunk["type"] == "done":
            print("\n\nFinish reason:", chunk.get("finishReason"))
            if chunk.get("usage"):
                print("Tokens used:", chunk["usage"])
    
    print("\n")

    # Example 2: Chat with automatic tool execution
    print("=" * 80)
    print("Example 2: Chat with automatic tool execution")
    print("=" * 80)
    
    async for chunk in chat(
        adapter=adapter,
        model="claude-3-5-sonnet-20241022",
        messages=[
            {
                "role": "user",
                "content": "What's the weather in San Francisco and what's 15 + 27?",
            }
        ],
        tools=[weather_tool, calculator_tool],
        agent_loop_strategy=max_iterations(5),
    ):
        chunk_type = chunk["type"]
        
        if chunk_type == "content":
            print(chunk["delta"], end="", flush=True)
        elif chunk_type == "tool_call":
            print(f"\n[Tool Call: {chunk['toolCall']['function']['name']}]")
        elif chunk_type == "tool_result":
            print(f"[Tool Result: {chunk['content'][:100]}...]")
        elif chunk_type == "done":
            print("\n\nFinish reason:", chunk.get("finishReason"))
            if chunk.get("usage"):
                print("Tokens used:", chunk["usage"])
        elif chunk_type == "error":
            print(f"\n[Error: {chunk['error']['message']}]")
    
    print("\n")

    # Example 3: Multi-turn conversation with tools
    print("=" * 80)
    print("Example 3: Multi-turn conversation with tools")
    print("=" * 80)
    
    messages = [
        {"role": "user", "content": "What's the weather in New York?"},
    ]
    
    # First turn
    async for chunk in chat(
        adapter=adapter,
        model="claude-3-5-sonnet-20241022",
        messages=messages,
        tools=[weather_tool],
    ):
        if chunk["type"] == "content":
            print(chunk["delta"], end="", flush=True)
        elif chunk["type"] == "done":
            print("\n")
    
    # Add assistant's response to messages (simplified - in production, collect full response)
    messages.append({
        "role": "assistant",
        "content": "The weather in New York is sunny with a temperature of 72°F.",
    })
    
    # Second turn
    messages.append({
        "role": "user",
        "content": "How about Los Angeles?",
    })
    
    async for chunk in chat(
        adapter=adapter,
        model="claude-3-5-sonnet-20241022",
        messages=messages,
        tools=[weather_tool],
    ):
        if chunk["type"] == "content":
            print(chunk["delta"], end="", flush=True)
        elif chunk["type"] == "done":
            print("\n")


if __name__ == "__main__":
    # Run the example
    asyncio.run(main())

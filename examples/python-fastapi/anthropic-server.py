"""
FastAPI server example for TanStack AI
Streams Anthropic API events in SSE format compatible with TanStack AI client
Now with agentic tool calling support!
"""
import os
import logging
from typing import List, Dict, Any, Optional

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from tanstack_ai import (
    AnthropicAdapter,
    AIAdapterConfig,
    chat,
    tool,
    max_iterations,
    format_sse_chunk,
    format_sse_done,
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Load environment variables from .env file
load_dotenv()

# Initialize FastAPI app
app = FastAPI(title="TanStack AI Python FastAPI Example")

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify your frontend origin
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize Anthropic client
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY")
if not ANTHROPIC_API_KEY:
    raise ValueError(
        "ANTHROPIC_API_KEY environment variable is required. "
        "Please set it in your .env file or environment."
    )

# Validate API key format
if ANTHROPIC_API_KEY.startswith("op://"):
    raise ValueError(
        "⚠️  ERROR: API key appears to be a 1Password reference (op://...).\n"
        "You need to use the actual API key value, not the 1Password reference.\n"
        "Please copy the actual key from 1Password (starts with 'sk-ant-') and update your .env file."
    )

if not ANTHROPIC_API_KEY.startswith("sk-ant-"):
    print(f"⚠️  WARNING: API key doesn't start with 'sk-ant-'. This may not be a valid Anthropic API key.")
    print(f"   Key starts with: {ANTHROPIC_API_KEY[:10]}...")

if len(ANTHROPIC_API_KEY) < 40:
    print(f"⚠️  WARNING: API key seems too short ({len(ANTHROPIC_API_KEY)} chars). Anthropic keys are typically 50+ characters.")

# Display API key info on startup (masked for security)
def mask_api_key(key: str) -> str:
    """Mask API key showing only first 7 and last 4 characters"""
    if len(key) <= 11:
        return "*" * len(key)
    return f"{key[:7]}...{key[-4:]}"

print(f"\n{'='*60}")
print("🚀 TanStack AI FastAPI Server Starting...")
print(f"{'='*60}")
print(f"✅ ANTHROPIC_API_KEY loaded: {mask_api_key(ANTHROPIC_API_KEY)}")
print(f"   Key length: {len(ANTHROPIC_API_KEY)} characters")
print(f"🤖 Agentic tool calling: ENABLED")
print(f"🔧 Available tools: get_weather, get_time")
print(f"🌐 Server will start on: http://0.0.0.0:8000")
print(f"   (Note: If running with uvicorn manually, use: uvicorn anthropic-server:app --reload --port 8000)")
print(f"{'='*60}\n")

# Initialize TanStack AI adapter
adapter = AnthropicAdapter(
    AIAdapterConfig(api_key=ANTHROPIC_API_KEY)
)

# Define tools
def get_weather_impl(args: Dict[str, Any]) -> Dict[str, Any]:
    """Get weather for a city (returns static data for demo)"""
    location = args.get("location", "Unknown")
    unit = args.get("unit", "fahrenheit")
    
    # Static weather data for different cities
    weather_data = {
        "san francisco": {"temp_f": 62, "temp_c": 17, "conditions": "Foggy"},
        "new york": {"temp_f": 75, "temp_c": 24, "conditions": "Partly Cloudy"},
        "london": {"temp_f": 55, "temp_c": 13, "conditions": "Rainy"},
        "tokyo": {"temp_f": 70, "temp_c": 21, "conditions": "Clear"},
        "paris": {"temp_f": 68, "temp_c": 20, "conditions": "Sunny"},
        "sydney": {"temp_f": 80, "temp_c": 27, "conditions": "Sunny"},
    }
    
    # Get weather for the city (case-insensitive)
    location_lower = location.lower()
    city_weather = weather_data.get(location_lower, {
        "temp_f": 72,
        "temp_c": 22,
        "conditions": "Clear"
    })
    
    temperature = city_weather["temp_c"] if unit == "celsius" else city_weather["temp_f"]
    
    return {
        "location": location,
        "temperature": temperature,
        "unit": unit,
        "conditions": city_weather["conditions"],
        "forecast": "Clear skies expected"
    }

def get_time_impl(args: Dict[str, Any]) -> Dict[str, Any]:
    """Get current time in a timezone (returns static data for demo)"""
    timezone = args.get("timezone", "UTC")
    
    # Static time data for different timezones
    times = {
        "UTC": "14:30",
        "PST": "06:30",
        "EST": "09:30",
        "GMT": "14:30",
        "JST": "23:30",
        "AEST": "00:30",
    }
    
    time = times.get(timezone.upper(), "12:00")
    
    return {
        "timezone": timezone,
        "time": time,
        "format": "24-hour"
    }

# Define tools using the tool helper
weather_tool = tool(
    name="get_weather",
    description="Get the current weather for a location. Returns temperature, conditions, and forecast. Supports multiple cities including San Francisco, New York, London, Tokyo, Paris, and Sydney.",
    input_schema={
        "type": "object",
        "properties": {
            "location": {
                "type": "string",
                "description": "The city name (e.g., 'San Francisco', 'New York', 'London')",
            },
            "unit": {
                "type": "string",
                "enum": ["celsius", "fahrenheit"],
                "description": "Temperature unit (default: fahrenheit)",
            },
        },
        "required": ["location"],
    },
    execute=get_weather_impl,
)

time_tool = tool(
    name="get_time",
    description="Get the current time in a specific timezone. Supports UTC, PST, EST, GMT, JST, and AEST.",
    input_schema={
        "type": "object",
        "properties": {
            "timezone": {
                "type": "string",
                "description": "The timezone (e.g., 'PST', 'EST', 'UTC')",
            },
        },
        "required": ["timezone"],
    },
    execute=get_time_impl,
)

# Available tools
AVAILABLE_TOOLS = [weather_tool, time_tool]

# Request/Response models
class Message(BaseModel):
    role: str
    content: str | None = None
    name: Optional[str] = None
    toolCalls: Optional[List[Dict[str, Any]]] = None
    toolCallId: Optional[str] = None

class ChatRequest(BaseModel):
    messages: List[Message]
    data: Optional[Dict[str, Any]] = None

@app.post("/chat")
async def chat_endpoint(request: ChatRequest):
    """
    Chat endpoint that streams responses in SSE format
    Compatible with TanStack AI client's fetchServerSentEvents adapter
    Now with automatic tool execution!
    """
    try:
        logger.info(f"📥 POST /chat received - {len(request.messages)} messages")
        
        # Convert Pydantic models to dict format for TanStack AI
        messages = [msg.model_dump() for msg in request.messages]
        logger.info(f"✅ Prepared {len(messages)} messages for chat")
        
        # Default model - claude-3-haiku is fast and works well for tool calling
        model = request.data.get("model") if request.data and request.data.get("model") else "claude-sonnet-4-5-20250929"
        logger.info(f"🤖 Using model: {model}")
        logger.info(f"🔧 Tools enabled: {len(AVAILABLE_TOOLS)} tools available")
        
        async def generate_stream():
            """Generate SSE stream with automatic tool execution"""
            chunk_count = 0
            tool_calls_count = 0
            try:
                logger.info(f"🚀 Starting agentic chat stream with {len(AVAILABLE_TOOLS)} tools")
                
                # Use the new chat function with tools and agentic loop
                async for chunk in chat(
                    adapter=adapter,
                    model=model,
                    messages=messages,
                    tools=AVAILABLE_TOOLS,
                    agent_loop_strategy=max_iterations(5),  # Allow up to 5 iterations
                    options={
                        "max_tokens": 1024,
                        "temperature": 0.7,
                    },
                ):
                    chunk_count += 1
                    chunk_type = chunk.get("type", "unknown")
                    
                    # Log tool-related events
                    if chunk_type == "tool_call":
                        tool_calls_count += 1
                        tool_name = chunk.get("toolCall", {}).get("function", {}).get("name")
                        logger.info(f"🔧 Tool call #{tool_calls_count}: {tool_name}")
                    elif chunk_type == "tool_result":
                        tool_id = chunk.get("toolCallId")
                        result = chunk.get("content", "")[:100]
                        logger.info(f"✅ Tool result for {tool_id}: {result}...")
                    
                    logger.debug(f"📤 Sending chunk #{chunk_count} (type: {chunk_type})")
                    yield format_sse_chunk(chunk)
                
                logger.info(f"✅ Stream complete - {chunk_count} chunks sent, {tool_calls_count} tools called")
                
                # Send completion marker
                logger.info("📤 Sending [DONE] marker")
                yield format_sse_done()
                
            except Exception as e:
                logger.error(f"❌ Error in stream: {type(e).__name__}: {str(e)}", exc_info=True)
                # Send error chunk
                error_chunk = {
                    "type": "error",
                    "id": "error",
                    "model": model,
                    "timestamp": 0,
                    "error": {
                        "message": str(e),
                        "code": type(e).__name__,
                    }
                }
                yield format_sse_chunk(error_chunk)
        
        logger.info("📡 Returning StreamingResponse with agentic tool support")
        return StreamingResponse(
            generate_stream(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no"  # Disable buffering for nginx
            }
        )
    
    except Exception as e:
        logger.error(f"❌ Error in chat_endpoint: {type(e).__name__}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "ok", "service": "tanstack-ai-fastapi"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)


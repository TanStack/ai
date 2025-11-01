"""
FastAPI server example for TanStack AI
Streams Anthropic API events in SSE format compatible with TanStack AI client
"""
import os
import logging
from typing import List, Dict, Any, Optional

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from anthropic import AsyncAnthropic

from tanstack_ai import StreamChunkConverter, format_messages_for_anthropic, format_sse_chunk, format_sse_done

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
print(f"🌐 Server will start on: http://0.0.0.0:8000")
print(f"   (Note: If running with uvicorn manually, use: uvicorn anthropic-server:app --reload --port 8000)")
print(f"{'='*60}\n")

client = AsyncAnthropic(api_key=ANTHROPIC_API_KEY)

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
    """
    try:
        logger.info(f"📥 POST /chat received - {len(request.messages)} messages")
        
        # Convert messages to Anthropic format
        system_message, anthropic_messages = format_messages_for_anthropic(request.messages)
        logger.info(f"✅ Converted {len(anthropic_messages)} messages to Anthropic format")
        if system_message:
            logger.info(f"📝 System message: {system_message[:50]}..." if len(system_message) > 50 else f"📝 System message: {system_message}")
        
        # Default model - claude-3-haiku-20240307 is confirmed to work
        model = request.data.get("model") if request.data and request.data.get("model") else "claude-3-haiku-20240307"
        logger.info(f"🤖 Using model: {model}")
        
        # Initialize converter (specify provider for better performance)
        converter = StreamChunkConverter(model=model, provider="anthropic")
        
        async def generate_stream():
            """Generate SSE stream from Anthropic events"""
            event_count = 0
            chunk_count = 0
            try:
                # Stream from Anthropic
                stream_params = {
                    "model": model,
                    "messages": anthropic_messages,
                    "max_tokens": 1024,
                    "temperature": 0.7
                }
                if system_message is not None and system_message.strip():
                    stream_params["system"] = system_message
                
                logger.info(f"🚀 Starting Anthropic stream with params: model={model}, messages={len(anthropic_messages)}, system={'yes' if system_message else 'no'}")
                
                async with client.messages.stream(**stream_params) as stream:
                    logger.info("✅ Anthropic stream opened, starting to receive events...")
                    async for event in stream:
                        event_count += 1
                        event_type = getattr(event, 'type', type(event).__name__)
                        logger.debug(f"📨 Received Anthropic event #{event_count}: {event_type}")
                        
                        # Convert Anthropic event to StreamChunk format using TanStack converter
                        chunks = await converter.convert_event(event)
                        
                        for chunk in chunks:
                            chunk_count += 1
                            chunk_type = chunk.get("type", "unknown")
                            logger.debug(f"📤 Sending chunk #{chunk_count} (type: {chunk_type})")
                            yield format_sse_chunk(chunk)
                
                logger.info(f"✅ Stream complete - {event_count} events, {chunk_count} chunks sent")
                
                # Send completion marker
                logger.info("📤 Sending [DONE] marker")
                yield format_sse_done()
                
            except Exception as e:
                logger.error(f"❌ Error in stream: {type(e).__name__}: {str(e)}", exc_info=True)
                # Send error chunk
                error_chunk = await converter.convert_error(e)
                yield format_sse_chunk(error_chunk)
        
        logger.info("📡 Returning StreamingResponse")
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


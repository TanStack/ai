"""
FastAPI server example for TanStack AI
Streams OpenAI API events in SSE format compatible with TanStack AI client
"""
import os
import logging
from typing import List, Dict, Any, Optional

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from openai import AsyncOpenAI

from tanstack_ai import StreamChunkConverter, format_messages_for_openai, format_sse_chunk, format_sse_done

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Load environment variables from .env file
load_dotenv()

# Initialize FastAPI app
app = FastAPI(title="TanStack AI Python FastAPI Example - OpenAI")

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify your frontend origin
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize OpenAI client
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
if not OPENAI_API_KEY:
    raise ValueError(
        "OPENAI_API_KEY environment variable is required. "
        "Please set it in your .env file or environment."
    )

# Validate API key format
if OPENAI_API_KEY.startswith("op://"):
    raise ValueError(
        "⚠️  ERROR: API key appears to be a 1Password reference (op://...).\n"
        "You need to use the actual API key value, not the 1Password reference.\n"
        "Please copy the actual key from 1Password (starts with 'sk-') and update your .env file."
    )

if not OPENAI_API_KEY.startswith("sk-"):
    print(f"⚠️  WARNING: API key doesn't start with 'sk-'. This may not be a valid OpenAI API key.")
    print(f"   Key starts with: {OPENAI_API_KEY[:10]}...")

if len(OPENAI_API_KEY) < 40:
    print(f"⚠️  WARNING: API key seems too short ({len(OPENAI_API_KEY)} chars). OpenAI keys are typically 50+ characters.")

# Display API key info on startup (masked for security)
def mask_api_key(key: str) -> str:
    """Mask API key showing only first 7 and last 4 characters"""
    if len(key) <= 11:
        return "*" * len(key)
    return f"{key[:7]}...{key[-4:]}"

print(f"\n{'='*60}")
print("🚀 TanStack AI FastAPI Server Starting (OpenAI)...")
print(f"{'='*60}")
print(f"✅ OPENAI_API_KEY loaded: {mask_api_key(OPENAI_API_KEY)}")
print(f"   Key length: {len(OPENAI_API_KEY)} characters")
print(f"🌐 Server will start on: http://0.0.0.0:8001")
print(f"   (Note: If running with uvicorn manually, use: uvicorn openai-server:app --reload --port 8001)")
print(f"{'='*60}\n")

client = AsyncOpenAI(api_key=OPENAI_API_KEY)

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
        
        # Convert messages to OpenAI format
        openai_messages = format_messages_for_openai(request.messages)
        logger.info(f"✅ Converted {len(openai_messages)} messages to OpenAI format")
        
        # Default model - gpt-4o is a good default
        model = request.data.get("model") if request.data and request.data.get("model") else "gpt-4o"
        logger.info(f"🤖 Using model: {model}")
        
        # Initialize converter (specify provider for better performance)
        converter = StreamChunkConverter(model=model, provider="openai")
        
        async def generate_stream():
            """Generate SSE stream from OpenAI events"""
            event_count = 0
            chunk_count = 0
            try:
                logger.info(f"🚀 Starting OpenAI stream for model: {model}")
                
                # Stream from OpenAI
                stream = await client.chat.completions.create(
                    model=model,
                    messages=openai_messages,
                    max_tokens=1024,
                    temperature=0.7,
                    stream=True
                )
                logger.info("✅ OpenAI stream created, starting to receive events...")
                
                async for event in stream:
                    event_count += 1
                    logger.debug(f"📨 Received OpenAI event #{event_count}: {type(event).__name__}")
                    
                    # Convert OpenAI event to StreamChunk format using TanStack converter
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
    return {"status": "ok", "service": "tanstack-ai-fastapi-openai"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)


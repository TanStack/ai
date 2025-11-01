#!/usr/bin/env python3
"""Test which Anthropic models work with your API key"""
import os
import sys
from pathlib import Path

# Add the python-fastapi directory to path
sys.path.insert(0, str(Path(__file__).parent))

from dotenv import load_dotenv
from anthropic import Anthropic

# Load .env file
env_path = Path(__file__).parent / '.env'
if env_path.exists():
    load_dotenv(env_path)
else:
    load_dotenv()

api_key = os.getenv("ANTHROPIC_API_KEY")

if not api_key:
    print("❌ No ANTHROPIC_API_KEY found in .env file")
    sys.exit(1)

client = Anthropic(api_key=api_key)

# Test different models
models_to_test = [
    "claude-3-haiku-20240307",
    "claude-3-sonnet-20240229", 
    "claude-3-opus-20240229",
    "claude-3-5-sonnet-20241022",
    "claude-3-5-sonnet-20240620",
]

print("Testing models with your API key...\n")

working_model = None
for model in models_to_test:
    try:
        response = client.messages.create(
            model=model,
            max_tokens=10,
            messages=[{"role": "user", "content": "Hi"}]
        )
        print(f"✅ {model} - WORKS!")
        working_model = model
        break
    except Exception as e:
        error_msg = str(e)
        if "not_found" in error_msg.lower():
            print(f"❌ {model} - Model not found")
        elif "authentication" in error_msg.lower():
            print(f"⚠️  {model} - Authentication error")
        else:
            print(f"❌ {model} - {error_msg[:100]}")

if working_model:
    print(f"\n✅ Use this model: {working_model}")
    print(f"\nUpdate main.py line 295 to use: model = \"{working_model}\"")
else:
    print("\n❌ No working models found. Check your API key permissions.")


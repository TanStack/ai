#!/bin/bash
# Helper script to run the FastAPI server with the virtual environment

cd "$(dirname "$0")"
source venv/bin/activate
python anthropic-server.py

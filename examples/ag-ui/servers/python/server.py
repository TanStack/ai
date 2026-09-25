#!/usr/bin/env python3

import json
import os
import sys
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any, Callable, Iterable

HOST = "127.0.0.1"
PORT = int(os.environ.get("PORT", "8006"))
DEFAULT_OPENAI_MODEL = "gpt-4o"
DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-4-6"


def text_from_message(message: dict[str, Any]) -> str:
    parts = message.get("parts")
    if isinstance(parts, list):
        text_parts = [
            part["content"]
            for part in parts
            if isinstance(part, dict)
            and part.get("type") == "text"
            and isinstance(part.get("content"), str)
        ]
        if text_parts:
            return "".join(text_parts)

    content = message.get("content")
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "".join(
            item["text"]
            for item in content
            if isinstance(item, dict)
            and item.get("type") == "text"
            and isinstance(item.get("text"), str)
        )
    return ""


def to_chat_messages(
    messages: Any,
) -> tuple[str, list[dict[str, str]]]:
    system_parts: list[str] = []
    chat: list[dict[str, str]] = []

    if not isinstance(messages, list):
        return "", chat

    for message in messages:
        if not isinstance(message, dict):
            continue

        role = message.get("role")
        if role == "developer":
            role = "system"
        if role not in ("system", "user", "assistant"):
            continue

        text = text_from_message(message)
        if not text:
            continue

        if role == "system":
            system_parts.append(text)
        else:
            chat.append({"role": role, "content": text})

    return "\n\n".join(system_parts), chat


def props_from_input(input_data: dict[str, Any]) -> dict[str, Any]:
    forwarded = input_data.get("forwardedProps")
    if isinstance(forwarded, dict) and forwarded:
        return forwarded

    data = input_data.get("data")
    if isinstance(data, dict):
        return data

    return {}


def provider_from_input(input_data: dict[str, Any]) -> tuple[str, str]:
    props = props_from_input(input_data)
    provider = props.get("provider", "openai")
    model = props.get("model", "")

    if not isinstance(provider, str) or not provider:
        provider = "openai"
    if not isinstance(model, str):
        model = ""

    if provider == "openai":
        return provider, model or DEFAULT_OPENAI_MODEL
    if provider == "anthropic":
        return provider, model or DEFAULT_ANTHROPIC_MODEL
    raise RuntimeError(
        f'unsupported provider "{provider}" (expected openai or anthropic)'
    )


def stream_provider_sse(
    url: str,
    headers: dict[str, str],
    payload: dict[str, Any],
) -> Iterable[dict[str, Any]]:
    request = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers=headers,
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=120) as response:
            for raw_line in response:
                line = raw_line.decode("utf-8").rstrip("\r\n")
                if not line.startswith("data: "):
                    continue
                data = line[6:]
                if data == "[DONE]":
                    return
                try:
                    parsed = json.loads(data)
                except json.JSONDecodeError:
                    continue
                if isinstance(parsed, dict):
                    yield parsed
    except urllib.error.HTTPError as error:
        raise RuntimeError(
            f"provider request failed ({error.code})"
        ) from error
    except urllib.error.URLError as error:
        raise RuntimeError(f"provider request failed: {error.reason}") from error


def stream_openai(
    model: str,
    system: str,
    messages: list[dict[str, str]],
    emit: Callable[[str], None],
) -> None:
    api_key = os.environ.get("OPENAI_API_KEY", "")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY is not set")

    openai_messages = list(messages)
    if system:
        openai_messages.insert(0, {"role": "system", "content": system})

    for event in stream_provider_sse(
        "https://api.openai.com/v1/chat/completions",
        {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        {
            "model": model,
            "messages": openai_messages,
            "stream": True,
        },
    ):
        choices = event.get("choices")
        if not isinstance(choices, list) or not choices:
            continue
        choice = choices[0]
        if not isinstance(choice, dict):
            continue
        delta = choice.get("delta")
        if not isinstance(delta, dict):
            continue
        content = delta.get("content")
        if isinstance(content, str) and content:
            emit(content)


def stream_anthropic(
    model: str,
    system: str,
    messages: list[dict[str, str]],
    emit: Callable[[str], None],
) -> None:
    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not api_key:
        raise RuntimeError("ANTHROPIC_API_KEY is not set")

    payload: dict[str, Any] = {
        "model": model,
        "max_tokens": 4096,
        "messages": messages,
        "stream": True,
    }
    if system:
        payload["system"] = system

    for event in stream_provider_sse(
        "https://api.anthropic.com/v1/messages",
        {
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json",
        },
        payload,
    ):
        if event.get("type") != "content_block_delta":
            continue
        delta = event.get("delta")
        if not isinstance(delta, dict) or delta.get("type") != "text_delta":
            continue
        text = delta.get("text")
        if isinstance(text, str) and text:
            emit(text)


def stream_completion(
    provider: str,
    model: str,
    system: str,
    messages: list[dict[str, str]],
    emit: Callable[[str], None],
) -> None:
    if provider == "openai":
        stream_openai(model, system, messages, emit)
        return
    if provider == "anthropic":
        stream_anthropic(model, system, messages, emit)
        return
    raise RuntimeError(
        f'unsupported provider "{provider}" (expected openai or anthropic)'
    )


class AguiHandler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, format: str, *args: Any) -> None:
        sys.stderr.write(f"[python] {format % args}\n")

    def send_text(self, status: int, message: str) -> None:
        body = message.encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self) -> None:
        if self.path.split("?", 1)[0] == "/health":
            self.send_text(200, "ok")
            return
        self.send_text(405, "method not allowed")

    def do_POST(self) -> None:
        if self.path.split("?", 1)[0] != "/":
            self.send_text(404, "not found")
            return

        try:
            content_length = int(self.headers.get("Content-Length", "0"))
            input_data = json.loads(self.rfile.read(content_length))
        except (ValueError, json.JSONDecodeError, UnicodeDecodeError):
            self.send_text(400, "invalid JSON body")
            return

        if not isinstance(input_data, dict):
            self.send_text(400, "invalid JSON body")
            return

        thread_id = input_data.get("threadId")
        run_id = input_data.get("runId")
        if not isinstance(thread_id, str) or not thread_id or not isinstance(
            run_id, str
        ) or not run_id:
            self.send_text(400, "threadId and runId are required")
            return

        system, messages = to_chat_messages(input_data.get("messages"))
        self.begin_sse()
        self.write_event(
            {"type": "RUN_STARTED", "threadId": thread_id, "runId": run_id}
        )

        if not messages:
            self.write_run_error(
                thread_id, run_id, "no user or assistant messages to send"
            )
            self.write_done()
            return

        message_id = f"msg-{run_id}"
        self.write_event(
            {
                "type": "TEXT_MESSAGE_START",
                "messageId": message_id,
                "role": "assistant",
            }
        )

        try:
            provider, model = provider_from_input(input_data)
            stream_completion(
                provider,
                model,
                system,
                messages,
                lambda delta: self.write_event(
                    {
                        "type": "TEXT_MESSAGE_CONTENT",
                        "messageId": message_id,
                        "delta": delta,
                    }
                ),
            )
            self.write_event(
                {"type": "TEXT_MESSAGE_END", "messageId": message_id}
            )
            self.write_event(
                {
                    "type": "RUN_FINISHED",
                    "threadId": thread_id,
                    "runId": run_id,
                    "finishReason": "stop",
                }
            )
            self.write_done()
        except Exception as error:
            self.log_message("chat error: %s", error)
            self.write_run_error(thread_id, run_id, str(error))
            self.write_done()

    def begin_sse(self) -> None:
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Connection", "close")
        self.end_headers()

    def write_event(self, event: dict[str, Any]) -> None:
        frame = f"data: {json.dumps(event, ensure_ascii=False)}\n\n"
        self.wfile.write(frame.encode("utf-8"))
        self.wfile.flush()

    def write_run_error(
        self, thread_id: str, run_id: str, message: str
    ) -> None:
        self.write_event(
            {
                "type": "RUN_ERROR",
                "threadId": thread_id,
                "runId": run_id,
                "error": {"message": message},
            }
        )

    def write_done(self) -> None:
        self.wfile.write(b"data: [DONE]\n\n")
        self.wfile.flush()


def main() -> None:
    server = ThreadingHTTPServer((HOST, PORT), AguiHandler)
    print(
        f"[python] listening on http://{HOST}:{PORT}",
        flush=True,
    )
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()

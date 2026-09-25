#!/usr/bin/env bash

set -uo pipefail

PORT="${PORT:-8005}"
SCRIPT_PATH="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/$(basename "${BASH_SOURCE[0]}")"
DEFAULT_OPENAI_MODEL="gpt-4o"
DEFAULT_ANTHROPIC_MODEL="claude-sonnet-4-6"

json_event() {
  jq -nc "$@"
}

write_event() {
  printf 'data: %s\n\n' "$1"
}

write_done() {
  printf 'data: [DONE]\n\n'
}

write_error_response() {
  local status="$1"
  local message="$2"
  printf 'HTTP/1.1 %s\r\n' "$status"
  printf 'Content-Type: text/plain; charset=utf-8\r\n'
  printf 'Access-Control-Allow-Origin: *\r\n'
  printf 'Connection: close\r\n'
  printf '\r\n'
  printf '%s' "$message"
}

normalize_messages() {
  jq -c '
    def message_text:
      if (.parts? | type) == "array" then
        [.parts[]? |
          select(
            type == "object" and
            .type == "text" and
            (.content | type) == "string"
          ) |
          .content
        ] | join("")
      elif (.content? | type) == "string" then
        .content
      elif (.content? | type) == "array" then
        [.content[]? |
          select(
            type == "object" and
            .type == "text" and
            (.text | type) == "string"
          ) |
          .text
        ] | join("")
      else
        ""
      end;

    [.messages[]? |
      select(type == "object") |
      (if .role == "developer" then "system" else (.role // "") end) as $role |
      message_text as $content |
      select(
        ($role == "system" or $role == "user" or $role == "assistant") and
        ($content | length) > 0
      ) |
      { role: $role, content: $content }
    ]
  '
}

process_openai_stream() {
  local message_id="$1"
  local line data event

  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line%$'\r'}"
    [[ "$line" == "data: "* ]] || continue
    data="${line#data: }"
    [[ "$data" == "[DONE]" ]] && continue

    event="$(
      jq -c --arg messageId "$message_id" '
        .choices[0].delta.content? as $delta |
        select(($delta | type) == "string" and ($delta | length) > 0) |
        {
          type: "TEXT_MESSAGE_CONTENT",
          messageId: $messageId,
          delta: $delta
        }
      ' <<<"$data" 2>/dev/null
    )" || continue

    [[ -n "$event" ]] && write_event "$event"
  done
}

process_anthropic_stream() {
  local message_id="$1"
  local line data event

  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line%$'\r'}"
    [[ "$line" == "data: "* ]] || continue
    data="${line#data: }"

    event="$(
      jq -c --arg messageId "$message_id" '
        select(
          .type == "content_block_delta" and
          .delta.type == "text_delta" and
          (.delta.text | type) == "string" and
          (.delta.text | length) > 0
        ) |
        {
          type: "TEXT_MESSAGE_CONTENT",
          messageId: $messageId,
          delta: .delta.text
        }
      ' <<<"$data" 2>/dev/null
    )" || continue

    [[ -n "$event" ]] && write_event "$event"
  done
}

stream_openai() {
  local payload="$1"
  local message_id="$2"

  curl --silent --show-error --no-buffer --fail \
    https://api.openai.com/v1/chat/completions \
    -H "Authorization: Bearer ${OPENAI_API_KEY}" \
    -H 'Content-Type: application/json' \
    --data-binary "$payload" |
    process_openai_stream "$message_id"

  return "${PIPESTATUS[0]}"
}

stream_anthropic() {
  local payload="$1"
  local message_id="$2"

  curl --silent --show-error --no-buffer --fail \
    https://api.anthropic.com/v1/messages \
    -H "x-api-key: ${ANTHROPIC_API_KEY}" \
    -H 'anthropic-version: 2023-06-01' \
    -H 'Content-Type: application/json' \
    --data-binary "$payload" |
    process_anthropic_stream "$message_id"

  return "${PIPESTATUS[0]}"
}

handle_chat() {
  local body="$1"
  local thread_id run_id provider model normalized system chat message_id payload
  local stream_status

  thread_id="$(jq -r 'if (.threadId? | type) == "string" then .threadId else "" end' <<<"$body")"
  run_id="$(jq -r 'if (.runId? | type) == "string" then .runId else "" end' <<<"$body")"

  if [[ -z "$thread_id" || -z "$run_id" ]]; then
    write_error_response '400 Bad Request' 'threadId and runId are required'
    return
  fi

  provider="$(
    jq -r '
      (.forwardedProps // .data // {}) as $props |
      if ($props.provider? | type) == "string" and ($props.provider | length) > 0
      then $props.provider
      else "openai"
      end
    ' <<<"$body"
  )"
  model="$(
    jq -r '
      (.forwardedProps // .data // {}) as $props |
      if ($props.model? | type) == "string" then $props.model else "" end
    ' <<<"$body"
  )"

  normalized="$(normalize_messages <<<"$body")"
  system="$(
    jq -r '[.[] | select(.role == "system") | .content] | join("\n\n")' \
      <<<"$normalized"
  )"
  chat="$(jq -c '[.[] | select(.role == "user" or .role == "assistant")]' <<<"$normalized")"

  printf 'HTTP/1.1 200 OK\r\n'
  printf 'Content-Type: text/event-stream\r\n'
  printf 'Cache-Control: no-cache\r\n'
  printf 'Connection: close\r\n'
  printf 'Access-Control-Allow-Origin: *\r\n'
  printf '\r\n'

  message_id="msg-${run_id}"
  write_event "$(
    json_event \
      --arg threadId "$thread_id" \
      --arg runId "$run_id" \
      '{ type: "RUN_STARTED", threadId: $threadId, runId: $runId }'
  )"

  if [[ "$(jq 'length' <<<"$chat")" -eq 0 ]]; then
    write_event "$(
      json_event \
        --arg threadId "$thread_id" \
        --arg runId "$run_id" \
        --arg message 'no user or assistant messages to send' \
        '{
          type: "RUN_ERROR",
          threadId: $threadId,
          runId: $runId,
          error: { message: $message }
        }'
    )"
    write_done
    return
  fi

  write_event "$(
    json_event \
      --arg messageId "$message_id" \
      '{ type: "TEXT_MESSAGE_START", messageId: $messageId, role: "assistant" }'
  )"

  case "$provider" in
    openai)
      if [[ -z "${OPENAI_API_KEY:-}" ]]; then
        stream_status=1
      else
        [[ -n "$model" ]] || model="$DEFAULT_OPENAI_MODEL"
        payload="$(
          jq -nc \
            --arg model "$model" \
            --arg system "$system" \
            --argjson messages "$chat" '
              {
                model: $model,
                messages:
                  (if ($system | length) > 0
                   then [{ role: "system", content: $system }] + $messages
                   else $messages
                   end),
                stream: true
              }
            '
        )"
        stream_openai "$payload" "$message_id"
        stream_status=$?
      fi
      ;;
    anthropic)
      if [[ -z "${ANTHROPIC_API_KEY:-}" ]]; then
        stream_status=1
      else
        [[ -n "$model" ]] || model="$DEFAULT_ANTHROPIC_MODEL"
        payload="$(
          jq -nc \
            --arg model "$model" \
            --arg system "$system" \
            --argjson messages "$chat" '
              {
                model: $model,
                max_tokens: 4096,
                messages: $messages,
                stream: true
              } +
              (if ($system | length) > 0 then { system: $system } else {} end)
            '
        )"
        stream_anthropic "$payload" "$message_id"
        stream_status=$?
      fi
      ;;
    *)
      stream_status=1
      ;;
  esac

  if [[ "$stream_status" -ne 0 ]]; then
    local error_message
    case "$provider" in
      openai)
        error_message="${OPENAI_API_KEY:+OpenAI request failed}"
        error_message="${error_message:-OPENAI_API_KEY is not set}"
        ;;
      anthropic)
        error_message="${ANTHROPIC_API_KEY:+Anthropic request failed}"
        error_message="${error_message:-ANTHROPIC_API_KEY is not set}"
        ;;
      *)
        error_message="unsupported provider \"${provider}\" (expected openai or anthropic)"
        ;;
    esac

    write_event "$(
      json_event \
        --arg threadId "$thread_id" \
        --arg runId "$run_id" \
        --arg message "$error_message" \
        '{
          type: "RUN_ERROR",
          threadId: $threadId,
          runId: $runId,
          error: { message: $message }
        }'
    )"
    write_done
    return
  fi

  write_event "$(
    json_event \
      --arg messageId "$message_id" \
      '{ type: "TEXT_MESSAGE_END", messageId: $messageId }'
  )"
  write_event "$(
    json_event \
      --arg threadId "$thread_id" \
      --arg runId "$run_id" \
      '{
        type: "RUN_FINISHED",
        threadId: $threadId,
        runId: $runId,
        finishReason: "stop"
      }'
  )"
  write_done
}

handle_connection() {
  local request_line method target version line header_name header_value
  local content_length=0 body=''

  IFS= read -r request_line || return
  request_line="${request_line%$'\r'}"
  read -r method target version <<<"$request_line"

  while IFS= read -r line; do
    line="${line%$'\r'}"
    [[ -z "$line" ]] && break

    header_name="${line%%:*}"
    header_value="${line#*:}"
    header_value="${header_value#"${header_value%%[![:space:]]*}"}"
    if [[ "${header_name,,}" == 'content-length' ]]; then
      content_length="$header_value"
    fi
  done

  if ! [[ "$content_length" =~ ^[0-9]+$ ]]; then
    write_error_response '400 Bad Request' 'invalid Content-Length'
    return
  fi

  if [[ "$content_length" -gt 0 ]]; then
    body="$(dd bs=1 count="$content_length" 2>/dev/null)"
  fi

  target="${target%%\?*}"

  if [[ "$method" == 'OPTIONS' ]]; then
    printf 'HTTP/1.1 204 No Content\r\n'
    printf 'Access-Control-Allow-Origin: *\r\n'
    printf 'Access-Control-Allow-Methods: POST, OPTIONS\r\n'
    printf 'Access-Control-Allow-Headers: Content-Type\r\n'
    printf 'Connection: close\r\n'
    printf '\r\n'
    return
  fi

  if [[ "$method" == 'GET' && "$target" == '/health' ]]; then
    printf 'HTTP/1.1 200 OK\r\n'
    printf 'Content-Type: text/plain; charset=utf-8\r\n'
    printf 'Content-Length: 2\r\n'
    printf 'Connection: close\r\n'
    printf '\r\n'
    printf 'ok'
    return
  fi

  if [[ "$method" != 'POST' ]]; then
    write_error_response '405 Method Not Allowed' 'method not allowed'
    return
  fi

  if [[ "$target" != '/' ]]; then
    write_error_response '404 Not Found' 'not found'
    return
  fi

  if ! jq -e 'type == "object"' >/dev/null 2>&1 <<<"$body"; then
    write_error_response '400 Bad Request' 'invalid JSON body'
    return
  fi

  handle_chat "$body"
}

check_dependencies() {
  local dependency
  for dependency in bash curl jq socat; do
    if ! command -v "$dependency" >/dev/null 2>&1; then
      printf '[bash] missing dependency: %s\n' "$dependency" >&2
      return 1
    fi
  done
}

if [[ "${1:-}" == '--handle' ]]; then
  handle_connection
  exit 0
fi

check_dependencies || exit 1
printf '[bash] listening on http://127.0.0.1:%s\n' "$PORT"
exec socat \
  "TCP-LISTEN:${PORT},bind=127.0.0.1,reuseaddr,fork" \
  "SYSTEM:exec bash '${SCRIPT_PATH}' --handle"

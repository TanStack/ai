mod agui;
mod messages;
mod providers;

use agui::{
    provider_from_input, run_error, run_finished, run_started, sse_done, text_message_content,
    text_message_end, text_message_start, RunAgentInput,
};
use async_stream::stream;
use axum::{
    body::{Body, Bytes},
    extract::{Request, State},
    http::{header, Method, StatusCode},
    response::{IntoResponse, Response},
    routing::{get, post},
    Router,
};
use futures_util::stream;
use messages::to_chat_messages;
use providers::stream_completion;
use reqwest::Client;
use std::convert::Infallible;
use tokio::sync::mpsc;

const LISTEN_ADDR: &str = "127.0.0.1:8002";

#[tokio::main]
async fn main() {
    let client = Client::new();
    let app = Router::new()
        .route("/", post(handle_chat))
        .route("/health", get(|| async { "ok" }))
        .with_state(client);

    let listener = tokio::net::TcpListener::bind(LISTEN_ADDR)
        .await
        .expect("failed to bind rust server");

    println!("AG-UI Rust server listening on http://{LISTEN_ADDR}");

    axum::serve(listener, app)
        .await
        .expect("rust server failed");
}

async fn handle_chat(State(client): State<Client>, request: Request) -> Response {
    if request.method() == Method::OPTIONS {
        return options_response();
    }

    let body = axum::body::to_bytes(request.into_body(), 1024 * 1024)
        .await
        .unwrap_or_default();

    let input: RunAgentInput = match serde_json::from_slice(&body) {
        Ok(value) => value,
        Err(_) => {
            return (StatusCode::BAD_REQUEST, "invalid JSON body").into_response();
        }
    };

    if input.thread_id.is_empty() || input.run_id.is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            "threadId and runId are required",
        )
            .into_response();
    }

    let config = provider_from_input(&input);
    let message_id = format!("msg-{}", input.run_id);
    let (system, messages) = to_chat_messages(&input.messages);

    if messages.is_empty() {
        let frames = vec![
            run_started(&input.thread_id, &input.run_id),
            run_error(
                &input.thread_id,
                &input.run_id,
                "no user or assistant messages to send",
            ),
            sse_done(),
        ];
        return sse_response(stream::iter(
            frames
                .into_iter()
                .map(|frame| Ok::<Bytes, Infallible>(Bytes::from(frame))),
        ));
    }

    let thread_id = input.thread_id.clone();
    let run_id = input.run_id.clone();
    let provider = config.provider.clone();
    let model = config.model.clone();
    let (tx, mut rx) = mpsc::unbounded_channel::<String>();

    let llm_client = client.clone();
    let llm_message_id = message_id.clone();
    let llm_system = system.clone();
    let llm_messages = messages.clone();

    tokio::spawn(async move {
        let result = stream_completion(
            &llm_client,
            &provider,
            &model,
            &llm_system,
            &llm_messages,
            |delta| {
                if delta.is_empty() {
                    return Ok(());
                }
                tx.send(text_message_content(&llm_message_id, &delta))
                    .map_err(|_| "client disconnected".to_string())
            },
        )
        .await;

        let _ = match result {
            Ok(()) => tx.send(format!(
                "{}{}{}",
                text_message_end(&llm_message_id),
                run_finished(&thread_id, &run_id),
                sse_done()
            )),
            Err(message) => {
                eprintln!("[rust] chat error: {message}");
                tx.send(format!(
                    "{}{}",
                    run_error(&thread_id, &run_id, &message),
                    sse_done()
                ))
            }
        };
    });

    let body_stream = stream! {
        yield Ok(Bytes::from(run_started(&input.thread_id, &input.run_id)));
        yield Ok(Bytes::from(text_message_start(&message_id)));

        while let Some(frame) = rx.recv().await {
            yield Ok(Bytes::from(frame));
        }
    };

    sse_response(body_stream)
}

fn sse_response(
    body_stream: impl futures_util::Stream<Item = Result<Bytes, Infallible>> + Send + 'static,
) -> Response {
    Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, "text/event-stream")
        .header(header::CACHE_CONTROL, "no-cache")
        .header(header::CONNECTION, "keep-alive")
        .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
        .body(Body::from_stream(body_stream))
        .unwrap()
}

fn options_response() -> Response {
    Response::builder()
        .status(StatusCode::NO_CONTENT)
        .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
        .header(header::ACCESS_CONTROL_ALLOW_METHODS, "POST, OPTIONS")
        .header(header::ACCESS_CONTROL_ALLOW_HEADERS, "Content-Type")
        .body(Body::empty())
        .unwrap()
}

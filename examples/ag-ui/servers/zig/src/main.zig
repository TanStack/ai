const std = @import("std");
const Io = std.Io;

const agui = @import("agui.zig");
const messages = @import("messages.zig");
const providers = @import("providers.zig");

const LISTEN_ADDR = "127.0.0.1";
const LISTEN_PORT: u16 = 8004;

pub fn main(init: std.process.Init) !void {
    const allocator = init.gpa;
    const io = init.io;

    const address = try Io.net.IpAddress.parse(LISTEN_ADDR, LISTEN_PORT);
    var listener = try address.listen(io, .{ .reuse_address = true });
    defer listener.socket.close(io);

    std.debug.print("AG-UI Zig server listening on http://127.0.0.1:{d}\n", .{LISTEN_PORT});

    while (true) {
        const stream = try listener.accept(io);
        handleConnection(allocator, io, stream) catch |err| {
            std.log.err("connection error: {}", .{err});
        };
    }
}

fn handleConnection(allocator: std.mem.Allocator, io: Io, stream: Io.net.Stream) !void {
    defer stream.close(io);

    var recv_buffer: [8192]u8 = undefined;
    var send_buffer: [8192]u8 = undefined;
    var conn_reader = stream.reader(io, &recv_buffer);
    var conn_writer = stream.writer(io, &send_buffer);
    var server = std.http.Server.init(&conn_reader.interface, &conn_writer.interface);

    while (server.reader.state == .ready) {
        var request = server.receiveHead() catch |err| switch (err) {
            error.HttpConnectionClosing => return,
            else => return err,
        };

        try serveRequest(allocator, io, &request);
    }
}

fn serveRequest(allocator: std.mem.Allocator, io: Io, request: *std.http.Server.Request) !void {
    if (request.head.method == .OPTIONS) {
        try sendOptions(request);
        return;
    }

    if (request.head.method == .GET and std.mem.eql(u8, request.head.target, "/health")) {
        try request.respond("ok", .{
            .extra_headers = &.{
                .{ .name = "content-type", .value = "text/plain" },
                .{ .name = "access-control-allow-origin", .value = "*" },
            },
        });
        return;
    }

    if (request.head.method == .POST and std.mem.eql(u8, request.head.target, "/")) {
        try handleChat(allocator, io, request);
        return;
    }

    if (request.head.method == .POST) {
        try sendPlainError(request, .not_found, "not found");
        return;
    }

    try sendPlainError(request, .method_not_allowed, "method not allowed");
}

fn sendOptions(request: *std.http.Server.Request) !void {
    try request.respond("", .{
        .status = .no_content,
        .extra_headers = &.{
            .{ .name = "access-control-allow-origin", .value = "*" },
            .{ .name = "access-control-allow-methods", .value = "POST, OPTIONS" },
            .{ .name = "access-control-allow-headers", .value = "Content-Type" },
        },
    });
}

fn sendPlainError(request: *std.http.Server.Request, status: std.http.Status, message: []const u8) !void {
    try request.respond(message, .{
        .status = status,
        .extra_headers = &.{
            .{ .name = "content-type", .value = "text/plain" },
        },
    });
}

const EmitCtx = struct {
    allocator: std.mem.Allocator,
    response: *std.http.BodyWriter,
    message_id: []const u8,

    fn emit(ctx: *anyopaque, delta: []const u8) !void {
        const self: *EmitCtx = @ptrCast(@alignCast(ctx));
        if (delta.len == 0) return;
        const frame = try agui.textMessageContent(self.allocator, self.message_id, delta);
        defer self.allocator.free(frame);
        try agui.writeSse(self.response, frame);
    }
};

fn handleChat(allocator: std.mem.Allocator, io: Io, request: *std.http.Server.Request) !void {
    var body_reader_buffer: [4096]u8 = undefined;
    const body_reader = request.readerExpectContinue(&body_reader_buffer) catch {
        try sendPlainError(request, .bad_request, "failed to read body");
        return;
    };

    const body = body_reader.allocRemaining(allocator, .limited(1024 * 1024)) catch {
        try sendPlainError(request, .bad_request, "failed to read body");
        return;
    };
    defer allocator.free(body);

    const parsed = std.json.parseFromSlice(agui.RunAgentInput, allocator, body, .{
        .ignore_unknown_fields = true,
    }) catch {
        try sendPlainError(request, .bad_request, "invalid JSON body");
        return;
    };
    defer parsed.deinit();

    const input = parsed.value;
    if (input.threadId.len == 0 or input.runId.len == 0) {
        try sendPlainError(request, .bad_request, "threadId and runId are required");
        return;
    }

    const config = agui.providerFromInput(&input, allocator) catch {
        try sendPlainError(request, .internal_server_error, "failed to parse provider config");
        return;
    };
    defer allocator.free(config.model);

    const chat_messages = messages.toChatMessages(allocator, input.messages) catch {
        try sendPlainError(request, .internal_server_error, "failed to parse messages");
        return;
    };
    defer messages.freeChatMessages(allocator, chat_messages.system, chat_messages.chat);

    if (chat_messages.chat.len == 0) {
        try streamErrorOnly(allocator, request, input.threadId, input.runId, "no user or assistant messages to send");
        return;
    }

    var send_buffer: [4096]u8 = undefined;
    var response = request.respondStreaming(&send_buffer, .{
        .respond_options = .{
            .extra_headers = &.{
                .{ .name = "content-type", .value = "text/event-stream" },
                .{ .name = "cache-control", .value = "no-cache" },
                .{ .name = "connection", .value = "keep-alive" },
                .{ .name = "access-control-allow-origin", .value = "*" },
            },
        },
    }) catch {
        try sendPlainError(request, .internal_server_error, "streaming unsupported");
        return;
    };

    const message_id = try std.fmt.allocPrint(allocator, "msg-{s}", .{input.runId});
    defer allocator.free(message_id);

    const started = try agui.runStarted(allocator, input.threadId, input.runId);
    defer allocator.free(started);
    try agui.writeSse(&response, started);

    const text_start = try agui.textMessageStart(allocator, message_id);
    defer allocator.free(text_start);
    try agui.writeSse(&response, text_start);

    var emit_ctx = EmitCtx{
        .allocator = allocator,
        .response = &response,
        .message_id = message_id,
    };

    providers.streamCompletion(
        allocator,
        io,
        config,
        chat_messages.system,
        chat_messages.chat,
        &emit_ctx,
        EmitCtx.emit,
    ) catch |err| {
        const message = switch (err) {
            error.MissingOpenAIKey => "OPENAI_API_KEY is not set",
            error.MissingAnthropicKey => "ANTHROPIC_API_KEY is not set",
            error.UnsupportedProvider => "unsupported provider (expected openai or anthropic)",
            error.UnsupportedCompressionMethod => "unsupported provider compression",
            else => "provider request failed",
        };
        const frame = try agui.runError(allocator, input.threadId, input.runId, message);
        defer allocator.free(frame);
        try agui.writeSse(&response, frame);
        const done = try agui.sseDone(allocator);
        defer allocator.free(done);
        try agui.writeSse(&response, done);
        try response.end();
        return;
    };

    const text_end = try agui.textMessageEnd(allocator, message_id);
    defer allocator.free(text_end);
    try agui.writeSse(&response, text_end);

    const finished = try agui.runFinished(allocator, input.threadId, input.runId);
    defer allocator.free(finished);
    try agui.writeSse(&response, finished);

    const done = try agui.sseDone(allocator);
    defer allocator.free(done);
    try agui.writeSse(&response, done);
    try response.end();
}

fn streamErrorOnly(
    allocator: std.mem.Allocator,
    request: *std.http.Server.Request,
    thread_id: []const u8,
    run_id: []const u8,
    message: []const u8,
) !void {
    var send_buffer: [4096]u8 = undefined;
    var response = try request.respondStreaming(&send_buffer, .{
        .respond_options = .{
            .extra_headers = &.{
                .{ .name = "content-type", .value = "text/event-stream" },
                .{ .name = "cache-control", .value = "no-cache" },
                .{ .name = "connection", .value = "keep-alive" },
                .{ .name = "access-control-allow-origin", .value = "*" },
            },
        },
    });

    const started = try agui.runStarted(allocator, thread_id, run_id);
    defer allocator.free(started);
    try agui.writeSse(&response, started);

    const frame = try agui.runError(allocator, thread_id, run_id, message);
    defer allocator.free(frame);
    try agui.writeSse(&response, frame);

    const done = try agui.sseDone(allocator);
    defer allocator.free(done);
    try agui.writeSse(&response, done);
    try response.end();
}

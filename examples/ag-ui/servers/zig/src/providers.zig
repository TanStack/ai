const std = @import("std");
const agui = @import("agui.zig");

pub const MissingOpenAIKey = error.MissingOpenAIKey;
pub const MissingAnthropicKey = error.MissingAnthropicKey;
pub const UnsupportedProvider = error.UnsupportedProvider;
pub const ProviderRequestFailed = error.ProviderRequestFailed;
pub const UnsupportedCompressionMethod = error.UnsupportedCompressionMethod;

const EmitFn = *const fn (ctx: *anyopaque, delta: []const u8) anyerror!void;
const HandleDataLineFn = *const fn (allocator: std.mem.Allocator, data: []const u8, ctx: *anyopaque, emit: EmitFn) anyerror!void;

const OpenAIChunk = struct {
    choices: []struct {
        delta: struct {
            content: ?[]const u8 = null,
        },
    },
};

const AnthropicChunk = struct {
    type: []const u8,
    delta: ?struct {
        type: []const u8,
        text: ?[]const u8 = null,
    } = null,
};

fn shiftLine(remaining: *std.ArrayList(u8), line_end: usize) void {
    const remainder_start = line_end + 1;
    const remainder_len = remaining.items.len - remainder_start;
    if (remainder_len > 0) {
        std.mem.copyForwards(u8, remaining.items[0..remainder_len], remaining.items[remainder_start..]);
    }
    remaining.items.len = remainder_len;
}

fn handleOpenAILine(allocator: std.mem.Allocator, data: []const u8, ctx: *anyopaque, emit: EmitFn) !void {
    var parsed = std.json.parseFromSlice(OpenAIChunk, allocator, data, .{
        .ignore_unknown_fields = true,
    }) catch return;
    defer parsed.deinit();
    if (parsed.value.choices.len == 0) return;
    if (parsed.value.choices[0].delta.content) |content| {
        if (content.len > 0) try emit(ctx, content);
    }
}

fn handleAnthropicLine(allocator: std.mem.Allocator, data: []const u8, ctx: *anyopaque, emit: EmitFn) !void {
    var parsed = std.json.parseFromSlice(AnthropicChunk, allocator, data, .{
        .ignore_unknown_fields = true,
    }) catch return;
    defer parsed.deinit();
    if (!std.mem.eql(u8, parsed.value.type, "content_block_delta")) return;
    const delta = parsed.value.delta orelse return;
    if (!std.mem.eql(u8, delta.type, "text_delta")) return;
    if (delta.text) |text| {
        if (text.len > 0) try emit(ctx, text);
    }
}

fn processSseLine(
    allocator: std.mem.Allocator,
    line: []const u8,
    ctx: *anyopaque,
    emit: EmitFn,
    handleDataLine: HandleDataLineFn,
) !bool {
    if (!std.mem.startsWith(u8, line, "data: ")) return false;
    const data = std.mem.trim(u8, line[6..], " \t");
    if (std.mem.eql(u8, data, "[DONE]")) return true;
    try handleDataLine(allocator, data, ctx, emit);
    return false;
}

fn processSseBuffer(
    allocator: std.mem.Allocator,
    remaining: *std.ArrayList(u8),
    ctx: *anyopaque,
    emit: EmitFn,
    handleDataLine: HandleDataLineFn,
) !bool {
    while (std.mem.indexOfScalar(u8, remaining.items, '\n')) |line_end| {
        const line = std.mem.trimEnd(u8, remaining.items[0..line_end], "\r");
        if (try processSseLine(allocator, line, ctx, emit, handleDataLine)) return true;
        shiftLine(remaining, line_end);
    }
    return false;
}

fn streamProviderSse(
    allocator: std.mem.Allocator,
    io: std.Io,
    url: []const u8,
    headers: []const std.http.Header,
    payload: []const u8,
    handleDataLine: HandleDataLineFn,
    ctx: *anyopaque,
    emit: EmitFn,
) !void {
    var client: std.http.Client = .{
        .allocator = allocator,
        .io = io,
    };
    defer client.deinit();

    const uri = try std.Uri.parse(url);
    var req = try std.http.Client.request(&client, .POST, uri, .{
        .extra_headers = headers,
    });
    defer req.deinit();

    req.transfer_encoding = .{ .content_length = payload.len };
    var body = try req.sendBodyUnflushed(&.{});
    try body.writer.writeAll(payload);
    try body.end();
    try req.connection.?.flush();

    var response = try req.receiveHead(&.{});
    if (response.head.status.class() != .success) {
        var error_buffer: [4096]u8 = undefined;
        var transfer_buffer: [4096]u8 = undefined;
        const reader = response.reader(&transfer_buffer);
        const error_len = reader.readSliceShort(&error_buffer) catch 0;
        if (error_len > 0) {
            std.log.err("[zig] provider request failed ({d}): {s}", .{
                @intFromEnum(response.head.status),
                error_buffer[0..error_len],
            });
        }
        return error.ProviderRequestFailed;
    }

    var transfer_buffer: [4096]u8 = undefined;
    var decompress: std.http.Decompress = undefined;
    const decompress_buffer: []u8 = switch (response.head.content_encoding) {
        .identity => &.{},
        .zstd => try allocator.alloc(u8, std.compress.zstd.default_window_len),
        .deflate, .gzip => try allocator.alloc(u8, std.compress.flate.max_window_len),
        .compress => return error.UnsupportedCompressionMethod,
    };
    defer if (decompress_buffer.len > 0) allocator.free(decompress_buffer);

    const reader = response.readerDecompressing(&transfer_buffer, &decompress, decompress_buffer);

    var carry: std.ArrayList(u8) = .empty;
    defer carry.deinit(allocator);

    var read_buffer: [4096]u8 = undefined;
    while (true) {
        const n = reader.readSliceShort(&read_buffer) catch |err| switch (err) {
            error.ReadFailed => return response.bodyErr().?,
        };
        if (n == 0) break;
        try carry.appendSlice(allocator, read_buffer[0..n]);

        if (try processSseBuffer(allocator, &carry, ctx, emit, handleDataLine)) return;
    }

    _ = try processSseBuffer(allocator, &carry, ctx, emit, handleDataLine);
}

fn encodeChatPayload(
    allocator: std.mem.Allocator,
    model: []const u8,
    system: []const u8,
    messages: []const agui.ChatMessage,
    provider: []const u8,
) ![]const u8 {
    const OpenAIMessage = struct { role: []const u8, content: []const u8 };
    var openai_messages: std.ArrayList(OpenAIMessage) = .empty;
    defer openai_messages.deinit(allocator);

    if (system.len > 0) {
        try openai_messages.append(allocator, .{ .role = "system", .content = system });
    }
    for (messages) |message| {
        try openai_messages.append(allocator, .{
            .role = message.role,
            .content = message.content,
        });
    }

    if (std.mem.eql(u8, provider, "anthropic")) {
        const Payload = struct {
            model: []const u8,
            max_tokens: u16 = 4096,
            messages: []OpenAIMessage,
            stream: bool = true,
            system: ?[]const u8 = null,
        };
        return std.json.Stringify.valueAlloc(allocator, Payload{
            .model = model,
            .messages = openai_messages.items,
            .system = if (system.len > 0) system else null,
        }, .{});
    }

    const Payload = struct {
        model: []const u8,
        messages: []OpenAIMessage,
        stream: bool = true,
    };
    return std.json.Stringify.valueAlloc(allocator, Payload{
        .model = model,
        .messages = openai_messages.items,
    }, .{});
}

fn requireEnv(comptime name: [:0]const u8, missing: anyerror) ![:0]const u8 {
    const value = std.c.getenv(name) orelse return missing;
    return std.mem.span(value);
}

pub fn streamOpenAI(
    allocator: std.mem.Allocator,
    io: std.Io,
    model: []const u8,
    system: []const u8,
    messages: []const agui.ChatMessage,
    ctx: *anyopaque,
    emit: EmitFn,
) !void {
    const api_key = try requireEnv("OPENAI_API_KEY", error.MissingOpenAIKey);

    const payload = try encodeChatPayload(allocator, model, system, messages, "openai");
    defer allocator.free(payload);

    const auth_header = try std.fmt.allocPrint(allocator, "Bearer {s}", .{api_key});
    defer allocator.free(auth_header);

    const headers = [_]std.http.Header{
        .{ .name = "authorization", .value = auth_header },
        .{ .name = "content-type", .value = "application/json" },
    };

    try streamProviderSse(
        allocator,
        io,
        "https://api.openai.com/v1/chat/completions",
        &headers,
        payload,
        handleOpenAILine,
        ctx,
        emit,
    );
}

pub fn streamAnthropic(
    allocator: std.mem.Allocator,
    io: std.Io,
    model: []const u8,
    system: []const u8,
    messages: []const agui.ChatMessage,
    ctx: *anyopaque,
    emit: EmitFn,
) !void {
    const api_key = try requireEnv("ANTHROPIC_API_KEY", error.MissingAnthropicKey);

    const payload = try encodeChatPayload(allocator, model, system, messages, "anthropic");
    defer allocator.free(payload);

    const headers = [_]std.http.Header{
        .{ .name = "x-api-key", .value = api_key },
        .{ .name = "anthropic-version", .value = "2023-06-01" },
        .{ .name = "content-type", .value = "application/json" },
    };

    try streamProviderSse(
        allocator,
        io,
        "https://api.anthropic.com/v1/messages",
        &headers,
        payload,
        handleAnthropicLine,
        ctx,
        emit,
    );
}

pub fn streamCompletion(
    allocator: std.mem.Allocator,
    io: std.Io,
    config: agui.ProviderConfig,
    system: []const u8,
    messages: []const agui.ChatMessage,
    ctx: *anyopaque,
    emit: EmitFn,
) !void {
    if (std.mem.eql(u8, config.provider, "openai")) {
        return streamOpenAI(allocator, io, config.model, system, messages, ctx, emit);
    }
    if (std.mem.eql(u8, config.provider, "anthropic")) {
        return streamAnthropic(allocator, io, config.model, system, messages, ctx, emit);
    }
    return error.UnsupportedProvider;
}

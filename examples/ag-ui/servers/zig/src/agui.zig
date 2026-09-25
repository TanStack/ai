const std = @import("std");

pub const DEFAULT_OPENAI_MODEL = "gpt-4o";
pub const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-4-6";

pub const RunAgentInput = struct {
    threadId: []const u8,
    runId: []const u8,
    messages: []IncomingMessage,
    forwardedProps: std.json.Value = .null,
    data: std.json.Value = .null,
};

pub const IncomingMessage = struct {
    role: []const u8,
    content: ?std.json.Value = null,
    parts: ?[]MessagePart = null,
};

pub const MessagePart = struct {
    @"type": []const u8,
    content: ?[]const u8 = null,
};

pub const ChatMessage = struct {
    role: []const u8,
    content: []const u8,
};

pub const ProviderConfig = struct {
    provider: []const u8,
    model: []const u8,
};

pub fn providerFromInput(input: *const RunAgentInput, allocator: std.mem.Allocator) !ProviderConfig {
    const props = if (input.forwardedProps == .object) input.forwardedProps else input.data;

    var provider: []const u8 = "openai";
    var model: ?[]const u8 = null;

    if (props == .object) {
        if (props.object.get("provider")) |value| {
            if (value == .string and value.string.len > 0) {
                provider = value.string;
            }
        }
        if (props.object.get("model")) |value| {
            if (value == .string) {
                model = value.string;
            }
        }
    }

    if (std.mem.eql(u8, provider, "anthropic")) {
        return ProviderConfig{
            .provider = "anthropic",
            .model = if (model) |m| try allocator.dupe(u8, m) else try allocator.dupe(u8, DEFAULT_ANTHROPIC_MODEL),
        };
    }

    return ProviderConfig{
        .provider = "openai",
        .model = if (model) |m| try allocator.dupe(u8, m) else try allocator.dupe(u8, DEFAULT_OPENAI_MODEL),
    };
}

fn sseEvent(allocator: std.mem.Allocator, payload: anytype) ![]u8 {
    const json = try std.json.Stringify.valueAlloc(allocator, payload, .{});
    defer allocator.free(json);
    return std.fmt.allocPrint(allocator, "data: {s}\n\n", .{json});
}

pub fn sseDone(allocator: std.mem.Allocator) ![]u8 {
    return try allocator.dupe(u8, "data: [DONE]\n\n");
}

pub fn runStarted(allocator: std.mem.Allocator, thread_id: []const u8, run_id: []const u8) ![]u8 {
    return sseEvent(allocator, .{
        .type = "RUN_STARTED",
        .threadId = thread_id,
        .runId = run_id,
    });
}

pub fn textMessageStart(allocator: std.mem.Allocator, message_id: []const u8) ![]u8 {
    return sseEvent(allocator, .{
        .type = "TEXT_MESSAGE_START",
        .messageId = message_id,
        .role = "assistant",
    });
}

pub fn textMessageContent(allocator: std.mem.Allocator, message_id: []const u8, delta: []const u8) ![]u8 {
    return sseEvent(allocator, .{
        .type = "TEXT_MESSAGE_CONTENT",
        .messageId = message_id,
        .delta = delta,
    });
}

pub fn textMessageEnd(allocator: std.mem.Allocator, message_id: []const u8) ![]u8 {
    return sseEvent(allocator, .{
        .type = "TEXT_MESSAGE_END",
        .messageId = message_id,
    });
}

pub fn runFinished(allocator: std.mem.Allocator, thread_id: []const u8, run_id: []const u8) ![]u8 {
    return sseEvent(allocator, .{
        .type = "RUN_FINISHED",
        .threadId = thread_id,
        .runId = run_id,
        .finishReason = "stop",
    });
}

pub fn runError(allocator: std.mem.Allocator, thread_id: []const u8, run_id: []const u8, message: []const u8) ![]u8 {
    const RunErrorPayload = struct {
        type: []const u8,
        threadId: []const u8,
        runId: []const u8,
        err: struct { message: []const u8 },

        pub fn jsonStringify(self: @This(), jw: anytype) !void {
            try jw.beginObject();
            try jw.objectField("type");
            try jw.write(self.type);
            try jw.objectField("threadId");
            try jw.write(self.threadId);
            try jw.objectField("runId");
            try jw.write(self.runId);
            try jw.objectField("error");
            try jw.beginObject();
            try jw.objectField("message");
            try jw.write(self.err.message);
            try jw.endObject();
            try jw.endObject();
        }
    };

    return sseEvent(allocator, RunErrorPayload{
        .type = "RUN_ERROR",
        .threadId = thread_id,
        .runId = run_id,
        .err = .{ .message = message },
    });
}

pub fn writeSse(response: *std.http.BodyWriter, frame: []const u8) !void {
    try response.writer.writeAll(frame);
    try response.flush();
}

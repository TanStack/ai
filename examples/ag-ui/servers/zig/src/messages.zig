const std = @import("std");
const agui = @import("agui.zig");

pub fn textFromMessageAlloc(allocator: std.mem.Allocator, message: *const agui.IncomingMessage) ![]const u8 {
    if (message.parts) |parts| {
        var out: std.ArrayList(u8) = .empty;
        errdefer out.deinit(allocator);
        for (parts) |part| {
            if (std.mem.eql(u8, part.@"type", "text")) {
                if (part.content) |content| {
                    if (content.len > 0) {
                        try out.appendSlice(allocator, content);
                    }
                }
            }
        }
        if (out.items.len > 0) {
            return out.toOwnedSlice(allocator);
        }
    }

    if (message.content) |content| {
        switch (content) {
            .string => |text| return try allocator.dupe(u8, text),
            .array => |items| {
                var out: std.ArrayList(u8) = .empty;
                errdefer out.deinit(allocator);
                for (items.items) |item| {
                    if (item != .object) continue;
                    if (item.object.get("type")) |type_value| {
                        if (type_value != .string or !std.mem.eql(u8, type_value.string, "text")) continue;
                    } else continue;
                    if (item.object.get("text")) |text_value| {
                        if (text_value == .string) {
                            try out.appendSlice(allocator, text_value.string);
                        }
                    }
                }
                if (out.items.len > 0) {
                    return out.toOwnedSlice(allocator);
                }
            },
            else => {},
        }
    }

    return try allocator.dupe(u8, "");
}

pub fn toChatMessages(
    allocator: std.mem.Allocator,
    messages: []const agui.IncomingMessage,
) !struct { system: []const u8, chat: []agui.ChatMessage } {
    var system_parts: std.ArrayList([]const u8) = .empty;
    defer {
        for (system_parts.items) |part| allocator.free(part);
        system_parts.deinit(allocator);
    }

    var chat: std.ArrayList(agui.ChatMessage) = .empty;
    errdefer chat.deinit(allocator);

    for (messages) |message| {
        var role = message.role;
        if (std.mem.eql(u8, role, "developer")) {
            role = "system";
        } else if (std.mem.eql(u8, role, "tool") or std.mem.eql(u8, role, "reasoning")) {
            continue;
        }

        const text = try textFromMessageAlloc(allocator, &message);
        defer allocator.free(text);
        if (text.len == 0) continue;

        if (std.mem.eql(u8, role, "system")) {
            try system_parts.append(allocator, try allocator.dupe(u8, text));
        } else if (std.mem.eql(u8, role, "user") or std.mem.eql(u8, role, "assistant")) {
            try chat.append(allocator, .{
                .role = try allocator.dupe(u8, role),
                .content = try allocator.dupe(u8, text),
            });
        }
    }

    var system: std.ArrayList(u8) = .empty;
    errdefer system.deinit(allocator);
    for (system_parts.items, 0..) |part, index| {
        if (index > 0) try system.appendSlice(allocator, "\n\n");
        try system.appendSlice(allocator, part);
    }

    return .{
        .system = try system.toOwnedSlice(allocator),
        .chat = try chat.toOwnedSlice(allocator),
    };
}

pub fn freeChatMessages(allocator: std.mem.Allocator, system: []const u8, chat: []agui.ChatMessage) void {
    allocator.free(system);
    for (chat) |message| {
        allocator.free(message.role);
        allocator.free(message.content);
    }
    allocator.free(chat);
}

const std = @import("std");

pub fn build(b: *std.Build) void {
    const target = b.standardTargetOptions(.{});
    const optimize = b.standardOptimizeOption(.{});

    const root_module = b.createModule(.{
        .root_source_file = b.path("src/main.zig"),
        .target = target,
        .optimize = optimize,
    });

    const exe = b.addExecutable(.{
        .name = "ag-ui-zig",
        .root_module = root_module,
    });

    b.installArtifact(exe);

    const run_step = b.addRunArtifact(exe);
    const run_cmd = b.step("run", "Run the AG-UI Zig server");
    run_cmd.dependOn(&run_step.step);
}

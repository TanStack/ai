# tanstack-ai release process

This document describes how to publish the Rust crate to crates.io.

## Prerequisites

- crates.io owner access for `tanstack-ai`
- `cargo` authenticated (`cargo login <TOKEN>`), or `CARGO_REGISTRY_TOKEN` set
- all intended changes merged to `main`

## 1) Bump version

Update `version` in `crates/tanstack-ai/Cargo.toml`.

## 2) Validate locally

From repo root:

```bash
cargo test --manifest-path crates/tanstack-ai/Cargo.toml
cargo package --manifest-path crates/tanstack-ai/Cargo.toml
```

`cargo package` verifies the crate can be built from the published archive.

## 3) Publish

From repo root:

```bash
cargo publish --manifest-path crates/tanstack-ai/Cargo.toml
```

If needed, publish with an explicit token:

```bash
CARGO_REGISTRY_TOKEN=<token> cargo publish --manifest-path crates/tanstack-ai/Cargo.toml
```

## 4) Tag and notes

Create a git tag after publish, for example:

```bash
git tag rust/tanstack-ai-v0.1.0
git push origin rust/tanstack-ai-v0.1.0
```

Then document highlights in the GitHub release notes.

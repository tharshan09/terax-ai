# Rust-Prüfumgebung für Terax auf der Werkbank (Linux). Pakete wie in .github/workflows/ci.yml.
FROM rust:1-bookworm
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      libwebkit2gtk-4.1-dev libgtk-3-dev librsvg2-dev libssl-dev pkg-config fish \
 && rm -rf /var/lib/apt/lists/*
RUN rustup component add clippy
ENV CARGO_HOME=/cargo CARGO_TARGET_DIR=/target

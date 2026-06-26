# syntax=docker/dockerfile:1
# Builds SketchForge 3D as a self-contained .flatpak bundle — no system libs needed on the host.
#
# Build:   docker build --output dist/ --target artifact -f deploy/flatpak/Dockerfile .
# Install: flatpak install --user dist/SketchForge3D.flatpak

# ── Stage 1: Next.js static export ───────────────────────────────────────────
FROM node:22-slim AS frontend
WORKDIR /build

COPY package*.json ./
RUN npm ci

COPY . .

RUN --mount=type=cache,target=/build/apps/web/.next/cache \
    npm run desktop:export

# ── Stage 2: Tauri / Rust binary ─────────────────────────────────────────────
FROM ubuntu:24.04 AS rust-builder
ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates \
        curl \
        build-essential \
        pkg-config \
        libwebkit2gtk-4.1-dev \
        libgtk-3-dev \
        libayatana-appindicator3-dev \
        librsvg2-dev \
    && rm -rf /var/lib/apt/lists/*

RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \
    | sh -s -- -y --default-toolchain stable --no-modify-path
ENV PATH="/root/.cargo/bin:${PATH}"

WORKDIR /build
COPY src-tauri/ src-tauri/
COPY --from=frontend /build/apps/web/out apps/web/out

# Cache the Cargo registry and git index between builds;
# copy the binary out before the cache mount disappears.
RUN --mount=type=cache,target=/root/.cargo/registry \
    --mount=type=cache,target=/root/.cargo/git \
    --mount=type=cache,target=/build/src-tauri/target,sharing=locked \
    cargo build --release --manifest-path src-tauri/Cargo.toml \
    && cp src-tauri/target/release/sketchforge /sketchforge

# ── Stage 3: Flatpak bundle ───────────────────────────────────────────────────
# flatpak build-init / build-finish / build-export / build-bundle need no
# user namespaces or FUSE — they only manipulate files and an OSTree repo.
FROM ubuntu:24.04 AS flatpak-bundler
ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends flatpak \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /pkg
COPY --from=rust-builder /sketchforge                   ./sketchforge
COPY src-tauri/icons/                                   ./icons/
COPY flatpak/info.friedjof.SketchForge3D.desktop        ./app.desktop

RUN flatpak build-init builddir info.friedjof.SketchForge3D \
        org.gnome.Sdk org.gnome.Platform 47 \
    && install -Dm755 sketchforge \
        builddir/files/bin/sketchforge \
    && install -Dm644 app.desktop \
        builddir/files/share/applications/info.friedjof.SketchForge3D.desktop \
    && install -Dm644 icons/128x128.png \
        builddir/files/share/icons/hicolor/128x128/apps/info.friedjof.SketchForge3D.png \
    && install -Dm644 icons/32x32.png \
        builddir/files/share/icons/hicolor/32x32/apps/info.friedjof.SketchForge3D.png \
    && flatpak build-finish builddir \
        --command=sketchforge \
        --share=ipc \
        --socket=fallback-x11 \
        --socket=wayland \
        --device=dri \
        --filesystem=home \
        --env=WEBKIT_DISABLE_COMPOSITING_MODE=1 \
    && flatpak build-export repo builddir \
    && flatpak build-bundle repo /out/SketchForge3D.flatpak info.friedjof.SketchForge3D

# ── Artifact export ───────────────────────────────────────────────────────────
# docker build --output dist/ --target artifact ... writes only the .flatpak file.
FROM scratch AS artifact
COPY --from=flatpak-bundler /out/SketchForge3D.flatpak .

# Casys MCP gateway Playground - Deno Development Environment
# For GitHub Codespaces with Jupyter notebook support

FROM denoland/deno:debian-2.1.4

# Install system dependencies
RUN apt-get update && apt-get install -y \
    git \
    curl \
    python3 \
    python3-pip \
    && rm -rf /var/lib/apt/lists/*

# Install Jupyter for Deno notebooks
RUN pip3 install --break-system-packages jupyterlab notebook

# Install Deno Jupyter kernel
RUN deno jupyter --install

# Set working directory
WORKDIR /workspaces/CasysMCPGateway

# Cache Deno dependencies (will be overwritten by mount)
COPY deno.json deno.lock* ./
RUN deno cache --reload mod.ts || true

# Default command
CMD ["bash"]

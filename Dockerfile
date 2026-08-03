# Use official Python runtime as a parent image
FROM python:3.11-slim

# Set up a non-root user (required for Hugging Face Spaces)
RUN useradd -m -u 1000 user
USER user
ENV HOME=/home/user \
    PATH=/home/user/.local/bin:$PATH

WORKDIR $HOME/app

# Switch back to root briefly to install system dependencies
USER root
RUN apt-get update && apt-get install -y \
    build-essential \
    git \
    && rm -rf /var/lib/apt/lists/*
USER user

# Copy requirements and install
COPY --chown=user:user requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the application code
COPY --chown=user:user . .

# Create the vector database directory and bake the sandbox code into the image
RUN python ingest.py --path sandbox

# Expose ports for both Hugging Face Spaces (7860) and standard container runtimes (8000)
EXPOSE 7860 8000

# Command to run the application using dynamic port detection
CMD ["python", "server.py"]

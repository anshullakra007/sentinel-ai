import argparse
import os
import shutil
import tempfile
from pathlib import Path

import chromadb
from git import Repo
from langchain_text_splitters import Language, RecursiveCharacterTextSplitter

def clone_repo(repo_url: str, dest_dir: str):
    print(f"Cloning {repo_url} into {dest_dir}...")
    Repo.clone_from(repo_url, dest_dir)
    print("Clone complete.")

def get_python_files(directory: str) -> list[Path]:
    path = Path(directory)
    # Ignore hidden directories like .git
    return [p for p in path.rglob("*.py") if not any(part.startswith('.') for part in p.parts)]

def ingest_codebase(target_dir: str):
    # Initialize splitter
    python_splitter = RecursiveCharacterTextSplitter.from_language(
        language=Language.PYTHON, chunk_size=1000, chunk_overlap=200
    )
    
    # Initialize ChromaDB
    chroma_path = os.path.join(os.getcwd(), ".chroma_db")
    print(f"Initializing ChromaDB at {chroma_path}")
    client = chromadb.PersistentClient(path=chroma_path)
    
    # We use a default collection. Chroma will use the default SentenceTransformers embedding function
    collection = client.get_or_create_collection(name="codebase_collection")
    
    python_files = get_python_files(target_dir)
    print(f"Found {len(python_files)} Python files to ingest.")
    
    documents = []
    metadatas = []
    ids = []
    
    for file_path in python_files:
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                content = f.read()
        except Exception as e:
            print(f"Failed to read {file_path}: {e}")
            continue
        
        chunks = python_splitter.split_text(content)
        
        for i, chunk in enumerate(chunks):
            documents.append(chunk)
            rel_path = str(file_path.relative_to(target_dir))
            metadatas.append({
                "source": rel_path,
                "language": "python",
                "chunk_index": i
            })
            ids.append(f"{rel_path}_{i}")
            
    if not documents:
        print("No documents to insert.")
        return
        
    print(f"Inserting {len(documents)} chunks into ChromaDB...")
    
    # Batch add to ChromaDB
    batch_size = 5000
    for i in range(0, len(documents), batch_size):
        collection.add(
            documents=documents[i:i+batch_size],
            metadatas=metadatas[i:i+batch_size],
            ids=ids[i:i+batch_size]
        )
        
    print("Ingestion complete. ChromaDB updated.")

def main():
    parser = argparse.ArgumentParser(description="Ingest codebase into Vector DB")
    parser.add_argument("--path", type=str, help="Local directory path to ingest")
    parser.add_argument("--repo-url", type=str, help="GitHub repository URL to clone and ingest")
    
    args = parser.parse_args()
    
    if not args.path and not args.repo_url:
        print("Error: Must provide either --path or --repo-url")
        parser.print_help()
        return
        
    target_dir = args.path
    temp_dir = None
    
    if args.repo_url:
        temp_dir = tempfile.mkdtemp()
        try:
            clone_repo(args.repo_url, temp_dir)
            target_dir = temp_dir
        except Exception as e:
            print(f"Error cloning repository: {e}")
            shutil.rmtree(temp_dir)
            return

    try:
        if target_dir:
            # Get absolute path for target_dir
            target_dir = os.path.abspath(target_dir)
            ingest_codebase(target_dir)
    finally:
        if temp_dir and os.path.exists(temp_dir):
            shutil.rmtree(temp_dir)
            print(f"Cleaned up temporary directory {temp_dir}")

if __name__ == "__main__":
    main()

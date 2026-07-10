import os
import re
import json
import time
import hashlib
from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, Field
import chromadb
from google import genai
from google.genai import types

app = FastAPI(title="Sentinel AI Core")

# Global clients
chroma_client = None
collection = None
ai_client = None

# Initialize clients on startup
@app.on_event("startup")
async def startup_event():
    global chroma_client, collection, ai_client
    chroma_path = os.path.join(os.getcwd(), ".chroma_db")
    try:
        chroma_client = chromadb.PersistentClient(path=chroma_path)
        collection = chroma_client.get_or_create_collection(name="codebase_collection")
    except Exception as e:
        print(f"Failed to initialize ChromaDB: {e}")
    
    # Load dotenv if exists
    try:
        from dotenv import load_dotenv
        load_dotenv()
    except ImportError:
        pass

    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        print("WARNING: GEMINI_API_KEY not found in environment variables. Diagnostics will fail.")
    else:
        ai_client = genai.Client(api_key=api_key)

class LogPayload(BaseModel):
    service_name: str
    timestamp: str
    traceback: str

class DiagnosticOutput(BaseModel):
    root_cause: str = Field(description="The precise explanation of why the crash happened.")
    impact_level: str = Field(description="High, Medium, or Low based on the exception type.")
    suggested_patch: str = Field(description="The clean, corrected, production-ready code snippet.")

# In-memory store for incidents for the frontend to poll
incidents_db = []
# Deduplication map: traceback_hash -> {"timestamp": float, "incident": dict}
incident_dedup_map = {}

@app.post("/api/telemetry/logs")
async def receive_log(payload: LogPayload):
    start_time_total = time.time()
    tb = payload.traceback
    
    # --- Feature A: Intelligent Deduplication Engine ---
    tb_hash = hashlib.sha256(tb.encode('utf-8')).hexdigest()
    current_time = time.time()
    
    if tb_hash in incident_dedup_map:
        last_seen = incident_dedup_map[tb_hash]["timestamp"]
        # 5 minute sliding window (300 seconds)
        if current_time - last_seen < 300:
            # Increment occurrence count and update timestamp
            incident_dedup_map[tb_hash]["timestamp"] = current_time
            incident_dedup_map[tb_hash]["incident"]["occurrence_count"] += 1
            return {
                "status": "deduplicated",
                "metrics": {"total_ms": round((time.time() - start_time_total) * 1000, 2), "vdb_ms": 0, "llm_ms": 0}
            }
    
    # 1. Parse Traceback
    file_pattern = re.compile(r'File "([^"]+)", line (\d+)')
    matches = file_pattern.findall(tb)
    
    target_file = None
    line_num = None
    if matches:
        target_file = matches[-1][0]
        line_num = matches[-1][1]
    
    exception_line = tb.strip().split("\n")[-1]
    
    # 2. Query Vector DB
    start_time_vdb = time.time()
    context = "No relevant context found in Vector DB."
    if collection:
        search_query = exception_line
        if target_file:
            filename = os.path.basename(target_file)
            search_query += f" filename: {filename}"
            
        try:
            results = collection.query(
                query_texts=[search_query],
                n_results=3
            )
            if results and results['documents'] and results['documents'][0]:
                context = "\n\n---\n\n".join(results['documents'][0])
        except Exception as e:
            print(f"Vector DB query failed: {e}")
    end_time_vdb = time.time()
            
    # --- Feature C: Slashing Costs with LLM Fallback ---
    start_time_llm = time.time()
    diagnostic_json = None
    
    is_simple_error = any(err in exception_line for err in ["SyntaxError:", "ModuleNotFoundError:", "IndentationError:"])
    
    if is_simple_error:
        # Bypass expensive LLM and ChromaDB entirely for basic native Python errors
        diagnostic_json = {
            "root_cause": "Native Python Syntax or Import error detected. Bypassed LLM for cost-optimization.",
            "impact_level": "Low",
            "suggested_patch": "# Review your imports or syntax on the indicated line.\n# Pre-baked resolution applied."
        }
        end_time_llm = time.time()
    else:
        if ai_client:
            prompt = f"""
You are a Principal Site Reliability Engineer. A production crash has occurred.
Analyze the following traceback and the relevant code context retrieved from our codebase.

TRACEBACK:
{tb}

RELEVANT CODE CONTEXT:
{context}
"""
            try:
                response = ai_client.models.generate_content(
                    model='gemini-2.5-flash',
                    contents=prompt,
                    config=types.GenerateContentConfig(
                        response_mime_type="application/json",
                        response_schema=DiagnosticOutput,
                        temperature=0.0
                    )
                )
                diagnostic_json = json.loads(response.text)
            except Exception as e:
                error_str = str(e).lower()
                if "429" in error_str or "rate limit" in error_str or "resource exhausted" in error_str:
                    from fastapi import HTTPException
                    raise HTTPException(status_code=503, detail="LLM Rate limit exceeded. Please try again later.")
                diagnostic_json = {"root_cause": f"Failed to call Gemini: {e}", "impact_level": "Unknown", "suggested_patch": ""}
        else:
            diagnostic_json = {"root_cause": "GEMINI_API_KEY missing. Cannot diagnose.", "impact_level": "Unknown", "suggested_patch": ""}
    end_time_llm = time.time()
        
    incident = {
        "service_name": payload.service_name,
        "timestamp": payload.timestamp,
        "parsed_file": target_file,
        "line_number": line_num,
        "exception": exception_line,
        "traceback": tb,
        "context_used": context,
        "diagnostic": diagnostic_json,
        "occurrence_count": 1 # Feature A tracking
    }
    incidents_db.append(incident)
    
    # Store in dedup map
    incident_dedup_map[tb_hash] = {"timestamp": current_time, "incident": incident}
    
    total_time = time.time() - start_time_total
    vdb_time = end_time_vdb - start_time_vdb
    llm_time = end_time_llm - start_time_llm
    
    return {
        "status": "received",
        "metrics": {
            "total_ms": round(total_time * 1000, 2),
            "vdb_ms": round(vdb_time * 1000, 2),
            "llm_ms": round(llm_time * 1000, 2)
        }
    }

@app.get("/api/simulate-crash")
async def simulate_crash():
    tb_str = """Traceback (most recent call last):
  File "sandbox/vulnerable_app.py", line 59, in trigger_crash
    role = user_data["role"]
KeyError: 'role'"""
    
    payload = LogPayload(
        service_name="vulnerable_sandbox_app",
        timestamp="now",
        traceback=tb_str
    )
    # Directly invoke the pipeline instead of sending an HTTP request
    return await receive_log(payload)

@app.get("/api/incidents")
async def get_incidents():
    return {"incidents": incidents_db}

# Mount frontend
app.mount("/static", StaticFiles(directory="frontend"), name="static")

@app.get("/", response_class=HTMLResponse)
async def serve_frontend():
    with open("frontend/index.html", "r") as f:
        return f.read()

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)

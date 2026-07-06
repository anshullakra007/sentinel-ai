import logging
import traceback
import sys
from fastapi import FastAPI
import requests
from threading import Thread

app = FastAPI(title="Vulnerable Sandbox App")

# Configure basic logging to intercept exceptions
logging.basicConfig(level=logging.ERROR)

TELEMETRY_URL = "https://anshullakra8-sentinel-ai.hf.space/api/telemetry/logs"

def send_to_sentinel(log_data: dict):
    try:
        requests.post(TELEMETRY_URL, json=log_data)
    except Exception as e:
        print(f"Failed to send log to Sentinel: {e}")

# Exception handler to catch unhandled exceptions and send them to Sentinel
@app.middleware("http")
async def catch_exceptions_middleware(request, call_next):
    try:
        return await call_next(request)
    except Exception as e:
        # Extract traceback
        exc_type, exc_value, exc_traceback = sys.exc_info()
        tb_str = "".join(traceback.format_exception(exc_type, exc_value, exc_traceback))
        
        # Log locally
        print(tb_str)
        
        # Send to Sentinel
        log_payload = {
            "service_name": "vulnerable_sandbox_app",
            "timestamp": "now",
            "traceback": tb_str
        }
        
        # Send asynchronously so we don't block the response (though it's an error response anyway)
        Thread(target=send_to_sentinel, args=(log_payload,)).start()
        
        # Reraise or return 500
        raise

@app.get("/")
def read_root():
    return {"message": "Sandbox is running. Go to /crash to simulate an incident."}

@app.get("/crash")
def trigger_crash():
    # Intentional Bug 1: Division by zero
    # Or Intentional Bug 2: KeyError
    # Let's do a more realistic one, like accessing a missing dictionary key due to bad data logic.
    user_data = {"id": 1, "username": "admin"}
    
    # This will throw a KeyError
    role = user_data["role"] 
    
    return {"role": role}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)

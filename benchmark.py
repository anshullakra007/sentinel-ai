import asyncio
import aiohttp
import time
import statistics

API_URL = "http://localhost:8000/api/telemetry/logs"
NUM_REQUESTS = 25

def generate_payload(i):
    return {
        "service_name": "benchmark_service",
        "timestamp": "now",
        "traceback": f"""Traceback (most recent call last):
  File "sandbox/vulnerable_app.py", line {40 + i}, in trigger_crash
    role = user_data["role"]
KeyError: 'role'"""
    }

async def send_request(session, i):
    payload = generate_payload(i)
    try:
        async with session.post(API_URL, json=payload, timeout=30) as response:
            status = response.status
            if status == 200:
                data = await response.json()
                return {"status": status, "data": data}
            else:
                return {"status": status, "data": None}
    except Exception as e:
        return {"status": 500, "error": str(e)}

async def run_benchmark():
    print(f"Starting aggressive benchmark with {NUM_REQUESTS} concurrent requests...")
    
    start_time = time.time()
    
    async with aiohttp.ClientSession() as session:
        tasks = [send_request(session, i) for i in range(NUM_REQUESTS)]
        results = await asyncio.gather(*tasks)
        
    total_time = time.time() - start_time
    
    total_latencies = []
    vdb_latencies = []
    llm_latencies = []
    successes = 0
    rate_limits = 0
    
    for i, res in enumerate(results):
        if res.get("status") == 200:
            data = res.get("data")
            if data and "metrics" in data:
                total_latencies.append(data["metrics"]["total_ms"])
                vdb_latencies.append(data["metrics"]["vdb_ms"])
                llm_latencies.append(data["metrics"]["llm_ms"])
            successes += 1
        elif res.get("status") == 503:
            rate_limits += 1
            print(f"Request {i+1} failed: 503 Service Unavailable (Rate Limited)")
        else:
            print(f"Request {i+1} failed with status {res.get('status')}: {res.get('error', '')}")
            
    print("\n--- Benchmark Complete ---")
    print(f"Completed {NUM_REQUESTS} requests in {total_time:.2f} seconds.")
    
    if len(total_latencies) == 0:
        print("No successful requests to calculate metrics.")
        return
        
    avg_total = statistics.mean(total_latencies)
    avg_vdb = statistics.mean(vdb_latencies)
    avg_llm = statistics.mean(llm_latencies)
    
    p90_total = statistics.quantiles(total_latencies, n=10)[8] if len(total_latencies) > 1 else total_latencies[0]
    
    print(f"Success Rate: {successes}/{NUM_REQUESTS} ({(successes/NUM_REQUESTS)*100}%)")
    print(f"Rate Limits Hit: {rate_limits}")
    print(f"Average Total Latency: {avg_total:.2f} ms")
    print(f"Average Vector DB Latency: {avg_vdb:.2f} ms")
    print(f"Average LLM Latency: {avg_llm:.2f} ms")
    print(f"P90 Total Latency: {p90_total:.2f} ms")

if __name__ == "__main__":
    asyncio.run(run_benchmark())

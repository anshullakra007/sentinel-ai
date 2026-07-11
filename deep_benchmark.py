import asyncio
import aiohttp
import time
import statistics
import json

API_URL = "http://localhost:8000/api/telemetry/logs"

def generate_complex_payload(i):
    return {
        "service_name": "benchmark_service",
        "timestamp": "now",
        "traceback": f"""Traceback (most recent call last):
  File "sandbox/vulnerable_app.py", line {40 + i}, in trigger_crash
    role = user_data["role"]
KeyError: 'role'"""
    }

def generate_dedup_payload():
    return {
        "service_name": "benchmark_service",
        "timestamp": "now",
        "traceback": """Traceback (most recent call last):
  File "sandbox/vulnerable_app.py", line 42, in trigger_crash
    role = user_data["role"]
KeyError: 'role'"""
    }

def generate_simple_payload(i):
    return {
        "service_name": "benchmark_service",
        "timestamp": "now",
        "traceback": f"""Traceback (most recent call last):
  File "sandbox/syntax_error.py", line {10 + i}, in bad_code
    def missing_colon()
SyntaxError: invalid syntax"""
    }

async def send_request(session, payload):
    try:
        start_req = time.time()
        async with session.post(API_URL, json=payload, timeout=60) as response:
            status = response.status
            data = await response.json()
            latency = time.time() - start_req
            return {"status": status, "data": data, "latency_s": latency}
    except Exception as e:
        return {"status": 500, "error": str(e), "latency_s": 0}

async def run_scenario(name, payloads, concurrency):
    print(f"\n--- Running Scenario: {name} (Concurrency: {concurrency}) ---")
    start_time = time.time()
    
    async with aiohttp.ClientSession() as session:
        tasks = [send_request(session, p) for p in payloads]
        results = await asyncio.gather(*tasks)
        
    total_time = time.time() - start_time
    
    latencies = [res["latency_s"] * 1000 for res in results if res.get("status") == 200]
    successes = len(latencies)
    rate_limits = len([res for res in results if res.get("status") == 503])
    failures = len(results) - successes - rate_limits
    
    server_total_ms = []
    server_vdb_ms = []
    server_llm_ms = []
    dedup_count = 0
    
    for res in results:
        if res.get("status") == 200:
            data = res.get("data", {})
            if data.get("status") == "deduplicated":
                dedup_count += 1
            metrics = data.get("metrics", {})
            if "total_ms" in metrics:
                server_total_ms.append(metrics["total_ms"])
            if "vdb_ms" in metrics:
                server_vdb_ms.append(metrics["vdb_ms"])
            if "llm_ms" in metrics:
                server_llm_ms.append(metrics["llm_ms"])
                
    print(f"Completed in {total_time:.2f}s")
    print(f"Successes: {successes} | Deduplicated: {dedup_count} | Rate Limits (503): {rate_limits} | Failures: {failures}")
    
    if latencies:
        print(f"Client Latency (ms): Avg {statistics.mean(latencies):.2f} | P90 {statistics.quantiles(latencies, n=10)[8] if len(latencies)>1 else latencies[0]:.2f}")
    if server_total_ms:
        print(f"Server Processing (ms): Avg {statistics.mean(server_total_ms):.2f}")
    if server_vdb_ms:
        print(f"Server VDB (ms): Avg {statistics.mean(server_vdb_ms):.2f}")
    if server_llm_ms:
        print(f"Server LLM (ms): Avg {statistics.mean(server_llm_ms):.2f}")

    return {
        "scenario": name,
        "concurrency": concurrency,
        "total_requests": len(payloads),
        "success_rate": successes / len(payloads),
        "rate_limit_rate": rate_limits / len(payloads),
        "avg_latency_ms": statistics.mean(latencies) if latencies else 0,
        "p90_latency_ms": statistics.quantiles(latencies, n=10)[8] if len(latencies)>1 else (latencies[0] if latencies else 0),
        "avg_server_ms": statistics.mean(server_total_ms) if server_total_ms else 0,
        "avg_vdb_ms": statistics.mean(server_vdb_ms) if server_vdb_ms else 0,
        "avg_llm_ms": statistics.mean(server_llm_ms) if server_llm_ms else 0,
    }

async def main():
    print("Starting Deep Exhaustive Benchmark...")
    results = []
    
    # 1. Complex Errors (LLM Required) - Low Concurrency
    payloads = [generate_complex_payload(i) for i in range(10)]
    res = await run_scenario("Complex Errors (LLM Required) - Low Load", payloads, 10)
    results.append(res)
    
    # Let server cool down slightly to avoid rate limits
    await asyncio.sleep(2)
    
    # 2. Complex Errors (LLM Required) - Med Concurrency
    payloads = [generate_complex_payload(i+10) for i in range(25)]
    res = await run_scenario("Complex Errors (LLM Required) - Med Load", payloads, 25)
    results.append(res)
    
    await asyncio.sleep(2)
    
    # 3. Deduplication Engine Test - High Concurrency
    payloads = [generate_dedup_payload() for _ in range(100)]
    res = await run_scenario("Deduplication Engine - High Load", payloads, 100)
    results.append(res)
    
    await asyncio.sleep(2)
    
    # 4. LLM Bypass (Syntax Errors) - High Concurrency
    payloads = [generate_simple_payload(i) for i in range(100)]
    res = await run_scenario("LLM Bypass (Syntax Errors) - High Load", payloads, 100)
    results.append(res)
    
    # Save results to JSON
    with open("benchmark_results.json", "w") as f:
        json.dump(results, f, indent=4)
        
    print("\nBenchmarking complete. Results saved to benchmark_results.json")

if __name__ == "__main__":
    asyncio.run(main())

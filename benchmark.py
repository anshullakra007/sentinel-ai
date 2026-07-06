import requests
import time
import json
import statistics

API_URL = "http://localhost:8000/api/telemetry/logs"
NUM_REQUESTS = 10

def generate_payload(i):
    return {
        "service_name": "benchmark_service",
        "timestamp": "now",
        "traceback": f"""Traceback (most recent call last):
  File "sandbox/vulnerable_app.py", line {40 + i}, in trigger_crash
    role = user_data["role"]
KeyError: 'role'"""
    }

def run_benchmark():
    print(f"Starting benchmark with {NUM_REQUESTS} requests...")
    
    total_latencies = []
    vdb_latencies = []
    llm_latencies = []
    successes = 0
    
    for i in range(NUM_REQUESTS):
        payload = generate_payload(i)
        
        start_req = time.time()
        try:
            response = requests.post(API_URL, json=payload, timeout=30)
            if response.status_code == 200:
                data = response.json()
                if "metrics" in data:
                    total_latencies.append(data["metrics"]["total_ms"])
                    vdb_latencies.append(data["metrics"]["vdb_ms"])
                    llm_latencies.append(data["metrics"]["llm_ms"])
                successes += 1
            else:
                print(f"Request {i+1} failed with status {response.status_code}")
        except Exception as e:
            print(f"Request {i+1} failed: {e}")
            
    print("\n--- Benchmark Complete ---")
    
    if len(total_latencies) == 0:
        print("No successful requests to calculate metrics.")
        return
        
    avg_total = statistics.mean(total_latencies)
    avg_vdb = statistics.mean(vdb_latencies)
    avg_llm = statistics.mean(llm_latencies)
    
    p90_total = statistics.quantiles(total_latencies, n=10)[8] if len(total_latencies) > 1 else total_latencies[0]
    
    print(f"Success Rate: {successes}/{NUM_REQUESTS} ({(successes/NUM_REQUESTS)*100}%)")
    print(f"Average Total Latency: {avg_total:.2f} ms")
    print(f"Average Vector DB Latency: {avg_vdb:.2f} ms")
    print(f"Average LLM Latency: {avg_llm:.2f} ms")
    print(f"P90 Total Latency: {p90_total:.2f} ms")
    
    # Write to Markdown
    with open("BENCHMARKS.md", "w") as f:
        f.write("# Sentinel AI Performance Benchmarks\n\n")
        f.write("These benchmarks measure the end-to-end latency of the Sentinel AI telemetry pipeline.\n\n")
        f.write("## Latency Metrics\n\n")
        f.write("| Metric | Value (ms) |\n")
        f.write("|--------|------------|\n")
        f.write(f"| Success Rate | {(successes/NUM_REQUESTS)*100}% |\n")
        f.write(f"| Average Total Latency | {avg_total:.2f} |\n")
        f.write(f"| Average VectorDB Query | {avg_vdb:.2f} |\n")
        f.write(f"| Average LLM Inference | {avg_llm:.2f} |\n")
        f.write(f"| P90 Total Latency | {p90_total:.2f} |\n")

if __name__ == "__main__":
    # Ensure server is reachable before starting
    try:
        requests.get("http://localhost:8000/", timeout=2)
        run_benchmark()
    except:
        print("Error: Sentinel Server is not running on localhost:8000. Start it first.")

"""
Starlight CLI - Triage Command
Opens the time-travel debugging UI for mission analysis.
"""

import os
import webbrowser
import json


def execute():
    """Open the triage interface for mission debugging."""
    cwd = os.getcwd()
    
    # Check for mission_trace.json
    trace_file = os.path.join(cwd, "mission_trace.json")
    triage_file = os.path.join(cwd, "triage.html")
    report_file = os.path.join(cwd, "report.html")
    
    if not os.path.exists(trace_file):
        print("[Starlight] No mission_trace.json found. Run a mission first.")
        
        # Fallback: try to open report.html
        if os.path.exists(report_file):
            print(f"[Starlight] Opening report.html instead...")
            webbrowser.open(f"file://{os.path.abspath(report_file)}")
            return True
        return False
    
    # Load and display trace summary
    try:
        with open(trace_file, 'r', encoding='utf-8') as f:
            trace = json.load(f)
        
        if isinstance(trace, list) and len(trace) > 0:
            print(f"[Starlight] Mission Trace Summary:")
            print(f"  Events: {len(trace)}")
            
            # Find first and last timestamps
            first = trace[0].get('humanTime', 'Unknown')
            last = trace[-1].get('humanTime', 'Unknown')
            print(f"  Time Range: {first} - {last}")
            
            # Count event types
            methods = {}
            for event in trace:
                method = event.get('method', 'unknown')
                methods[method] = methods.get(method, 0) + 1
            
            print(f"  Event Types:")
            for method, count in sorted(methods.items(), key=lambda x: -x[1])[:5]:
                print(f"    - {method}: {count}")
    except Exception as e:
        print(f"[Starlight] Warning: Could not parse trace: {e}")
    
    # Open triage.html or report.html
    if os.path.exists(triage_file):
        print(f"\n[Starlight] Opening triage.html in browser...")
        webbrowser.open(f"file://{os.path.abspath(triage_file)}")
    elif os.path.exists(report_file):
        print(f"\n[Starlight] Opening report.html in browser...")
        webbrowser.open(f"file://{os.path.abspath(report_file)}")
    else:
        print("[Starlight] No triage.html or report.html found.")
        print(f"  Trace file is at: {trace_file}")
        return False
    
    return True

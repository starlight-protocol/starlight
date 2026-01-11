"""
Starlight CLI - Document Command
Generate Gherkin .feature files from mission traces.
"""

import os
import subprocess


def execute(trace_path: str = None, output: str = "generated"):
    """Generate a .feature file from mission trace."""
    
    # Default trace path
    if not trace_path:
        trace_path = os.path.join(os.getcwd(), 'mission_trace.json')
    
    # Resolve path
    if not os.path.isabs(trace_path):
        trace_path = os.path.join(os.getcwd(), trace_path)
    
    if not os.path.exists(trace_path):
        print(f"[Starlight] ERROR: Trace file not found: {trace_path}")
        return False
    
    print(f"[Starlight] 📝 Generating feature from: {trace_path}")
    
    script_content = f'''
const IntentRunner = require('./src/intent_runner');

const runner = new IntentRunner();
const outputPath = runner.documentMission({repr(trace_path)}, {repr(output)});
console.log(`[Document] ✅ Generated: ${{outputPath}}`);
'''
    
    script_path = os.path.join(os.getcwd(), '_document_temp_script.js')
    try:
        with open(script_path, 'w', encoding='utf-8') as f:
            f.write(script_content)
        
        result = subprocess.run(['node', script_path], cwd=os.getcwd())
        return result.returncode == 0
        
    finally:
        if os.path.exists(script_path):
            os.remove(script_path)

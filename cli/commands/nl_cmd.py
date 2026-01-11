"""
Starlight CLI - Natural Language Command
Execute automation directly from natural language instructions.
"""

import os
import sys
import subprocess


def execute(instruction: str, headless: bool = False):
    """Execute a natural language automation instruction."""
    
    print(f"[Starlight NLI] 🗣️ Executing: \"{instruction[:50]}{'...' if len(instruction) > 50 else ''}\"")
    
    # Generate a temporary script that uses executeNL
    script_content = f'''
const IntentRunner = require('./src/intent_runner');

async function run() {{
    const runner = new IntentRunner();
    
    try {{
        await runner.connect();
        console.log('[NLI] Connected to Hub');
        
        const results = await runner.executeNL({repr(instruction)});
        
        console.log('\\n[NLI] ✅ Execution complete!');
        console.log(`[NLI] Steps executed: ${{results.length}}`);
        
        await runner.finish('NLI execution complete');
    }} catch (error) {{
        console.error('[NLI] ❌ Execution failed:', error.message);
        runner.close();
        process.exit(1);
    }}
}}

run();
'''
    
    # Write temporary script
    script_path = os.path.join(os.getcwd(), '_nli_temp_script.js')
    try:
        with open(script_path, 'w', encoding='utf-8') as f:
            f.write(script_content)
        
        # Execute via starlight orchestrator
        starlight_path = os.path.join(os.getcwd(), 'bin', 'starlight.js')
        
        if not os.path.exists(starlight_path):
            print("[Starlight] ERROR: bin/starlight.js not found")
            return False
        
        cmd = ['node', starlight_path, script_path]
        if headless:
            cmd.append('--headless')
        
        result = subprocess.run(cmd, cwd=os.getcwd())
        return result.returncode == 0
        
    finally:
        # Cleanup temp script
        if os.path.exists(script_path):
            os.remove(script_path)


def status():
    """Check NLI parser status (Ollama availability, model, etc.)."""
    
    script_content = '''
const IntentRunner = require('./src/intent_runner');

async function checkStatus() {
    const runner = new IntentRunner();
    const status = await runner.getNLIStatus();
    
    console.log('\\n[NLI Status]');
    console.log(`  Enabled: ${status.enabled}`);
    console.log(`  Ollama Available: ${status.ollamaAvailable ? '✅ Yes' : '❌ No'}`);
    console.log(`  Model: ${status.model}`);
    console.log(`  Endpoint: ${status.endpoint}`);
    console.log(`  Fallback Enabled: ${status.fallbackEnabled}`);
    console.log(`  Fallback Mode: ${status.fallbackMode}`);
    
    if (status.availableModels && status.availableModels.length > 0) {
        console.log(`  Available Models: ${status.availableModels.join(', ')}`);
    }
}

checkStatus().catch(console.error);
'''
    
    script_path = os.path.join(os.getcwd(), '_nli_status_temp.js')
    try:
        with open(script_path, 'w', encoding='utf-8') as f:
            f.write(script_content)
        
        result = subprocess.run(['node', script_path], cwd=os.getcwd())
        return result.returncode == 0
        
    finally:
        if os.path.exists(script_path):
            os.remove(script_path)

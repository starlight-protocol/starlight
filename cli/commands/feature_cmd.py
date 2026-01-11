"""
Starlight CLI - Feature Command
Execute Gherkin .feature files.
"""

import os
import subprocess


def execute(feature_path: str, scenario: str = None, headless: bool = False):
    """Execute a Gherkin .feature file."""
    
    # Resolve path
    if not os.path.isabs(feature_path):
        feature_path = os.path.join(os.getcwd(), feature_path)
    
    if not os.path.exists(feature_path):
        print(f"[Starlight] ERROR: Feature file not found: {feature_path}")
        return False
    
    print(f"[Starlight] 📄 Executing feature: {feature_path}")
    
    # Generate execution script
    scenario_arg = f", {repr(scenario)}" if scenario else ""
    
    script_content = f'''
const IntentRunner = require('./src/intent_runner');

async function run() {{
    const runner = new IntentRunner();
    
    try {{
        await runner.connect();
        console.log('[Feature] Connected to Hub');
        
        const results = await runner.executeFeature({repr(feature_path)}{scenario_arg});
        
        console.log('\\n[Feature] ✅ Execution complete!');
        console.log(`[Feature] Steps executed: ${{results.length}}`);
        
        const passed = results.filter(r => r.success).length;
        const failed = results.filter(r => !r.success).length;
        console.log(`[Feature] Passed: ${{passed}}, Failed: ${{failed}}`);
        
        await runner.finish('Feature execution complete');
        
        if (failed > 0) {{
            process.exit(1);
        }}
    }} catch (error) {{
        console.error('[Feature] ❌ Execution failed:', error.message);
        runner.close();
        process.exit(1);
    }}
}}

run();
'''
    
    script_path = os.path.join(os.getcwd(), '_feature_temp_script.js')
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
        if os.path.exists(script_path):
            os.remove(script_path)

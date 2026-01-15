import starlight_protocol
from starlight_protocol import SentinelBase
import importlib.metadata
import os

class VerifySentinel(SentinelBase):
    async def on_pre_check(self, params, msg_id):
        return await self.send_clear()

try:
    print(f"📦 Package Source: {starlight_protocol.__file__}")
    
    # Try metadata version first
    try:
        meta_version = importlib.metadata.version("starlight-protocol")
        print(f"✅ Installed Metadata Version: {meta_version}")
    except:
        print("⚠️ Could not read metadata version")

    print(f"ℹ️ Internal __version__: {starlight_protocol.__version__}")
    
    sentinel = VerifySentinel(layer_name="VerifySentinel", priority=10, uri="ws://localhost:8080")
    print("✅ Sentinel instantiated successfully")
    print("✅ SDK Import & Runtime Check Passed!")
    
except Exception as e:
    print(f"❌ Verification Failed: {e}")
    import traceback
    traceback.print_exc()
    exit(1)

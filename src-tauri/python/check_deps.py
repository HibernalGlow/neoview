import sys

try:
    import fastapi
    print("✅ fastapi available")
except ImportError:
    print("❌ fastapi missing")
    sys.exit(1)

try:
    import uvicorn
    print("✅ uvicorn available")
except ImportError:
    print("❌ uvicorn missing")
    sys.exit(1)

try:
    import pyvips
    print("✅ pyvips available")
except ImportError:
    print("❌ pyvips missing")
    print("Install with: pip install pyvips")
    sys.exit(1)

print("\n✅ All Python dependencies are available!")
from seleniumbase import SB
try:
    with SB(uc=True, headless=True) as sb:
        print(f"Type of sb: {type(sb)}")
        print(f"Has .driver: {hasattr(sb, 'driver')}")
        if hasattr(sb, 'driver'):
            print(f"Type of sb.driver: {type(sb.driver)}")
except Exception as e:
    print(f"Error: {e}")

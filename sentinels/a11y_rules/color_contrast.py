"""
WCAG 1.4.3 - Color Contrast (Level AA)

Minimum contrast ratio requirements:
- Normal text: 4.5:1
- Large text (18pt+ or 14pt bold): 3:1

Reference: https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum.html
"""

import re
from typing import Dict, List, Any


class ColorContrastRule:
    """Check color contrast between foreground and background."""
    
    RULE_ID = "color-contrast"
    WCAG = "1.4.3"
    IMPACT = "serious"
    
    # Minimum contrast ratios
    MIN_RATIO_NORMAL = 4.5
    MIN_RATIO_LARGE = 3.0
    LARGE_TEXT_SIZE = 18  # pixels
    
    def check(self, elements: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Check color contrast for all text elements.
        
        Args:
            elements: List of elements with computed styles
            
        Returns:
            Dict with violations and passes count
        """
        violations = []
        passes = 0
        
        for element in elements:
            styles = element.get("styles", {})
            fg = styles.get("color")
            bg = styles.get("backgroundColor")
            text = element.get("text", "").strip()
            
            # Skip elements without text
            if not text or not fg or not bg:
                continue
                
            # Skip transparent backgrounds
            if "transparent" in bg.lower() or "rgba(0, 0, 0, 0)" in bg:
                continue
                
            ratio = self._calculate_contrast_ratio(fg, bg)
            font_size = self._parse_font_size(styles.get("fontSize", "16px"))
            
            min_ratio = self.MIN_RATIO_LARGE if font_size >= self.LARGE_TEXT_SIZE else self.MIN_RATIO_NORMAL
            
            if ratio < min_ratio:
                violations.append({
                    "rule": self.RULE_ID,
                    "wcag": self.WCAG,
                    "impact": self.IMPACT,
                    "selector": element.get("selector", "unknown"),
                    "message": f"Contrast ratio {ratio:.1f}:1 is below {min_ratio}:1 minimum",
                    "data": {
                        "ratio": round(ratio, 2),
                        "required": min_ratio,
                        "foreground": fg,
                        "background": bg
                    }
                })
            else:
                passes += 1
                
        return {"violations": violations, "passes": passes}
        
    def _calculate_contrast_ratio(self, fg_color: str, bg_color: str) -> float:
        """Calculate WCAG contrast ratio between two colors."""
        try:
            fg_lum = self._get_relative_luminance(fg_color)
            bg_lum = self._get_relative_luminance(bg_color)
            
            lighter = max(fg_lum, bg_lum)
            darker = min(fg_lum, bg_lum)
            
            return (lighter + 0.05) / (darker + 0.05)
        except Exception:
            return 21  # Assume passing if calculation fails
            
    def _get_relative_luminance(self, color: str) -> float:
        """
        Calculate relative luminance per WCAG 2.1.
        
        Formula from: https://www.w3.org/WAI/GL/wiki/Relative_luminance
        """
        # Parse rgb(r, g, b) or rgba(r, g, b, a) format
        match = re.match(r'rgba?\((\d+),\s*(\d+),\s*(\d+)', color)
        if not match:
            # Try hex format
            hex_match = re.match(r'#([0-9a-fA-F]{6})', color)
            if hex_match:
                hex_val = hex_match.group(1)
                r = int(hex_val[0:2], 16)
                g = int(hex_val[2:4], 16)
                b = int(hex_val[4:6], 16)
            else:
                return 0.5  # Default mid-luminance
        else:
            r, g, b = [int(x) for x in match.groups()]
            
        # Normalize to 0-1
        r, g, b = r / 255, g / 255, b / 255
        
        # Apply gamma correction
        r = r / 12.92 if r <= 0.03928 else ((r + 0.055) / 1.055) ** 2.4
        g = g / 12.92 if g <= 0.03928 else ((g + 0.055) / 1.055) ** 2.4
        b = b / 12.92 if b <= 0.03928 else ((b + 0.055) / 1.055) ** 2.4
        
        # Calculate luminance
        return 0.2126 * r + 0.7152 * g + 0.0722 * b
        
    def _parse_font_size(self, size_str: str) -> float:
        """Parse font size string to pixels."""
        match = re.match(r'(\d+(?:\.\d+)?)(px|pt|em|rem)?', size_str)
        if not match:
            return 16
            
        value = float(match.group(1))
        unit = match.group(2) or "px"
        
        if unit == "pt":
            return value * 1.333  # 1pt = 1.333px
        elif unit in ["em", "rem"]:
            return value * 16  # Assume 16px base
        return value

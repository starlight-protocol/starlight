"""
WCAG 1.1.1 - Non-text Content (Level A)

All non-text content must have a text alternative that serves
the equivalent purpose.

Reference: https://www.w3.org/WAI/WCAG21/Understanding/non-text-content.html
"""

from typing import Dict, List, Any


class ImageAltRule:
    """Check that images have appropriate alt text."""
    
    RULE_ID = "image-alt"
    WCAG = "1.1.1"
    IMPACT = "critical"
    
    def check(self, elements: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Check all images for alt attributes.
        
        Args:
            elements: List of DOM elements
            
        Returns:
            Dict with violations and passes count
        """
        violations = []
        passes = 0
        
        for element in elements:
            tag = element.get("tag", "").upper()
            
            if tag != "IMG":
                continue
                
            attrs = element.get("attributes", {})
            alt = attrs.get("alt")
            role = attrs.get("role")
            aria_label = attrs.get("aria-label")
            
            # Skip presentational images
            if role == "presentation" or role == "none":
                passes += 1
                continue
                
            # Check for alt attribute
            if alt is None:
                # Check for aria-label as alternative
                if aria_label:
                    passes += 1
                    continue
                    
                violations.append({
                    "rule": self.RULE_ID,
                    "wcag": self.WCAG,
                    "impact": self.IMPACT,
                    "selector": element.get("selector", "img"),
                    "message": "Image missing alt attribute",
                    "data": {
                        "src": attrs.get("src", "")[:100]
                    }
                })
            elif alt.strip() == "":
                # Empty alt is valid for decorative images
                # But we should check if it looks decorative
                if self._looks_decorative(element):
                    passes += 1
                else:
                    violations.append({
                        "rule": self.RULE_ID,
                        "wcag": self.WCAG,
                        "impact": "moderate",
                        "selector": element.get("selector", "img"),
                        "message": "Image has empty alt but may not be decorative",
                        "data": {
                            "src": attrs.get("src", "")[:100]
                        }
                    })
            else:
                # Has alt text
                # Check for unhelpful alt text
                if self._is_unhelpful_alt(alt):
                    violations.append({
                        "rule": self.RULE_ID,
                        "wcag": self.WCAG,
                        "impact": "minor",
                        "selector": element.get("selector", "img"),
                        "message": f"Alt text '{alt}' is not descriptive",
                        "data": {"alt": alt}
                    })
                else:
                    passes += 1
                    
        return {"violations": violations, "passes": passes}
        
    def _looks_decorative(self, element: Dict[str, Any]) -> bool:
        """Heuristic to determine if image is decorative."""
        attrs = element.get("attributes", {})
        
        # Small images are often icons/decorative
        width = attrs.get("width", "")
        height = attrs.get("height", "")
        
        try:
            if int(width) < 20 and int(height) < 20:
                return True
        except (ValueError, TypeError):
            pass
            
        # Check for common decorative patterns
        src = attrs.get("src", "").lower()
        decorative_patterns = ["spacer", "blank", "pixel", "dot", "bullet"]
        
        return any(pattern in src for pattern in decorative_patterns)
        
    def _is_unhelpful_alt(self, alt: str) -> bool:
        """Check if alt text is unhelpful."""
        unhelpful = [
            "image", "picture", "photo", "img",
            "graphic", "icon", "logo",
            "untitled", "placeholder"
        ]
        
        alt_lower = alt.lower().strip()
        
        # Exact match to unhelpful terms
        if alt_lower in unhelpful:
            return True
            
        # File extension patterns
        if alt_lower.endswith(('.jpg', '.jpeg', '.png', '.gif', '.svg')):
            return True
            
        return False

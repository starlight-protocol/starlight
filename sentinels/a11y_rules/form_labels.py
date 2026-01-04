"""
WCAG 1.3.1 - Info and Relationships (Level A)

Form controls must have associated labels that describe their purpose.

Reference: https://www.w3.org/WAI/WCAG21/Understanding/info-and-relationships.html
"""

from typing import Dict, List, Any


class FormLabelsRule:
    """Check that form inputs have accessible labels."""
    
    RULE_ID = "form-labels"
    WCAG = "1.3.1"
    IMPACT = "serious"
    
    # Input types that need labels
    LABELABLE_TYPES = [
        "text", "email", "password", "tel", "url", "number",
        "search", "date", "time", "datetime-local", "month", "week",
        "color", "range", "file"
    ]
    
    # Input types that don't need labels
    SKIP_TYPES = ["hidden", "submit", "button", "image", "reset"]
    
    def check(self, elements: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Check all form inputs for associated labels.
        
        Args:
            elements: List of DOM elements
            
        Returns:
            Dict with violations and passes count
        """
        violations = []
        passes = 0
        
        # Collect all label elements for lookups
        labels = {}
        for el in elements:
            if el.get("tag", "").upper() == "LABEL":
                for_attr = el.get("attributes", {}).get("for")
                if for_attr:
                    labels[for_attr] = el.get("text", "")
                    
        for element in elements:
            tag = element.get("tag", "").upper()
            attrs = element.get("attributes", {})
            
            # Check input, select, textarea
            if tag not in ["INPUT", "SELECT", "TEXTAREA"]:
                continue
                
            input_type = attrs.get("type", "text").lower()
            
            # Skip types that don't need labels
            if input_type in self.SKIP_TYPES:
                continue
                
            # Check for various labeling methods
            has_label = False
            label_method = None
            
            # 1. Explicit label via 'for' attribute
            element_id = attrs.get("id")
            if element_id and element_id in labels:
                has_label = True
                label_method = "explicit-label"
                
            # 2. aria-label
            if attrs.get("aria-label"):
                has_label = True
                label_method = "aria-label"
                
            # 3. aria-labelledby
            if attrs.get("aria-labelledby"):
                has_label = True
                label_method = "aria-labelledby"
                
            # 4. title attribute (less preferred)
            if attrs.get("title"):
                has_label = True
                label_method = "title"
                
            # 5. placeholder (not sufficient alone, but note it)
            placeholder = attrs.get("placeholder")
            
            if has_label:
                passes += 1
            else:
                message = f"{tag.lower()} element missing label"
                if placeholder:
                    message += f" (has placeholder: '{placeholder}')"
                    
                violations.append({
                    "rule": self.RULE_ID,
                    "wcag": self.WCAG,
                    "impact": self.IMPACT,
                    "selector": element.get("selector", tag.lower()),
                    "message": message,
                    "data": {
                        "type": input_type,
                        "id": element_id,
                        "placeholder": placeholder
                    }
                })
                
        return {"violations": violations, "passes": passes}

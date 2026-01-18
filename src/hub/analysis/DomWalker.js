
/**
 * Phase 2: DomWalker
 * O(N) Hybrid TreeWalker for Shadow DOM Traversal.
 * 
 * Strategy:
 * 1. Use TreeWalker for fast main-document traversal.
 * 2. Detect 'shadowRoot' on elements.
 * 3. Recursively create new TreeWalkers for shadow roots.
 * 
 * Complexity: O(N) - Visits each node exactly once.
 */
class DomWalker {
    /**
     * Traverses the DOM tree efficiently, piercing Shadow DOMs.
     * @param {Node} root 
     * @param {Function} callback 
     */
    static walk(root, callback) {
        // Optimization: FILTER_ACCEPT is 1
        const walker = document.createTreeWalker(
            root,
            NodeFilter.SHOW_ELEMENT,
            { acceptNode: (node) => 1 }
        );

        let currentNode = walker.currentNode;
        while (currentNode) {
            // 1. Process Node
            callback(currentNode);

            // 2. Pierce Shadow DOM (Recursive Step)
            if (currentNode.shadowRoot) {
                // Ensure we pass the ShadowRoot itself, not the host, to avoid infinite loop
                // But typically shadowRoot IS a DocumentFragment, which TreeWalker accepts.
                DomWalker.walk(currentNode.shadowRoot, callback);
            }

            currentNode = walker.nextNode();
        }
    }
}

module.exports = { DomWalker };
